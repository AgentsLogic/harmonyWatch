import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { publicConfig, serverConfig } from '@/lib/env';
import {
	assertStripeClient,
	ensureStripeCustomer,
	getPriceIdForPlan,
} from '@/lib/services/stripe';

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
		console.log('[Stripe] create-checkout-session API called');
		
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
		const returnTo = typeof requestBody.return_to === 'string' ? requestBody.return_to : 'signup';

		if (!isPlanOption(requestedPlan)) {
			return NextResponse.json({ error: 'Unsupported plan selected' }, { status: 400 });
		}

		const stripe = assertStripeClient();
		const priceId = getPriceIdForPlan(requestedPlan);

		// Ensure customer exists
		const { stripeCustomerId } = await ensureStripeCustomer({
			userId: user.id,
			email: user.email ?? null,
			displayName: user.user_metadata?.display_name ?? user.email ?? null,
		});

		// Check for existing active subscriptions - if user already has active subscription, don't create another
		const existingSubscriptions = await stripe.subscriptions.list({
			customer: stripeCustomerId,
			status: 'active',
			limit: 10,
		});

		const existingActive = existingSubscriptions.data.find(
			sub => sub.items.data[0]?.price.id === priceId 
				&& sub.metadata?.supabase_user_id === user.id
		);

		if (existingActive) {
			console.log('[Stripe] User already has active subscription:', existingActive.id);
			return NextResponse.json({ 
				error: 'You already have an active subscription. Please use the billing portal to manage it.' 
			}, { status: 400 });
		}

		// Create Checkout Session for subscription
		// Following Stripe's best practices: https://docs.stripe.com/payments/checkout
		// Using Stripe's hosted checkout page (not embedded)
		// Get base URL from environment variable, or fallback to request origin
		const envBaseUrl = serverConfig.NEXT_PUBLIC_APP_URL;
		const requestOrigin = request.headers.get('origin') || 
			`${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host') || 'localhost:3000'}`;
		const baseUrl = envBaseUrl && envBaseUrl !== 'http://localhost:3000' 
			? envBaseUrl 
			: requestOrigin;
		
		// Determine cancel URL based on return context
		const cancelUrl = returnTo === 'settings'
			? `${baseUrl}/settings/upgrade`
			: `${baseUrl}/signup/plans`;
		
		const session = await stripe.checkout.sessions.create({
			customer: stripeCustomerId,
			mode: 'subscription',
			line_items: [
				{
					price: priceId,
					quantity: 1,
				},
			],
			success_url: `${baseUrl}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: cancelUrl,
			metadata: {
				supabase_user_id: user.id,
				plan: requestedPlan,
				return_to: returnTo,
			},
			subscription_data: {
				metadata: {
					supabase_user_id: user.id,
					plan: requestedPlan,
				},
			},
		});

		console.log('[Stripe] Checkout Session created:', {
			sessionId: session.id,
			url: session.url,
		});

		// Return the session URL for redirect
		if (!session.url) {
			console.error('[Stripe] Checkout Session created but no URL available');
			return NextResponse.json(
				{ error: 'Failed to create checkout session' },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			url: session.url,
			sessionId: session.id,
		});
	} catch (error) {
		console.error('[Stripe] Failed to create checkout session', error);

		if (error instanceof Stripe.errors.StripeError) {
			return NextResponse.json(
				{ error: error.message ?? 'Stripe rejected checkout session creation' },
				{ status: error.statusCode ?? 500 }
			);
		}

		return NextResponse.json(
			{ error: 'Unable to create checkout session' },
			{ status: 500 }
		);
	}
}

