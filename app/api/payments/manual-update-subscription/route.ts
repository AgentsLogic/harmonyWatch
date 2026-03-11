import { NextRequest, NextResponse } from 'next/server';
import { assertStripeClient, planFromPriceId, epochSecondsToIso } from '@/lib/services/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import Stripe from 'stripe';
import {
	upsertSubscription,
	syncUserRoleFromSubscriptions,
	mapStripeStatus,
	type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';

/**
 * Manual endpoint to update user subscription status
 * POST /api/payments/manual-update-subscription
 * Body: { subscription_id: "sub_xxx" }
 * 
 * This is useful when webhooks aren't reaching the server (local dev)
 */
export async function POST(request: NextRequest) {
	try {
		const { subscription_id } = await request.json();

		if (!subscription_id) {
			return NextResponse.json({ error: 'Missing subscription_id' }, { status: 400 });
		}

		const stripe = assertStripeClient();
		
		// Retrieve subscription from Stripe
		const subscriptionResponse = await stripe.subscriptions.retrieve(subscription_id);
		// Type assertion to ensure we have a Subscription object
		const subscription = subscriptionResponse as any;
		const userId = subscription.metadata?.supabase_user_id;
		
		if (!userId) {
			return NextResponse.json({ 
				error: 'Subscription missing supabase_user_id in metadata',
				subscription_metadata: subscription.metadata 
			}, { status: 400 });
		}

		// Convert Stripe subscription to unified params
		const subscriptionWithPeriods = subscription as any;
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

		const params: UpsertSubscriptionParams = {
			user_id: userId,
			provider: 'stripe',
			external_id: subscription.id,
			status: mapStripeStatus(subscription.status),
			plan: subscriptionPlan,
			current_period_start: subscriptionWithPeriods.current_period_start 
				? new Date(subscriptionWithPeriods.current_period_start * 1000).toISOString() 
				: null,
			current_period_end: subscriptionWithPeriods.current_period_end 
				? new Date(subscriptionWithPeriods.current_period_end * 1000).toISOString() 
				: null,
			expires_at: subscriptionWithPeriods.current_period_end 
				? new Date(subscriptionWithPeriods.current_period_end * 1000).toISOString() 
				: null,
			cancel_at: subscriptionWithPeriods.cancel_at 
				? new Date(subscriptionWithPeriods.cancel_at * 1000).toISOString() 
				: null,
			canceled_at: subscriptionWithPeriods.canceled_at 
				? new Date(subscriptionWithPeriods.canceled_at * 1000).toISOString() 
				: null,
			provider_data: subscription.metadata as any,
		};

		// Upsert to unified table
		await upsertSubscription(params);

		// Sync user role (will upgrade to subscriber if subscription is active)
		await syncUserRoleFromSubscriptions(userId);

		const shouldBeSubscriber = subscription.status === 'active' || subscription.status === 'trialing';
		const userUpdated = shouldBeSubscriber;
		
		if (shouldBeSubscriber) {
			console.log('[Stripe] Successfully updated user to subscriber:', userId, {
				plan: subscriptionPlan,
				expiresAt: params.expires_at,
			});
		}

		return NextResponse.json({
			success: true,
			subscription: {
				id: subscription.id,
				status: subscription.status,
			},
			userId,
			userUpdated,
			message: userUpdated 
				? 'User updated to subscriber' 
				: `Subscription status is ${subscription.status}, user not updated (only active subscriptions update user)`,
		});
	} catch (error) {
		console.error('[Stripe] Failed to manually update subscription', error);
		return NextResponse.json(
			{ error: 'Unable to update subscription'},
			{ status: 500 }
		);
	}
}

