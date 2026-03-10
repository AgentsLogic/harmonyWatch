import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { serverConfig } from '@/lib/env';
import {
	assertStripeClient,
	epochSecondsToIso,
	stripeMetadataToRecord,
	isActiveSubscriptionStatus,
	planFromPriceId,
} from '@/lib/services/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import {
	upsertSubscription,
	deleteSubscription,
	syncUserRoleFromSubscriptions,
	mapStripeStatus,
	type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';

const webhookSecret = serverConfig.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Convert Stripe subscription to unified subscription params
 */
function stripeSubscriptionToUnifiedParams(subscription: Stripe.Subscription): UpsertSubscriptionParams | null {
	const userId = subscription.metadata?.supabase_user_id;
	if (!userId) {
		console.warn('[Stripe] Subscription event missing supabase_user_id metadata', subscription.id);
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

async function recordStripeCustomer(customer: Stripe.Customer) {
	const supabaseUserId = customer.metadata?.supabase_user_id;
	if (!supabaseUserId) return;

	const { error: insertError } = await supabaseAdmin.from('stripe_customers').insert({
		user_id: supabaseUserId,
		stripe_customer_id: customer.id,
	});

	if (insertError && insertError.code !== '23505') {
		console.error('[Stripe] Failed to insert customer from webhook', insertError);
	}

	if (insertError && insertError.code === '23505') {
		const { error: updateError } = await supabaseAdmin
			.from('stripe_customers')
			.update({
				stripe_customer_id: customer.id,
				updated_at: new Date().toISOString(),
			})
			.eq('user_id', supabaseUserId);

		if (updateError) {
			console.error('[Stripe] Failed to update customer mapping from webhook', updateError);
		}
	}
}

async function logWebhookEvent(
	event: Stripe.Event,
	status: 'processed' | 'ignored' | 'failed',
	context: Record<string, any> = {}
) {
	try {
		const payload =
			event.data?.object !== undefined
				? JSON.parse(JSON.stringify(event.data.object))
				: null;

		const logPayload = Object.keys(context).length > 0 || payload !== null ? { ...context, payload } : null;

		const { error } = await supabaseAdmin.from('stripe_webhook_events').upsert(
			{
				event_id: event.id,
				event_type: event.type,
				status,
				payload: logPayload,
				processed_at: new Date().toISOString(),
			},
			{ onConflict: 'event_id' }
		);

		if (error) {
			console.error('[Stripe] Failed to log webhook event', error);
		}
	} catch (error) {
		console.error('[Stripe] Unexpected error while logging webhook event', error);
	}
}

export async function POST(request: NextRequest) {
	if (!webhookSecret) {
		console.error('[Stripe] STRIPE_WEBHOOK_SECRET is not configured');
		return NextResponse.json({ error: 'Webhook secret is not configured' }, { status: 500 });
	}

	let event: Stripe.Event | null = null;
	let logStatus: 'processed' | 'ignored' = 'processed';
	let logContext: Record<string, any> = {};

	try {
		const stripe = assertStripeClient();
		const headerList = await headers();
		const signature = headerList.get('stripe-signature');

		if (!signature) {
			return NextResponse.json({ error: 'Missing Stripe signature header' }, { status: 400 });
		}

		const rawBody = await request.text();

		try {
			event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
			console.log('[Stripe] Webhook received and verified:', event.type, 'Event ID:', event.id);
		} catch (err) {
			console.error('[Stripe] Webhook signature verification failed', err);
			return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
		}

		// Idempotency check - prevent duplicate processing
		if (event) {
			const { data: existing } = await supabaseAdmin
				.from('stripe_webhook_events')
				.select('id')
				.eq('event_id', event.id)
				.maybeSingle();

			if (existing) {
				console.log('[Stripe] Webhook event already processed:', event.id);
				return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
			}
		}

		switch (event.type) {
			case 'customer.subscription.created':
			case 'customer.subscription.updated': {
				const createdOrUpdated = event.data.object as Stripe.Subscription;
				const params = stripeSubscriptionToUnifiedParams(createdOrUpdated);
				
				if (params) {
					await upsertSubscription(params);
					// Always sync user role on subscription update (per plan)
					await syncUserRoleFromSubscriptions(params.user_id);
				}
				
				logContext = {
					...logContext,
					subscriptionId: createdOrUpdated.id,
					userId: params?.user_id ?? null,
					status: createdOrUpdated.status,
				};
				break;
			}
			case 'customer.subscription.deleted': {
				const subscription = event.data.object as Stripe.Subscription;
				const userId = subscription.metadata?.supabase_user_id;
				
				if (userId) {
					// Delete subscription from unified table
					await deleteSubscription('stripe', subscription.id);
					// Sync user role (will downgrade if no other active subscriptions)
					await syncUserRoleFromSubscriptions(userId);
				}
				
				logContext = {
					...logContext,
					subscriptionId: subscription.id,
					userId: userId ?? null,
					status: subscription.status,
				};
				break;
			}
			case 'invoice.payment_succeeded': {
				console.log('[Stripe] invoice.payment_succeeded webhook received');
				const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
				const subscriptionId =
					typeof invoice.subscription === 'string'
						? invoice.subscription
						: invoice.subscription?.id;
				
				console.log('[Stripe] Invoice payment succeeded - subscriptionId:', subscriptionId);
				
				if (subscriptionId) {
					const { data: subscriptionRecord, error } = await supabaseAdmin
						.from('stripe_subscriptions')
						.select('user_id, status')
						.eq('stripe_subscription_id', subscriptionId)
						.maybeSingle();

					console.log('[Stripe] Database lookup result:', { 
						found: !!subscriptionRecord, 
						userId: subscriptionRecord?.user_id,
						error: error?.message 
					});

					let userId: string | null = null;
					let subscriptionStatus: string | null = null;

					// Try to get user_id from database first
					if (!error && subscriptionRecord?.user_id) {
						userId = subscriptionRecord.user_id;
						subscriptionStatus = subscriptionRecord.status;
						console.log('[Stripe] Found user_id in database:', userId);
					} else {
						// Fallback: retrieve subscription from Stripe and get user_id from metadata
						// This handles cases where the subscription record doesn't exist in DB yet
						// (e.g., if invoice.payment_succeeded arrives before customer.subscription.created)
						console.log('[Stripe] Subscription not found in database, retrieving from Stripe:', subscriptionId);
						const stripe = assertStripeClient();
						try {
							const subscription = await stripe.subscriptions.retrieve(subscriptionId);
							userId = subscription.metadata?.supabase_user_id ?? null;
							subscriptionStatus = subscription.status;
							
							console.log('[Stripe] Retrieved subscription from Stripe:', {
								subscriptionId: subscription.id,
								userId: userId,
								status: subscriptionStatus,
								metadata: subscription.metadata
							});
							
							// Save the subscription record for future lookups
							if (userId) {
								const params = stripeSubscriptionToUnifiedParams(subscription);
								if (params) {
									await upsertSubscription(params);
									console.log('[Stripe] Saved subscription record to database');
								}
							} else {
								console.warn('[Stripe] Subscription metadata missing supabase_user_id:', subscription.metadata);
							}
						} catch (stripeError) {
							console.error('[Stripe] Failed to retrieve subscription from Stripe', stripeError);
						}
					}

					if (userId) {
						console.log('[Stripe] Updating subscription and user profile for userId:', userId);
						// Get subscription to extract plan and expiration
						const stripe = assertStripeClient();
						let subscription: Stripe.Subscription | null = null;
						try {
							subscription = await stripe.subscriptions.retrieve(subscriptionId);
							
							// Upsert subscription to unified table
							const params = stripeSubscriptionToUnifiedParams(subscription);
							if (params) {
								await upsertSubscription(params);
								// Sync user role (will upgrade to subscriber if subscription is active)
								await syncUserRoleFromSubscriptions(userId);
							}
							
							// If subscription is still incomplete after invoice payment, try to activate it
							if (subscription.status === 'incomplete') {
								console.log('[Stripe] Subscription still incomplete after invoice payment, attempting to activate');
								
								// Get the payment method from the invoice
								// Use type assertion to access payment_intent which may be present when expanded
								const invoiceWithPaymentIntent = invoice as any;
								const invoicePaymentMethod = invoiceWithPaymentIntent.payment_intent;
								if (invoicePaymentMethod) {
									const paymentIntentId = typeof invoicePaymentMethod === 'string' 
										? invoicePaymentMethod 
										: invoicePaymentMethod.id;
									
									try {
										const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
										const paymentMethodId = typeof paymentIntent.payment_method === 'string'
											? paymentIntent.payment_method
											: paymentIntent.payment_method?.id;
										
										if (paymentMethodId) {
											const customerId = typeof subscription.customer === 'string' 
												? subscription.customer 
												: subscription.customer.id;
											
											// Check if payment method is already attached
											try {
												const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
												if (!paymentMethod.customer || paymentMethod.customer !== customerId) {
													console.log('[Stripe] Attaching payment method to customer:', paymentMethodId);
													await stripe.paymentMethods.attach(paymentMethodId, {
														customer: customerId,
													});
												} else {
													console.log('[Stripe] Payment method already attached, skipping');
												}
											} catch (pmError: any) {
												// If already attached or missing, continue
												if (pmError.code === 'resource_already_exists' || pmError.code === 'resource_missing') {
													console.log('[Stripe] Payment method attachment skipped:', pmError.message);
												} else {
													console.error('[Stripe] Error checking payment method:', pmError);
												}
											}
											
											// Update subscription with payment method
											const activatedSubscription = await stripe.subscriptions.update(subscriptionId, {
												default_payment_method: paymentMethodId,
											});
											
											console.log('[Stripe] Subscription updated with payment method, new status:', activatedSubscription.status);
											
											// Save updated subscription
											const activatedParams = stripeSubscriptionToUnifiedParams(activatedSubscription);
											if (activatedParams) {
												await upsertSubscription(activatedParams);
												await syncUserRoleFromSubscriptions(userId);
											}
										}
									} catch (pmError) {
										console.error('[Stripe] Failed to activate subscription with payment method:', pmError);
									}
								}
							}
						} catch (err) {
							console.error('[Stripe] Failed to retrieve subscription for profile update:', err);
						}

						logContext = {
							...logContext,
							subscriptionId,
							userId: userId,
						};
					} else {
						console.warn('[Stripe] Could not find user_id for subscription:', subscriptionId, 'Invoice payment succeeded but user not updated');
						logContext = {
							...logContext,
							subscriptionId,
							error: 'user_id_not_found',
						};
					}
				} else {
					console.warn('[Stripe] invoice.payment_succeeded received but no subscriptionId found in invoice');
				}
				break;
			}
			case 'invoice.payment_failed': {
				const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
				const subscriptionId =
					typeof invoice.subscription === 'string'
						? invoice.subscription
						: invoice.subscription?.id;
				if (subscriptionId) {
					const stripe = assertStripeClient();
					try {
						const subscription = await stripe.subscriptions.retrieve(subscriptionId);
						const params = stripeSubscriptionToUnifiedParams(subscription);
						if (params) {
							// Update subscription with 'past_due' status (don't downgrade immediately)
							params.status = 'past_due';
							await upsertSubscription(params);
							// Sync user role (will downgrade if no other active subscriptions)
							await syncUserRoleFromSubscriptions(params.user_id);
						}
						logContext = {
							...logContext,
							subscriptionId,
							userId: params?.user_id ?? null,
						};
					} catch (err) {
						console.error('[Stripe] Failed to retrieve subscription for payment_failed:', err);
						// Fallback: try to find subscription in unified table
						const { data: subscriptionRecord, error } = await supabaseAdmin
							.from('subscriptions')
							.select('user_id')
							.eq('provider', 'stripe')
							.eq('external_id', subscriptionId)
							.maybeSingle();

						if (!error && subscriptionRecord?.user_id) {
							// Update status to past_due
							await supabaseAdmin
								.from('subscriptions')
								.update({ status: 'past_due', updated_at: new Date().toISOString() })
								.eq('provider', 'stripe')
								.eq('external_id', subscriptionId);
							// Sync user role
							await syncUserRoleFromSubscriptions(subscriptionRecord.user_id);
							logContext = {
								...logContext,
								subscriptionId,
								userId: subscriptionRecord.user_id,
							};
						}
					}
				}
				break;
			}
			case 'customer.created':
				const createdCustomer = event.data.object as Stripe.Customer;
				await recordStripeCustomer(createdCustomer);
				logContext = {
					...logContext,
					customerId: createdCustomer.id,
					userId: createdCustomer.metadata?.supabase_user_id ?? null,
				};
				break;
			case 'customer.deleted': {
				const customer = event.data.object as Stripe.Customer;
				const supabaseUserId = customer.metadata?.supabase_user_id;
				if (supabaseUserId) {
					const { error } = await supabaseAdmin
						.from('stripe_customers')
						.delete()
						.eq('user_id', supabaseUserId);

					if (error) {
						console.error('[Stripe] Failed to delete customer mapping from webhook', error);
					}
				}
				logContext = {
					...logContext,
					customerId: customer.id,
					userId: customer.metadata?.supabase_user_id ?? null,
				};
				break;
			}
			case 'payment_intent.succeeded': {
				console.log('[Stripe] payment_intent.succeeded webhook received');
				const paymentIntent = event.data.object as Stripe.PaymentIntent;
				// Use type assertion to access invoice property which may be present when expanded
				const paymentIntentWithInvoice = paymentIntent as any;
				let subscriptionId = paymentIntent.metadata?.subscription_id;
				let invoiceId = paymentIntent.metadata?.invoice_id;
				const wasCreatedManually = paymentIntent.metadata?.created_manually === 'true';
				
				// If subscription_id is not in metadata, try to get it from the invoice
				if (!subscriptionId && paymentIntentWithInvoice.invoice) {
					console.log('[Stripe] Payment Intent missing subscription_id in metadata, checking invoice');
					const stripe = assertStripeClient();
					try {
						const invoiceIdFromPaymentIntent = typeof paymentIntentWithInvoice.invoice === 'string' 
							? paymentIntentWithInvoice.invoice 
							: paymentIntentWithInvoice.invoice.id;
						const invoiceResponse = await stripe.invoices.retrieve(invoiceIdFromPaymentIntent);
						// Use type assertion to access subscription property which may be present when expanded
						const invoice = invoiceResponse as any;
						if (invoice.subscription) {
							subscriptionId = typeof invoice.subscription === 'string' 
								? invoice.subscription 
								: invoice.subscription.id;
							invoiceId = invoice.id;
							console.log('[Stripe] Found subscription_id from invoice:', subscriptionId);
						}
					} catch (invoiceError) {
						console.error('[Stripe] Failed to retrieve invoice from Payment Intent:', invoiceError);
					}
				}
				
				console.log('[Stripe] Payment Intent details:', {
					paymentIntentId: paymentIntent.id,
					subscriptionId,
					invoiceId,
					wasCreatedManually,
					hasInvoice: !!paymentIntentWithInvoice.invoice,
					metadata: paymentIntent.metadata
				});
				
				// Process payment intent if it's associated with a subscription
				// This handles both manually created Payment Intents and automatically created ones
				if (subscriptionId) {
					console.log('[Stripe] Payment Intent succeeded for subscription, updating user:', {
						subscriptionId,
						wasCreatedManually,
					});
					const stripe = assertStripeClient();
					
					try {
						// Retrieve subscription to get user_id from metadata
						let subscription = await stripe.subscriptions.retrieve(subscriptionId);
						const userId = subscription.metadata?.supabase_user_id;
						
						console.log('[Stripe] Retrieved subscription:', {
							subscriptionId: subscription.id,
							status: subscription.status,
							userId: userId,
							metadata: subscription.metadata
						});
						
						if (userId) {
							// If payment succeeded but subscription is still incomplete, update subscription status
							if (paymentIntent.status === 'succeeded' && subscription.status === 'incomplete') {
								console.log('[Stripe] Payment succeeded but subscription is incomplete, updating subscription status');
								try {
									// Retrieve the payment method from the Payment Intent
									const paymentMethodId = typeof paymentIntent.payment_method === 'string'
										? paymentIntent.payment_method
										: paymentIntent.payment_method?.id;
									
									if (paymentMethodId) {
										// Check if payment method is already attached to customer
										const customerId = typeof subscription.customer === 'string' 
											? subscription.customer 
											: subscription.customer.id;
										
										try {
											const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
											
											// Only attach if not already attached to this customer
											if (!paymentMethod.customer || paymentMethod.customer !== customerId) {
												console.log('[Stripe] Attaching payment method to customer:', paymentMethodId);
												await stripe.paymentMethods.attach(paymentMethodId, {
													customer: customerId,
												});
												console.log('[Stripe] Attached payment method to customer');
											} else {
												console.log('[Stripe] Payment method already attached to customer, skipping attach');
											}
										} catch (pmError: any) {
											// If payment method is already attached or doesn't exist, continue anyway
											if (pmError.code === 'resource_already_exists' || pmError.code === 'resource_missing') {
												console.log('[Stripe] Payment method attachment skipped:', pmError.message);
											} else {
												console.error('[Stripe] Error checking/attaching payment method:', pmError);
											}
										}
										
										// Update subscription to set the payment method
										const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
											default_payment_method: paymentMethodId,
										});
										console.log('[Stripe] Updated subscription payment method, new status:', updatedSubscription.status);
										
										// If still incomplete, check invoice status and try to activate subscription
										if (updatedSubscription.status === 'incomplete' && invoiceId) {
											try {
												const invoice = await stripe.invoices.retrieve(invoiceId);
												const invoiceWithPaymentIntent = invoice as any;
												console.log('[Stripe] Invoice status:', invoice.status, 'Payment intent:', invoiceWithPaymentIntent.payment_intent);
												
												// If invoice is already paid, subscription should be active
												if (invoice.status === 'paid') {
													console.log('[Stripe] Invoice already paid, re-fetching subscription to check status');
													const finalSubscription = await stripe.subscriptions.retrieve(subscriptionId);
													const finalParams = stripeSubscriptionToUnifiedParams(finalSubscription);
													if (finalParams) {
														await upsertSubscription(finalParams);
													}
													subscription = finalSubscription;
												} else if (invoice.status === 'open') {
													console.log('[Stripe] Invoice is open, attempting to pay:', invoiceId);
													try {
														await stripe.invoices.pay(invoiceId, {
															payment_method: paymentMethodId,
														});
														// Re-fetch subscription to get updated status
														const finalSubscription = await stripe.subscriptions.retrieve(subscriptionId);
														const finalParams = stripeSubscriptionToUnifiedParams(finalSubscription);
														if (finalParams) {
															await upsertSubscription(finalParams);
														}
														subscription = finalSubscription;
													} catch (payError: any) {
														// If invoice is already paid or payment failed, log and continue
														if (payError.code === 'invoice_already_paid' || payError.code === 'payment_intent_unexpected_state') {
															console.log('[Stripe] Invoice payment skipped:', payError.message);
															// Re-fetch subscription anyway
															const finalSubscription = await stripe.subscriptions.retrieve(subscriptionId);
															const finalParams = stripeSubscriptionToUnifiedParams(finalSubscription);
															if (finalParams) {
																await upsertSubscription(finalParams);
															}
															subscription = finalSubscription;
														} else {
															console.error('[Stripe] Failed to pay invoice:', payError);
														}
													}
												} else {
													console.log('[Stripe] Invoice status is', invoice.status, '- re-fetching subscription');
													// Re-fetch subscription to get latest status
													const finalSubscription = await stripe.subscriptions.retrieve(subscriptionId);
													const finalParams = stripeSubscriptionToUnifiedParams(finalSubscription);
													if (finalParams) {
														await upsertSubscription(finalParams);
													}
													subscription = finalSubscription;
												}
											} catch (invoiceError) {
												console.error('[Stripe] Failed to retrieve invoice:', invoiceError);
												// Still update subscription record
												const updatedParams = stripeSubscriptionToUnifiedParams(updatedSubscription);
												if (updatedParams) {
													await upsertSubscription(updatedParams);
												}
												subscription = updatedSubscription;
											}
										} else {
											const updatedParams = stripeSubscriptionToUnifiedParams(updatedSubscription);
											if (updatedParams) {
												await upsertSubscription(updatedParams);
											}
											subscription = updatedSubscription;
										}
										
										// If subscription is still incomplete after all attempts, re-fetch to check final status
										if (subscription.status === 'incomplete') {
											console.log('[Stripe] Subscription still incomplete after payment method update, re-fetching');
											subscription = await stripe.subscriptions.retrieve(subscriptionId);
											const params = stripeSubscriptionToUnifiedParams(subscription);
											if (params) {
												await upsertSubscription(params);
											}
										}
									}
								} catch (updateError) {
									console.error('[Stripe] Failed to update subscription status:', updateError);
								}
							}
							
							// Save subscription record
							const params = stripeSubscriptionToUnifiedParams(subscription);
							if (params) {
								await upsertSubscription(params);
								// Update user to subscriber if:
								// 1. Subscription is active, OR
								// 2. Payment Intent succeeded (payment was successful, even if subscription is still incomplete)
								// This handles the case where we create Payment Intents manually and subscription status lags
								if (isActiveSubscriptionStatus(subscription.status) || paymentIntent.status === 'succeeded') {
									await syncUserRoleFromSubscriptions(userId);
								}
								
								logContext = {
									...logContext,
									subscriptionId,
									invoiceId,
									paymentIntentId: paymentIntent.id,
									userId: userId,
								};
							} else {
								console.warn('[Stripe] Subscription not active and payment not succeeded, status:', subscription.status, 'Payment Intent status:', paymentIntent.status);
							}
						} else {
							console.warn('[Stripe] Subscription metadata missing supabase_user_id');
						}
					} catch (error) {
						console.error('[Stripe] Failed to handle payment_intent.succeeded', error);
					}
				} else {
					console.log('[Stripe] Payment Intent not manually created or missing subscription_id, skipping');
				}
				break;
			}
			case 'checkout.session.completed': {
				const session = event.data.object as Stripe.Checkout.Session;
				const subscriptionId = typeof session.subscription === 'string'
					? session.subscription
					: session.subscription?.id;
				
				console.log('[Stripe] checkout.session.completed received:', {
					sessionId: session.id,
					subscriptionId,
					paymentStatus: session.payment_status,
					customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
					metadata: session.metadata,
				});
				
				if (subscriptionId) {
					// Retrieve the subscription to get full details
					const stripe = assertStripeClient();
					try {
						const subscription = await stripe.subscriptions.retrieve(subscriptionId);
						const params = stripeSubscriptionToUnifiedParams(subscription);
						
						// Get user_id from subscription metadata or session metadata (declare outside if block for scope)
						const userId = subscription.metadata?.supabase_user_id || session.metadata?.supabase_user_id || null;
						
						if (params) {
							await upsertSubscription(params);
							
							console.log('[Stripe] checkout.session.completed processing:', {
								subscriptionId: subscription.id,
								subscriptionStatus: subscription.status,
								paymentStatus: session.payment_status,
								userId,
								hasMetadata: !!subscription.metadata?.supabase_user_id,
							});
							
							// If payment was successful, update user role
							// Note: subscription might be 'incomplete' initially, but if payment is paid, we should still update
							// The invoice.payment_succeeded event will handle the final activation
							if (session.payment_status === 'paid' && userId) {
								// If subscription is active, update immediately
								if (subscription.status === 'active') {
									console.log('[Stripe] Subscription is active, updating user to subscriber');
									await syncUserRoleFromSubscriptions(userId);
								} else if (subscription.status === 'incomplete' || subscription.status === 'trialing') {
									// Subscription might be incomplete but payment succeeded - wait for invoice.payment_succeeded
									// But we can still sync user role (will check subscription status)
									console.log('[Stripe] Subscription is incomplete/trialing, payment succeeded. Will wait for invoice.payment_succeeded event.');
									await syncUserRoleFromSubscriptions(userId);
								}
							}
						}
						
						logContext = {
							...logContext,
							sessionId: session.id,
							subscriptionId,
							userId: userId ?? null,
							paymentStatus: session.payment_status,
							subscriptionStatus: subscription.status,
						};
					} catch (error) {
						console.error('[Stripe] Failed to retrieve subscription from checkout session', error);
					}
				} else {
					console.warn('[Stripe] checkout.session.completed received but no subscription ID found');
				}
				break;
			}
			default:
				console.log('[Stripe] Unhandled webhook event', event.type);
				logStatus = 'ignored';
		}

		if (event) {
			await logWebhookEvent(event, logStatus, logContext);
		}

		return NextResponse.json({ received: true }, { status: 200 });
	} catch (error) {
		console.error('[Stripe] Webhook handler encountered an error', error);

		if (event) {
			await logWebhookEvent(event, 'failed', {
				error: error instanceof Error ? error.message : 'unknown-error',
			});
		}

		return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
	}
}

export const runtime = 'nodejs';
export const preferredRegion = 'iad1';

