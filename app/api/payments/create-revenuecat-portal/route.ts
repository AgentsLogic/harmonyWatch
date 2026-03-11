import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/env';
import { supabase as supabaseAuth } from '@/lib/supabase';

export async function POST(request: NextRequest) {
	try {
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

		// Query RevenueCat API to get subscription details and management URL
		// Use sandbox key in development mode if available
		const isDevelopment = process.env.NODE_ENV === 'development';
		const useSandbox = isDevelopment || serverConfig.REVENUECAT_USE_SANDBOX === true;
		
		// Try to get sandbox key if in development (check for REVENUECAT_SANDBOX_API_KEY)
		let revenueCatApiKey: string | null = serverConfig.REVENUECAT_API_KEY;
		let apiKeySource = 'production';
		if (useSandbox && process.env.REVENUECAT_SANDBOX_API_KEY) {
			revenueCatApiKey = process.env.REVENUECAT_SANDBOX_API_KEY;
			apiKeySource = 'sandbox';
		} else {
		}
		
		if (!revenueCatApiKey) {
			return NextResponse.json(
				{ error: 'RevenueCat API key not configured' },
				{ status: 500 }
			);
		}


		// Get subscriber info from RevenueCat
		// First, try with the user's ID
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
		} else {
			console.warn('[RevenueCat Portal] Failed to fetch subscriber by user ID:', revenueCatResponse.status);
		}

		// If no subscriptions found with user ID, try to identify/transfer from anonymous ID
		// RevenueCat may have created the subscription with an anonymous ID
		// We can use the identify endpoint to transfer it to the real user ID
		const hasNoSubscriptions = !subscriber || (
			Object.keys(subscriber?.subscriptions || {}).length === 0 &&
			Object.keys(subscriber?.non_subscriptions || {}).length === 0 &&
			Object.keys(subscriber?.entitlements || {}).length === 0
		);

		if (hasNoSubscriptions && user.email) {
			
			// RevenueCat's identify endpoint can transfer subscriptions from anonymous IDs
			// We'll identify the user with email attribute so RevenueCat can find and transfer subscriptions
			try {
				// First, set the email attribute on the current user ID
				// This helps RevenueCat match subscriptions
				const setAttributesResponse = await fetch(
					`https://api.revenuecat.com/v1/subscribers/${user.id}/attributes`,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${revenueCatApiKey}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							$email: {
								value: user.email
							}
						}),
					}
				);

				if (setAttributesResponse.ok) {
				}

				// Now identify the user - RevenueCat should automatically find subscriptions by email
				// and transfer them from anonymous IDs to this user ID
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
				} else {
					console.warn('[RevenueCat Portal] Identify request failed:', identifyResponse.status);
				}
			} catch (identifyError) {
				console.error('[RevenueCat Portal] Error during identify:', identifyError);
			}
		}

		if (!revenueCatResponse || !revenueCatResponse.ok) {
			console.error('[RevenueCat Portal] Failed to fetch subscriber after all attempts:', revenueCatResponse?.status);
			return NextResponse.json(
				{ error: 'Unable to access subscription details' },
				{ status: 500 }
			);
		}

		if (!revenueCatData) {
			revenueCatData = await revenueCatResponse.json();
			subscriber = revenueCatData.subscriber;
		}

		// Check entitlements as well - they might contain subscription info
		const entitlements = subscriber?.entitlements || {};
		const activeEntitlements = Object.entries(entitlements).filter(([key, ent]: [string, any]) => {
			if (ent.expires_date) {
				const expiresDate = new Date(ent.expires_date);
				return expiresDate > new Date() && (ent.is_active === true || ent.is_active === undefined);
			}
			return ent.is_active === true;
		});


		// First, check if management_url exists at the subscriber level
		if (subscriber?.management_url) {
			return NextResponse.json({ url: subscriber.management_url }, { status: 200 });
		}

		// Find web subscription (stripe, rc_billing, promotional)
		// Check subscriptions, non_subscriptions, and active entitlements
		const subscriptions = subscriber?.subscriptions || {};
		const nonSubscriptions = subscriber?.non_subscriptions || {};

		// Check all subscriptions for web stores
		let webSub = Object.values(subscriptions).find((sub: any) => {
			const store = sub.store?.toLowerCase();
			return store === 'stripe' || store === 'rc_billing' || store === 'promotional';
		}) as any;

		if (!webSub) {
			webSub = Object.values(nonSubscriptions).find((sub: any) => {
				const store = sub.store?.toLowerCase();
				return store === 'stripe' || store === 'rc_billing' || store === 'promotional';
			}) as any;
		}

		// If still not found, check active entitlements for web billing
		if (!webSub && activeEntitlements.length > 0) {
			const webEntitlement = activeEntitlements.find(([key, ent]: [string, any]) => {
				const store = ent.store?.toLowerCase();
				return store === 'stripe' || store === 'rc_billing' || store === 'promotional';
			});
			
			if (webEntitlement) {
				const [entKey, ent] = webEntitlement;
				const entitlement = ent as any; // Type assertion for RevenueCat entitlement object
				// Create a subscription-like object from entitlement
				webSub = {
					store: entitlement.store,
					management_url: entitlement.management_url || subscriber?.management_url,
					product_identifier: entitlement.product_identifier,
					is_sandbox: entitlement.is_sandbox
				};
			}
		}


		// If we found a web subscription, use its management_url
		if (webSub?.management_url) {
			return NextResponse.json({ url: webSub.management_url }, { status: 200 });
		}

		// If no web subscription found, check if there are any active subscriptions
		// (might be iOS subscription, but we should still try to get management_url)
		const allSubscriptions = { ...subscriptions, ...nonSubscriptions };
		const anySub = Object.values(allSubscriptions).find((sub: any) => {
			return sub.management_url;
		}) as any;


		if (anySub?.management_url) {
			return NextResponse.json({ url: anySub.management_url }, { status: 200 });
		}

		// Check if this is an iOS subscription
		const hasIOSSubscription = Object.values(allSubscriptions).some((sub: any) => {
			return sub.store?.toLowerCase() === 'app_store';
		});


		// If we still don't have a management_url, return a helpful error
		if (hasIOSSubscription) {
			return NextResponse.json(
				{ 
					error: 'iOS subscriptions must be managed through Apple Settings. Go to Settings → App Store → Subscriptions → Harmony.',
					isIOSSubscription: true 
				},
				{ status: 400 }
			);
		}

		// Check if this is a sandbox subscription
		const isSandbox = Object.values({ ...subscriptions, ...nonSubscriptions }).some((s: any) => s.is_sandbox === true) ||
			Object.values(entitlements).some((ent: any) => ent.is_sandbox === true);

		// If no subscriptions found at all, the subscription might be under a different app_user_id
		const hasNoSubscriptionsFinal = Object.keys(subscriptions).length === 0 && 
			Object.keys(nonSubscriptions).length === 0 && 
			Object.keys(entitlements).length === 0;

		let errorMessage = 'Customer portal URL not available.';
		if (hasNoSubscriptionsFinal) {
			errorMessage = 'No subscription found in RevenueCat for this user. This might mean: (1) The subscription was created with a different user ID, (2) The subscription is in a different RevenueCat app, or (3) The API key environment doesn\'t match the subscription environment. Try using the "Debug: Check RevenueCat Subscription" button to diagnose.';
		} else if (isSandbox) {
			errorMessage = 'Customer portal is not available for sandbox/test subscriptions. Sandbox subscriptions are for testing only and do not support the customer portal. Please use a production subscription to access the customer portal.';
		} else {
			errorMessage = 'Customer portal URL not available. This may be because your subscription is not a Web Billing subscription, or the portal has not been configured. Please contact support.';
		}

		return NextResponse.json(
			{ 
				error: errorMessage,
				requiresWebBilling: true,
				isSandbox: isSandbox,
				hasNoSubscriptions: hasNoSubscriptionsFinal,
				debug_info: {
					has_subscriptions: Object.keys(subscriptions).length > 0,
					has_non_subscriptions: Object.keys(nonSubscriptions).length > 0,
					has_entitlements: Object.keys(entitlements).length > 0,
					active_entitlements: activeEntitlements.length,
					subscription_stores: Object.values({ ...subscriptions, ...nonSubscriptions }).map((s: any) => s.store),
					entitlement_stores: Object.values(entitlements).map((ent: any) => ent.store),
					api_key_source: apiKeySource,
					queried_user_id: user.id,
					subscriber_id: subscriber?.original_app_user_id
				}
			},
			{ status: 400 }
		);
	} catch (error) {
		console.error('[RevenueCat Portal] Failed to get portal URL:', error);
		return NextResponse.json(
			{ error: 'Unable to open customer portal' },
			{ status: 500 }
		);
	}
}

