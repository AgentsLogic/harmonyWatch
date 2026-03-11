import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { upsertSubscription, syncUserRoleFromSubscriptions } from '@/lib/services/subscription-service';
import { revenueCatEntitlementToUnifiedParams } from '@/app/api/webhooks/revenuecat/route';

const supabaseAuth = createClient(
	publicConfig.NEXT_PUBLIC_SUPABASE_URL,
	publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * POST /api/payments/debug-restore-subscription
 * Debug endpoint to manually check RevenueCat and restore subscription status
 * Only available in development or for admins
 */
export async function POST(request: NextRequest) {
	try {
		// Require admin auth unconditionally
		const accessToken = request.cookies.get('sb-access-token')?.value;
		if (!accessToken) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const {
			data: { user },
			error: authError,
		} = await supabaseAuth.auth.getUser(accessToken);

		if (authError || !user) {
			return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
		}

		const { data: profile } = await supabaseAdmin
			.from('user_profiles')
			.select('user_type')
			.eq('user_id', user.id)
			.single();

		if (profile?.user_type !== 'admin') {
			return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
		}

		// Query RevenueCat API to check subscription status
		const revenueCatApiKey = serverConfig.REVENUECAT_API_KEY;
		if (!revenueCatApiKey) {
			return NextResponse.json(
				{ error: 'RevenueCat API key not configured' },
				{ status: 500 }
			);
		}

		// Get subscriber info from RevenueCat
		// First try with user ID
		let revenueCatResponse = await fetch(
			`https://api.revenuecat.com/v1/subscribers/${user.id}`,
			{
				headers: {
					'Authorization': `Bearer ${revenueCatApiKey}`,
					'Content-Type': 'application/json',
				},
			}
		);

		let revenueCatData: any = null;
		let subscriber: any = null;

		if (revenueCatResponse.ok) {
			revenueCatData = await revenueCatResponse.json();
			subscriber = revenueCatData.subscriber;
		}

		// If no subscriptions found, try to identify/transfer from anonymous ID
		const hasNoSubscriptions = !subscriber || (
			Object.keys(subscriber?.subscriptions || {}).length === 0 &&
			Object.keys(subscriber?.non_subscriptions || {}).length === 0 &&
			Object.keys(subscriber?.entitlements || {}).length === 0
		);

		if (hasNoSubscriptions && user.email) {
			
			// Set email attribute and identify user to transfer subscriptions from anonymous ID
			try {
				// Set email attribute
				await fetch(
					`https://api.revenuecat.com/v1/subscribers/${user.id}/attributes`,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${revenueCatApiKey}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							$email: { value: user.email }
						}),
					}
				);

				// Identify user - RevenueCat should find subscriptions by email and transfer them
				const identifyResponse = await fetch(
					`https://api.revenuecat.com/v1/subscribers/${user.id}/identify`,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${revenueCatApiKey}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							app_user_id: user.id,
						}),
					}
				);

				if (identifyResponse.ok) {
					// Re-query after identification
					revenueCatResponse = await fetch(
						`https://api.revenuecat.com/v1/subscribers/${user.id}`,
						{
							headers: {
								'Authorization': `Bearer ${revenueCatApiKey}`,
								'Content-Type': 'application/json',
							},
						}
					);

					if (revenueCatResponse.ok) {
						revenueCatData = await revenueCatResponse.json();
						subscriber = revenueCatData.subscriber;
					}
				}
			} catch (identifyError) {
				console.error('[Debug Restore] Error during identify:', identifyError);
			}
		}

		if (!revenueCatResponse || !revenueCatResponse.ok) {
			console.error('[Debug Restore] Failed to fetch subscriber:', revenueCatResponse?.status);
			return NextResponse.json(
				{ 
					error: 'Unable to access RevenueCat subscription details. The subscription might be under an anonymous ID. Try manually transferring it in RevenueCat dashboard.',
					hasActiveSubscription: false,
					suggestion: 'In RevenueCat dashboard, find the subscription by email and transfer it to user ID: ' + user.id
				},
				{ status: 500 }
			);
		}

		if (!revenueCatData) {
			revenueCatData = await revenueCatResponse.json();
			subscriber = revenueCatData.subscriber;
		}

		const entitlements = subscriber?.entitlements || {};
		const now = new Date();

		// Find active entitlement
		const activeEntitlement = Object.values(entitlements).find((ent: any) => {
			if (ent.expires_date) {
				const expiresDate = new Date(ent.expires_date);
				return expiresDate > now && (ent.is_active === true || ent.is_active === undefined);
			}
			return ent.is_active === true;
		}) as any | undefined;

		if (!activeEntitlement) {
			// Check if subscriber exists but has no entitlements (might be anonymous ID issue)
			const subscriberExists = !!subscriber;
			const hasSubscriptions = Object.keys(subscriber?.subscriptions || {}).length > 0 || 
				Object.keys(subscriber?.non_subscriptions || {}).length > 0;
			
			return NextResponse.json({
				error: subscriberExists && !hasSubscriptions
					? `No active subscription found. The subscription might be under an anonymous RevenueCat ID (like $RCAnonymousID:...). To fix this, go to RevenueCat Dashboard → Customers → Find customer by email (${user.email}) → Transfer subscription to user ID: ${user.id}`
					: 'No active subscription found in RevenueCat for this user ID.',
				hasActiveSubscription: false,
				subscriberExists: subscriberExists,
				hasSubscriptions: hasSubscriptions,
				userEmail: user.email,
				userId: user.id,
			});
		}

		// Find store type from subscriptions
		const subscriptions = subscriber?.subscriptions || {};
		const nonSubscriptions = subscriber?.non_subscriptions || {};
		const allSubs = { ...subscriptions, ...nonSubscriptions };
		const matchingSub = Object.values(allSubs).find((sub: any) => {
			return sub.product_identifier === activeEntitlement.product_identifier;
		}) as any;
		const store = matchingSub?.store || null;

		// Convert to unified subscription params and upsert
		const params = revenueCatEntitlementToUnifiedParams(user.id, activeEntitlement, store);
		if (!params) {
			return NextResponse.json(
				{ error: 'Failed to convert entitlement to subscription params' },
				{ status: 500 }
			);
		}

		await upsertSubscription(params);

		// Sync user role from subscriptions table (will update user_type and signup_status)
		await syncUserRoleFromSubscriptions(user.id);

		// Get updated profile to return
		const { data: updatedProfile, error: profileError } = await supabaseAdmin
			.from('user_profiles')
			.select('user_type')
			.eq('user_id', user.id)
			.single();

		if (profileError) {
			console.error('[Debug Restore] Failed to fetch updated profile:', profileError);
			return NextResponse.json(
				{ error: 'Failed to fetch updated profile' },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			message: 'Subscription restored successfully',
			hasActiveSubscription: true,
			subscription: {
				plan: params.plan,
				expiresAt: params.expires_at,
				userType: updatedProfile.user_type,
			},
			revenueCatData: {
				productId: activeEntitlement.product_identifier,
				expiresDate: activeEntitlement.expires_date,
				isActive: activeEntitlement.is_active,
			},
		});
	} catch (error) {
		console.error('[Debug Restore] Error:', error);
		return NextResponse.json(
			{ error: 'Failed to restore subscription' },
			{ status: 500 }
		);
	}
}
