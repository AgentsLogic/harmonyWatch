import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { assertStripeClient, planFromPriceId, epochSecondsToIso, stripeMetadataToRecord } from '@/lib/services/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import {
	upsertSubscription,
	syncUserRoleFromSubscriptions,
	mapStripeStatus,
	type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';

const supabaseAuth = createClient(
	publicConfig.NEXT_PUBLIC_SUPABASE_URL,
	publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Convert Stripe subscription to unified subscription params
 */
function stripeSubscriptionToUnifiedParams(subscription: Stripe.Subscription): UpsertSubscriptionParams | null {
	const userId = subscription.metadata?.supabase_user_id;
	if (!userId) {
		console.warn('[Stripe] Subscription missing supabase_user_id metadata', subscription.id);
		return null;
	}

	const subscriptionWithPeriods = subscription as Stripe.Subscription & {
		current_period_start?: number | null;
		current_period_end?: number | null;
		cancel_at?: number | null;
		canceled_at?: number | null;
	};

	// Get plan from metadata or price ID
	const planFromMetadata = subscription.metadata?.plan as 'monthly' | 'yearly' | undefined;
	let subscriptionPlan: 'monthly' | 'yearly' | null = null;
	if (planFromMetadata && (planFromMetadata === 'monthly' || planFromMetadata === 'yearly')) {
		subscriptionPlan = planFromMetadata;
	} else {
		const priceId = subscription.items.data[0]?.price.id;
		if (priceId) {
			const plan = planFromPriceId(priceId);
			if (plan) {
				subscriptionPlan = plan;
			}
		}
	}

	return {
		user_id: userId,
		provider: 'stripe',
		external_id: subscription.id,
		status: mapStripeStatus(subscription.status),
		plan: subscriptionPlan,
		current_period_start: epochSecondsToIso(subscriptionWithPeriods.current_period_start ?? null),
		current_period_end: epochSecondsToIso(subscriptionWithPeriods.current_period_end ?? null),
		expires_at: epochSecondsToIso(subscriptionWithPeriods.current_period_end ?? null),
		cancel_at: epochSecondsToIso(subscriptionWithPeriods.cancel_at ?? null),
		canceled_at: epochSecondsToIso(subscriptionWithPeriods.canceled_at ?? null),
		provider_data: stripeMetadataToRecord(subscription.metadata ?? null),
	};
}

/**
 * Debug endpoint to check subscription status and manually update user if needed
 * GET /api/payments/check-subscription?subscription_id=sub_xxx
 */
export async function GET(request: NextRequest) {
	try {
		const accessToken = request.headers.get('authorization')?.startsWith('Bearer ')
			? request.headers.get('authorization')!.substring(7)
			: request.cookies.get('sb-access-token')?.value ?? null;

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

		const subscriptionId = request.nextUrl.searchParams.get('subscription_id');

		if (!subscriptionId) {
			return NextResponse.json({ error: 'Missing subscription_id parameter' }, { status: 400 });
		}

		const stripe = assertStripeClient();

		// Retrieve subscription from Stripe
		const subscription = await stripe.subscriptions.retrieve(subscriptionId);
		
		// Check if subscription belongs to this user
		const userId = subscription.metadata?.supabase_user_id;
		if (userId !== user.id) {
			return NextResponse.json({ error: 'Subscription does not belong to this user' }, { status: 403 });
		}

		// Check current user profile and subscription access
		const [profile, subscriptionAccess] = await Promise.all([
			supabaseAdmin
				.from('user_profiles')
				.select('user_type, signup_status')
				.eq('user_id', user.id)
				.single(),
			checkSubscriptionAccess(user.id),
		]);

		// Convert Stripe subscription to unified format and upsert
		const unifiedParams = stripeSubscriptionToUnifiedParams(subscription);
		let updated = false;
		
		if (unifiedParams) {
			// Upsert subscription into unified table
			await upsertSubscription(unifiedParams);
			
			// Sync user role based on unified subscriptions
			await syncUserRoleFromSubscriptions(user.id);
			
			// Check if role changed
			const newAccess = await checkSubscriptionAccess(user.id);
			updated = newAccess.hasAccess !== subscriptionAccess.hasAccess;
		}

		// Get updated subscription access after sync
		const finalAccess = await checkSubscriptionAccess(user.id);

		return NextResponse.json({
			subscription: {
				id: subscription.id,
				status: subscription.status,
				metadata: subscription.metadata,
				unified_status: unifiedParams?.status || null,
			},
			userProfile: profile.data,
			unifiedSubscription: finalAccess.subscription,
			hasAccess: finalAccess.hasAccess,
			shouldBeSubscriber: finalAccess.hasAccess,
			updated,
		});
	} catch (error) {
		console.error('[Stripe] Failed to check subscription', error);
		return NextResponse.json(
			{ error: 'Unable to check subscription' },
			{ status: 500 }
		);
	}
}

