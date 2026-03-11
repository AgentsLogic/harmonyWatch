import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
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
 * Cancel a subscription directly via Stripe API
 * According to Stripe docs: https://docs.stripe.com/api/subscriptions/cancel
 * This cancels at the end of the current billing period (recommended approach)
 */
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

		// Check subscription access using unified service
		const subscriptionAccess = await checkSubscriptionAccess(user.id);

		if (!subscriptionAccess.hasAccess || !subscriptionAccess.subscription) {
			return NextResponse.json(
				{ error: 'No active subscription found' },
				{ status: 400 }
			);
		}

		const activeSubscription = subscriptionAccess.subscription;

		// If user has a Stripe subscription, cancel it via Stripe API
		if (activeSubscription.provider === 'stripe') {
			const stripe = assertStripeClient();

			// Cancel the subscription at the end of the current billing period
			// This is the recommended approach - user keeps access until period ends
			// See: https://docs.stripe.com/api/subscriptions/cancel
			const canceledSubscriptionResponse = await stripe.subscriptions.cancel(
				activeSubscription.external_id,
				{
					// Don't cancel immediately - cancel at period end (default behavior)
					// This allows user to keep access until current_period_end
				}
			);
			
			// Type assertion to ensure we have a Subscription object
			const canceledSubscription = canceledSubscriptionResponse as Stripe.Subscription;
			const sub = canceledSubscription as any;

			// Update unified subscription table with canceled subscription status
			const unifiedParams = stripeSubscriptionToUnifiedParams(canceledSubscription);
			if (unifiedParams) {
				await upsertSubscription(unifiedParams);
				// Sync user role (will remain subscriber until period ends)
				await syncUserRoleFromSubscriptions(user.id);
			}

			// Note: We don't update user_type to 'free' immediately
			// The subscription will remain active until current_period_end
			// The webhook will handle updating user_type when the subscription actually ends

			return NextResponse.json({
				success: true,
				message: 'Subscription canceled successfully',
				cancel_at_period_end: sub.cancel_at_period_end,
				current_period_end: sub.current_period_end
					? new Date(sub.current_period_end * 1000).toISOString()
					: activeSubscription.expires_at,
			});
		}

		// If not Stripe, this is a RevenueCat subscription
		// Check if it's a RevenueCat Web (Stripe) subscription or iOS/Android subscription
		if (activeSubscription.provider !== 'revenuecat_web' && activeSubscription.provider !== 'revenuecat_ios') {
			return NextResponse.json(
				{ error: 'Unsupported subscription provider for cancellation' },
				{ status: 400 }
			);
		}

		// Query RevenueCat API to determine subscription platform and cancel if web
		// Note: For canceling subscriptions, we need the SECRET API KEY (not public key)
		// The secret key is used for server-side operations like canceling subscriptions
		const revenueCatApiKey = serverConfig.REVENUECAT_API_KEY;
		if (!revenueCatApiKey) {
			console.error('[Cancel Subscription] RevenueCat Secret API Key not configured. Set REVENUECAT_API_KEY environment variable with your Secret API Key.');
			return NextResponse.json(
				{ error: 'RevenueCat API not configured. Please contact support.' },
				{ status: 500 }
			);
		}

		try {
			const revenueCatResponse = await fetch(
				`https://api.revenuecat.com/v1/subscribers/${user.id}`,
				{
					headers: {
						'Authorization': `Bearer ${revenueCatApiKey}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (!revenueCatResponse.ok) {
				const errorText = await revenueCatResponse.text().catch(() => '');
				console.error('[Cancel Subscription] RevenueCat API error:', {
					status: revenueCatResponse.status,
					statusText: revenueCatResponse.statusText,
					error: errorText,
				});
				
				// 403 Forbidden usually means the API key doesn't have the right permissions
				if (revenueCatResponse.status === 403) {
					console.error('[Cancel Subscription] API key lacks required permissions. Make sure Customer Information permissions are set to "Read & write" in RevenueCat dashboard.');
					// Fall through to use management_url approach instead
					throw new Error('API_PERMISSION_DENIED');
				}
				
				throw new Error(`RevenueCat API returned ${revenueCatResponse.status}`);
			}

			const revenueCatData = await revenueCatResponse.json();
			const subscriber = revenueCatData.subscriber;
			const entitlements = subscriber?.entitlements || {};
			
			// Find active entitlement
			const now = new Date();
			const activeEntitlement = Object.values(entitlements).find((ent: any) => {
				const expiresDate = ent.expires_date ? new Date(ent.expires_date) : null;
				const isExpired = expiresDate ? expiresDate <= now : false;
				return (ent.is_active === true || (ent.is_active === undefined && !isExpired)) && !isExpired;
			}) as any;

			if (!activeEntitlement) {
				return NextResponse.json(
					{ error: 'No active subscription found' },
					{ status: 400 }
				);
			}

			// Check for web subscription in multiple places
			// RevenueCat Web Billing subscriptions are typically in non_subscriptions with store: 'stripe'
			const nonSubscriptions = subscriber?.non_subscriptions || {};
			const subscriptions = subscriber?.subscriptions || {};
			const latestTransaction = activeEntitlement.latest_transaction;
			
			// Check if there's a web subscription in non_subscriptions
			// RevenueCat Web Billing uses 'rc_billing' as the store identifier
			const webSubInNonSubs = Object.values(nonSubscriptions).find((sub: any) => {
				const store = sub.store?.toLowerCase();
				return store === 'stripe' || store === 'promotional' || store === 'rc_billing';
			}) as any;
			
			// Check if there's a web subscription in subscriptions
			const webSubInSubs = Object.values(subscriptions).find((sub: any) => {
				const store = sub.store?.toLowerCase();
				return store === 'stripe' || store === 'promotional' || store === 'rc_billing';
			}) as any;
			
			// Check latest transaction store
			const latestTransactionStore = latestTransaction?.store?.toLowerCase();
			
			// Check if there are any iOS/Android subscriptions (if not, and we have a subscription, it's likely web)
			const hasIOSSubscription = Object.values(nonSubscriptions).some((sub: any) => 
				sub.store?.toLowerCase() === 'app_store'
			) || Object.values(subscriptions).some((sub: any) => 
				sub.store?.toLowerCase() === 'app_store'
			);
			
			const hasAndroidSubscription = Object.values(nonSubscriptions).some((sub: any) => 
				sub.store?.toLowerCase() === 'play_store'
			) || Object.values(subscriptions).some((sub: any) => 
				sub.store?.toLowerCase() === 'play_store'
			);
			
			// Determine if this is a web subscription
			// Web if: explicitly has Stripe/rc_billing store, OR no iOS/Android subscription exists (likely web)
			const isWebSubscription = webSubInNonSubs || webSubInSubs || 
			                          latestTransactionStore === 'stripe' || 
			                          latestTransactionStore === 'promotional' ||
			                          latestTransactionStore === 'rc_billing' ||
			                          (!hasIOSSubscription && !hasAndroidSubscription && (Object.keys(nonSubscriptions).length > 0 || Object.keys(subscriptions).length > 0));
			
			if (isWebSubscription) {
				// This is a RevenueCat Web subscription - we can cancel it via API
				// According to RevenueCat docs, we need the store_transaction_id
				// This can be found in various places depending on the subscription structure
				let storeTransactionId: string | null = null;
				
				// Helper function to extract transaction ID from a subscription object
				const extractTransactionId = (sub: any): string | null => {
					if (!sub) return null;
					
					// Try all possible field names for transaction ID
					return sub.store_transaction_id || 
					       sub.transaction_id || 
					       sub.id || 
					       sub.original_transaction_id ||
					       sub.store_transaction_identifier ||
					       // For Stripe, might be in purchase_date or other fields
					       (sub.purchase_date && typeof sub.purchase_date === 'string' ? sub.purchase_date : null);
				};
				
				// First, try to get from explicit web subscription in non_subscriptions
				if (webSubInNonSubs) {
					storeTransactionId = extractTransactionId(webSubInNonSubs);
					
					// Also check if it's nested in a transactions array
					if (!storeTransactionId && webSubInNonSubs.transactions && Array.isArray(webSubInNonSubs.transactions)) {
						const latestTrans = webSubInNonSubs.transactions[webSubInNonSubs.transactions.length - 1];
						storeTransactionId = extractTransactionId(latestTrans);
					}
				}
				
				// If not found, try explicit web subscription in subscriptions (most common for rc_billing)
				if (!storeTransactionId && webSubInSubs) {
					storeTransactionId = extractTransactionId(webSubInSubs);
					
					if (!storeTransactionId && webSubInSubs.transactions && Array.isArray(webSubInSubs.transactions)) {
						const latestTrans = webSubInSubs.transactions[webSubInSubs.transactions.length - 1];
						storeTransactionId = extractTransactionId(latestTrans);
					}
				}
				
				// If still not found and we detected web via fallback (no iOS/Android), 
				// try to get from any subscription in non_subscriptions
				if (!storeTransactionId && !hasIOSSubscription && !hasAndroidSubscription) {
					// Try all subscriptions in non_subscriptions
					// The store_transaction_identifier might be the KEY of the subscription object
					for (const [key, sub] of Object.entries(nonSubscriptions)) {
						// First try extracting from the subscription object
						storeTransactionId = extractTransactionId(sub as any);
						
						// If not found, try the key itself as transaction ID (common pattern)
						if (!storeTransactionId) {
							storeTransactionId = key;
						}
						
						// Check transactions array
						const subAny = sub as any;
						if (subAny.transactions && Array.isArray(subAny.transactions)) {
							for (const trans of subAny.transactions) {
								const transId = extractTransactionId(trans);
								if (transId) {
									storeTransactionId = transId;
									break;
								}
							}
						}
						if (storeTransactionId) break;
					}
					
					// If still not found, try subscriptions
					if (!storeTransactionId) {
						for (const [key, sub] of Object.entries(subscriptions)) {
							// First try extracting from the subscription object
							storeTransactionId = extractTransactionId(sub as any);
							
							// If not found, try the key itself as transaction ID
							if (!storeTransactionId) {
								storeTransactionId = key;
							}
							
							const subAny = sub as any;
							if (subAny.transactions && Array.isArray(subAny.transactions)) {
								for (const trans of subAny.transactions) {
									const transId = extractTransactionId(trans);
									if (transId) {
										storeTransactionId = transId;
										break;
									}
								}
							}
							if (storeTransactionId) break;
						}
					}
				}
				
				// If still not found, try latest_transaction
				if (!storeTransactionId && latestTransaction) {
					storeTransactionId = extractTransactionId(latestTransaction);
				}
				
				// Last resort: check all transactions in the entitlement
				if (!storeTransactionId && activeEntitlement.transactions && Array.isArray(activeEntitlement.transactions)) {
					for (const trans of activeEntitlement.transactions) {
						storeTransactionId = extractTransactionId(trans);
						if (storeTransactionId) break;
					}
				}
				
				if (!storeTransactionId) {
					console.error('[Cancel Subscription] No store_transaction_id found for web subscription', {
						has_latest_transaction: !!latestTransaction,
						latest_transaction_keys: latestTransaction ? Object.keys(latestTransaction) : [],
						has_non_subscriptions: Object.keys(nonSubscriptions).length > 0,
						has_subscriptions: Object.keys(subscriptions).length > 0,
						web_sub_in_non_subs_keys: webSubInNonSubs ? Object.keys(webSubInNonSubs) : [],
						web_sub_in_subs_keys: webSubInSubs ? Object.keys(webSubInSubs) : [],
						active_entitlement_keys: Object.keys(activeEntitlement),
						active_entitlement_transactions: activeEntitlement.transactions ? activeEntitlement.transactions.length : 0,
						// Log actual subscription objects for debugging
						web_sub_in_non_subs: webSubInNonSubs,
						web_sub_in_subs: webSubInSubs,
						all_non_subscriptions: nonSubscriptions,
						all_subscriptions: subscriptions,
					});
					
					return NextResponse.json(
						{ error: 'Unable to find subscription transaction ID. Please contact support.' },
						{ status: 500 }
					);
				}

				// Cancel via RevenueCat API
				const cancelResponse = await fetch(
					`https://api.revenuecat.com/v1/subscribers/${user.id}/subscriptions/${storeTransactionId}/cancel`,
					{
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${revenueCatApiKey}`,
							'Content-Type': 'application/json',
						},
					}
				);

				if (cancelResponse.ok) {
					// Sync subscription from RevenueCat API to update unified table
					// The webhook will handle the actual update, but we can trigger a refresh
					await syncUserRoleFromSubscriptions(user.id);

					return NextResponse.json({
						success: true,
						message: 'Auto-renew has been turned off. Your subscription will expire at the end of your current billing period.',
						cancel_at_period_end: true,
						current_period_end: activeSubscription.expires_at,
					});
				} else {
					const errorData = await cancelResponse.json().catch(() => ({}));
					console.error('[Cancel Subscription] RevenueCat cancel API error:', cancelResponse.status, errorData);
					
					// If the API returns an error, provide a helpful message
					if (cancelResponse.status === 401) {
						console.error('[Cancel Subscription] Invalid API Key. Make sure REVENUECAT_API_KEY is set to your SECRET API KEY (not public key).');
						return NextResponse.json(
							{ error: 'Invalid API configuration. Please contact support.' },
							{ status: 500 }
						);
					}
					
					// 422: Subscription already cancelled - this is actually a success!
					if (cancelResponse.status === 422) {
						const errorCode = errorData?.code;
						if (errorCode === 7783 || errorData?.message?.includes('already cancelled')) {
							// Subscription is already cancelled - sync to update unified table
							await syncUserRoleFromSubscriptions(user.id);
							
							// Subscription is already cancelled - return success
							return NextResponse.json({
								success: true,
								message: 'Auto-renew is already turned off. Your subscription will expire at the end of your current billing period.',
								cancel_at_period_end: true,
								current_period_end: activeSubscription.expires_at,
								already_cancelled: true,
							});
						}
					}
					
					if (cancelResponse.status === 404) {
						return NextResponse.json(
							{ error: 'Subscription not found. It may have already been canceled.' },
							{ status: 404 }
						);
					}
					
					return NextResponse.json(
						{ error: 'Failed to cancel subscription. Please try again or contact support.' },
						{ status: 500 }
					);
				}
			} else {
				// iOS or Android subscription - must be canceled through device settings
				return NextResponse.json({
					success: true,
					message: 'To turn off auto-renew for your iOS subscription, please cancel through your device settings. Your access will continue until the end of your current billing period.',
					cancel_at_period_end: true,
					current_period_end: activeSubscription.expires_at,
					note: 'iOS subscriptions must be canceled through Settings > [Your Name] > Subscriptions > Harmony > Cancel Subscription',
				});
			}
		} catch (revenueCatError) {
			console.error('[Cancel Subscription] Error querying RevenueCat API:', revenueCatError);
			
			// If it's a permission error, try to get management_url from /api/auth/me data
			if (revenueCatError instanceof Error && revenueCatError.message === 'API_PERMISSION_DENIED') {
				// Try to fetch user data which might have management_url
				try {
					const userDataResponse = await fetch(
						`${request.nextUrl.origin}/api/auth/me`,
						{
							headers: {
								'Cookie': request.headers.get('cookie') || '',
							},
						}
					);
					
					if (userDataResponse.ok) {
						const userData = await userDataResponse.json();
						// Check if we have management_url in subscription data
						// Note: This would need to be added to the /api/auth/me response
						// For now, provide instructions to use the customer portal
					}
				} catch (fetchError) {
					console.error('[Cancel Subscription] Error fetching user data:', fetchError);
				}
				
				// Return error with instructions to fix API key permissions
				return NextResponse.json({
					success: false,
					error: 'API key permissions insufficient. Please contact support or use the customer portal to manage your subscription.',
					message: 'To turn off auto-renew, please use the "Manage payment method" option to access your billing portal.',
					redirect_to_portal: true,
					current_period_end: activeSubscription.expires_at,
				});
			}
			
			// Fallback: Generic message for RevenueCat subscriptions
			return NextResponse.json({
				success: true,
				message: 'To turn off auto-renew for your subscription, please cancel through your device\'s subscription settings. Your access will continue until the end of your current billing period.',
				cancel_at_period_end: true,
				current_period_end: activeSubscription.expires_at,
				note: 'RevenueCat subscriptions must be canceled through your device\'s subscription settings. On iOS: Settings > [Your Name] > Subscriptions > Harmony > Cancel Subscription',
			});
		}
	} catch (error) {
		console.error('[Stripe] Subscription cancellation failed', error);

		if (error instanceof Stripe.errors.StripeError) {
			return NextResponse.json(
				{ error: error.message ?? 'Failed to cancel subscription' },
				{ status: error.statusCode ?? 500 }
			);
		}

		return NextResponse.json(
			{ error: 'Unable to cancel subscription' },
			{ status: 500 }
		);
	}
}

