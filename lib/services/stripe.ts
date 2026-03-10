import Stripe from 'stripe';
import { serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';

export type SupportedPlan = 'monthly' | 'yearly';

const stripeSecretKey = serverConfig.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;

export const stripeClient = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const priceIdMap: Record<SupportedPlan, string | null> = {
	monthly: serverConfig.STRIPE_MONTHLY_PRICE_ID ?? process.env.STRIPE_MONTHLY_PRICE_ID ?? null,
	yearly: serverConfig.STRIPE_YEARLY_PRICE_ID ?? process.env.STRIPE_YEARLY_PRICE_ID ?? null,
};

const reversePriceIdMap: Record<string, SupportedPlan> = Object.entries(priceIdMap).reduce((acc, [plan, value]) => {
	if (value) {
		acc[value] = plan as SupportedPlan;
	}
	return acc;
}, {} as Record<string, SupportedPlan>);

// Only 'active' and 'trialing' grant access (Stripe best practices)
const activeStatuses: Stripe.Subscription.Status[] = ['trialing', 'active'];

export function assertStripeClient(): Stripe {
	if (!stripeClient) {
		throw new Error('Stripe is not configured');
	}
	return stripeClient;
}

export function getPriceIdForPlan(plan: SupportedPlan): string {
	const priceId = priceIdMap[plan];
	if (!priceId) {
		throw new Error(`Stripe price ID is not configured for plan "${plan}"`);
	}
	return priceId;
}

export async function ensureStripeCustomer(options: {
	userId: string;
	email: string | null;
	displayName?: string | null;
}): Promise<{ stripeCustomerId: string; wasCreated: boolean }> {
	if (!options.userId) {
		throw new Error('Missing user ID while ensuring Stripe customer');
	}

	const stripe = assertStripeClient();
	const { data: existing, error: fetchError } = await supabaseAdmin
		.from('stripe_customers')
		.select('stripe_customer_id')
		.eq('user_id', options.userId)
		.maybeSingle();

	if (fetchError && fetchError.code !== 'PGRST116') {
		throw new Error(`Failed to lookup Stripe customer mapping: ${fetchError.message}`);
	}

	if (existing?.stripe_customer_id) {
		// Verify the customer actually exists in Stripe
		// This handles cases where:
		// - Customer was deleted in Stripe but still in our DB
		// - Switching between test/live modes
		// - Customer ID from different Stripe account
		try {
			await stripe.customers.retrieve(existing.stripe_customer_id);
			
			// Customer exists - update email/name if needed
			if (options.email) {
				try {
					await stripe.customers.update(existing.stripe_customer_id, {
						email: options.email,
						name: options.displayName ?? undefined,
					});
				} catch (stripeError) {
					console.warn('[Stripe] Failed to update customer email/name', stripeError);
				}
			}

			await supabaseAdmin
				.from('stripe_customers')
				.update({ updated_at: new Date().toISOString() })
				.eq('user_id', options.userId);

			return { stripeCustomerId: existing.stripe_customer_id, wasCreated: false };
		} catch (stripeError) {
			// Customer doesn't exist in Stripe - delete from DB and create new one
			console.warn(
				`[Stripe] Customer ${existing.stripe_customer_id} not found in Stripe, creating new customer`,
				stripeError instanceof Stripe.errors.StripeError ? stripeError.message : stripeError
			);
			
			// Delete the invalid customer record
			await supabaseAdmin
				.from('stripe_customers')
				.delete()
				.eq('user_id', options.userId);
			
			// Fall through to create a new customer
		}
	}

	const customer = await stripe.customers.create({
		email: options.email ?? undefined,
		name: options.displayName ?? undefined,
		metadata: {
			supabase_user_id: options.userId,
		},
	});

	const { error: insertError } = await supabaseAdmin.from('stripe_customers').insert({
		user_id: options.userId,
		stripe_customer_id: customer.id,
	});

	if (insertError && insertError.code !== '23505') {
		throw new Error(`Failed to persist Stripe customer mapping: ${insertError.message}`);
	}

	if (insertError && insertError.code === '23505') {
		const { error: updateError } = await supabaseAdmin
			.from('stripe_customers')
			.update({
				stripe_customer_id: customer.id,
				updated_at: new Date().toISOString(),
			})
			.eq('user_id', options.userId);

		if (updateError) {
			throw new Error(`Failed to update Stripe customer mapping: ${updateError.message}`);
		}
	}

	return { stripeCustomerId: customer.id, wasCreated: true };
}

export function stripeMetadataToRecord(metadata: Stripe.Metadata | null | undefined): Record<string, string> | null {
	if (!metadata) return null;
	return Object.keys(metadata).length > 0 ? { ...metadata } : null;
}

export function epochSecondsToIso(epochSeconds: number | undefined | null): string | null {
	if (!epochSeconds) {
		return null;
	}
	return new Date(epochSeconds * 1000).toISOString();
}

export function planFromPriceId(priceId: string | null | undefined): SupportedPlan | null {
	if (!priceId) {
		return null;
	}
	return reversePriceIdMap[priceId] ?? null;
}

export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
	if (!status) return false;
	return activeStatuses.includes(status as Stripe.Subscription.Status);
}

