import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { assertStripeClient, planFromPriceId, epochSecondsToIso, stripeMetadataToRecord } from '@/lib/services/stripe';
import { supabase as supabaseAuth, supabaseAdmin } from '@/lib/supabase';
import {
	upsertSubscription,
	syncUserRoleFromSubscriptions,
	mapStripeStatus,
	type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';
import { revalidateTag } from 'next/cache';

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

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const sessionId = searchParams.get('session_id');

		if (!sessionId) {
			return NextResponse.json(
				{ error: 'Missing session_id parameter' },
				{ status: 400 }
			);
		}

		// Get authenticated user
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

		const stripe = assertStripeClient();
		
		// Retrieve the Checkout Session with expanded subscription
		const session = await stripe.checkout.sessions.retrieve(sessionId, {
			expand: ['subscription', 'customer'],
		});

		const subscriptionId = typeof session.subscription === 'string' 
			? session.subscription 
			: session.subscription?.id ?? null;

		// If payment succeeded and we have a subscription, verify and update user status IMMEDIATELY
		// Best practice: Activate immediately after checkout, webhooks are for reconciliation
		if (session.payment_status === 'paid' && subscriptionId) {
			try {
				// Always retrieve the full subscription from Stripe API to ensure we have all details
				// This is more reliable than using the expanded object from the session
				const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
					expand: ['items.data.price', 'latest_invoice.payment_intent'],
				});

				if (subscription) {
					// Get user_id from subscription metadata or session metadata
					const userId = subscription.metadata?.supabase_user_id || session.metadata?.supabase_user_id || user.id;
					
					// Verify this subscription belongs to the current user
					if (userId === user.id) {
						// Convert to unified format and upsert
						const unifiedParams = stripeSubscriptionToUnifiedParams(subscription);
						
						if (unifiedParams) {
							// Upsert subscription into unified table IMMEDIATELY
							const upserted = await upsertSubscription(unifiedParams);
							
							// Invalidate cache immediately so next request (/api/auth/me) gets fresh data
							// This ensures instant subscription visibility
							try {
								revalidateTag(`subscription-${userId}`);
								revalidateTag('subscription');
							} catch (cacheError) {
								// Non-critical - cache will expire naturally
								console.warn('[Verify Checkout] Cache invalidation failed (non-critical):', cacheError);
							}
							
							// Sync user role IMMEDIATELY - this activates the subscription
							// Uses non-cached getActiveSubscription() for immediate consistency
							await syncUserRoleFromSubscriptions(userId);
							
						} else {
							console.error('[Verify Checkout] ❌ Failed to convert subscription to unified format:', {
								subscriptionId: subscription.id,
								metadata: subscription.metadata,
								priceId: subscription.items.data[0]?.price.id,
							});
						}
					} else {
						console.warn('[Verify Checkout] User ID mismatch:', {
							subscriptionUserId: userId,
							requestUserId: user.id,
						});
					}
				}
			} catch (subError) {
				console.error('[Verify Checkout] Error processing subscription:', subError);
				// Continue anyway - return session info
				// Webhook will handle it as backup
			}
		}

		return NextResponse.json({
			sessionId: session.id,
			status: session.status,
			paymentStatus: session.payment_status,
			subscriptionId,
			customerId: typeof session.customer === 'string'
				? session.customer
				: session.customer?.id ?? null,
		});
	} catch (error) {
		console.error('[Stripe] Failed to verify checkout session', error);

		if (error instanceof Stripe.errors.StripeError) {
			return NextResponse.json(
				{ error: error.message ?? 'Stripe rejected session verification' },
				{ status: error.statusCode ?? 500 }
			);
		}

		return NextResponse.json(
			{ error: 'Unable to verify checkout session' },
			{ status: 500 }
		);
	}
}

