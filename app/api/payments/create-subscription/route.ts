/**
 * @deprecated This route is deprecated in favor of Stripe Checkout.
 * Use /api/payments/create-checkout-session instead.
 * 
 * This route is kept for reference but should not be used in production.
 * Stripe Checkout handles payment processing more reliably and eliminates
 * client secret management issues.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { publicConfig } from '@/lib/env';
import {
	assertStripeClient,
	ensureStripeCustomer,
	getPriceIdForPlan,
	stripeMetadataToRecord,
	epochSecondsToIso,
} from '@/lib/services/stripe';
import { supabaseAdmin } from '@/lib/supabase';

const supabaseAuth = createClient(
	publicConfig.NEXT_PUBLIC_SUPABASE_URL,
	publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

type PlanOption = 'monthly' | 'yearly';

function isPlanOption(value: string): value is PlanOption {
	return value === 'monthly' || value === 'yearly';
}

export async function POST(request: NextRequest) {
	try {
		// Get access token from multiple sources
		const authHeader = request.headers.get('authorization');
		let accessToken = authHeader?.startsWith('Bearer ') 
			? authHeader.substring(7)
			: null;
		
		if (!accessToken) {
			accessToken = request.cookies.get('sb-access-token')?.value ?? null;
		}
		
		let requestBody: any = {};
		try {
			const bodyText = await request.text();
			if (bodyText) {
				requestBody = JSON.parse(bodyText);
			}
		} catch {
			// Body is empty or invalid
		}
		
		if (!accessToken && requestBody) {
			accessToken = requestBody.accessToken ?? requestBody.token ?? null;
		}
		
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
		
		const requestedPlan = typeof requestBody.plan === 'string' ? requestBody.plan.toLowerCase() : 'monthly';

		if (!isPlanOption(requestedPlan)) {
			return NextResponse.json({ error: 'Unsupported plan selected' }, { status: 400 });
		}

		const stripe = assertStripeClient();
		const priceId = getPriceIdForPlan(requestedPlan);

		const { stripeCustomerId } = await ensureStripeCustomer({
			userId: user.id,
			email: user.email ?? null,
			displayName: user.user_metadata?.display_name ?? user.email ?? null,
		});

		// Create subscription following Stripe's recommended pattern
		// See: https://stripe.com/docs/billing/subscriptions/build-subscription?ui=elements
		const subscription = await stripe.subscriptions.create({
			customer: stripeCustomerId,
			items: [{ price: priceId }],
			payment_behavior: 'default_incomplete',
			payment_settings: {
				save_default_payment_method: 'on_subscription',
			},
			metadata: {
				supabase_user_id: user.id,
				plan: requestedPlan,
			},
			expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
		});

		// Type for expanded subscription with payment intent and setup intent
		type ExpandedSubscription = Stripe.Subscription & {
			latest_invoice?: Stripe.Invoice | string | null;
			pending_setup_intent?: Stripe.SetupIntent | string | null;
			current_period_start?: number | null;
			current_period_end?: number | null;
			cancel_at?: number | null;
			canceled_at?: number | null;
		};

		type ExpandedInvoice = Stripe.Invoice & {
			payment_intent?: Stripe.PaymentIntent | string | null;
		};

		const expandedSubscription = subscription as ExpandedSubscription;


		// Get client secret following Stripe's recommended pattern
		// See: https://stripe.com/docs/billing/subscriptions/build-subscription?ui=elements
		// Pattern from: https://stripe.com/docs/billing/subscriptions/creating
		let clientSecret: string | null = null;

		// Check for payment intent first (standard flow)
		// Pattern: subscription.latest_invoice.payment_intent.client_secret
		const invoice = expandedSubscription.latest_invoice;

		if (invoice && typeof invoice === 'object') {
			const expandedInvoice = invoice as ExpandedInvoice;
			const paymentIntent = expandedInvoice.payment_intent;

			if (paymentIntent && typeof paymentIntent === 'object' && paymentIntent.client_secret) {
				clientSecret = paymentIntent.client_secret;
			} else if (paymentIntent && typeof paymentIntent === 'string') {
				// Payment intent is a string ID, retrieve it
				try {
					const retrieved = await stripe.paymentIntents.retrieve(paymentIntent);
					clientSecret = retrieved.client_secret;
				} catch (error) {
					console.error('[create-subscription] Failed to retrieve payment intent:', error);
				}
			}
		}

		// Fallback to setup intent (when save_default_payment_method is used)
		// Pattern from: https://stripe.com/docs/billing/subscriptions/creating
		if (!clientSecret) {
			
			// First check if setup intent exists in the response
			if (expandedSubscription.pending_setup_intent) {
				const setupIntent = expandedSubscription.pending_setup_intent;

				if (typeof setupIntent === 'object' && setupIntent.client_secret) {
					clientSecret = setupIntent.client_secret;
				} else if (typeof setupIntent === 'string') {
					try {
						const retrieved = await stripe.setupIntents.retrieve(setupIntent);
						clientSecret = retrieved.client_secret;
					} catch (error) {
						console.error('[create-subscription] Failed to retrieve setup intent:', error);
					}
				}
			} else {
				// Setup intent not in initial response, retrieve subscription again
				try {
					const retrievedSubscription = await stripe.subscriptions.retrieve(expandedSubscription.id, {
						expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
					}) as ExpandedSubscription;
					
					
					if (retrievedSubscription.pending_setup_intent) {
						const setupIntent = retrievedSubscription.pending_setup_intent;
						if (typeof setupIntent === 'object' && setupIntent.client_secret) {
							clientSecret = setupIntent.client_secret;
						} else if (typeof setupIntent === 'string') {
							const retrieved = await stripe.setupIntents.retrieve(setupIntent);
							clientSecret = retrieved.client_secret;
						}
					}
					
					// Also check if invoice has payment intent after retrieval
					if (!clientSecret && retrievedSubscription.latest_invoice && typeof retrievedSubscription.latest_invoice === 'object') {
						const retrievedInvoice = retrievedSubscription.latest_invoice as ExpandedInvoice;
						if (retrievedInvoice.payment_intent) {
							const paymentIntent = retrievedInvoice.payment_intent;
							if (typeof paymentIntent === 'object' && paymentIntent.client_secret) {
								clientSecret = paymentIntent.client_secret;
							} else if (typeof paymentIntent === 'string') {
								const retrieved = await stripe.paymentIntents.retrieve(paymentIntent);
								clientSecret = retrieved.client_secret;
							}
						}
					}
				} catch (error) {
					console.error('[create-subscription] Failed to retrieve subscription:', error);
				}
			}
		}

		if (!clientSecret) {
			return NextResponse.json(
				{ error: 'Stripe did not return a client secret for this subscription.' },
				{ status: 500 }
			);
		}

		// Store subscription in unified subscriptions table
		const { upsertSubscription, syncUserRoleFromSubscriptions, mapStripeStatus } = await import('@/lib/services/subscription-service');
		const { planFromPriceId } = await import('@/lib/services/stripe');
		
		const subscriptionPlan = planFromPriceId(priceId) || 'monthly';
		const unifiedParams = {
			user_id: user.id,
			provider: 'stripe' as const,
			external_id: expandedSubscription.id,
			status: mapStripeStatus(expandedSubscription.status),
			plan: subscriptionPlan,
			current_period_start: epochSecondsToIso(expandedSubscription.current_period_start ?? null),
			current_period_end: epochSecondsToIso(expandedSubscription.current_period_end ?? null),
			expires_at: epochSecondsToIso(expandedSubscription.current_period_end ?? null),
			cancel_at: epochSecondsToIso(expandedSubscription.cancel_at ?? null),
			canceled_at: epochSecondsToIso(expandedSubscription.canceled_at ?? null),
			provider_data: stripeMetadataToRecord(expandedSubscription.metadata ?? null),
		};

		await upsertSubscription(unifiedParams);
		await syncUserRoleFromSubscriptions(user.id);

		// Return response following Stripe's pattern
		return NextResponse.json({
			subscriptionId: expandedSubscription.id,
			clientSecret,
			status: expandedSubscription.status,
		});
	} catch (error) {
		console.error('[Stripe] Failed to create subscription', error);

		if (error instanceof Stripe.errors.StripeError) {
			return NextResponse.json(
				{ error: error.message ?? 'Stripe rejected subscription creation' },
				{ status: error.statusCode ?? 500 }
			);
		}

		return NextResponse.json(
			{ error: 'Unable to create subscription' },
			{ status: 500 }
		);
	}
}
