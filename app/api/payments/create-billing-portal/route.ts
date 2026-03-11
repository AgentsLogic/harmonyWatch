import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { assertStripeClient, ensureStripeCustomer } from '@/lib/services/stripe';
import { supabaseAdmin } from '@/lib/supabase';

const supabaseAuth = createClient(
	publicConfig.NEXT_PUBLIC_SUPABASE_URL,
	publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

		// Check if user has an active Stripe subscription using unified service
		const { checkSubscriptionAccess } = await import('@/lib/services/subscription-check');
		const subscriptionAccess = await checkSubscriptionAccess(user.id);

		// Only allow billing portal for Stripe subscriptions
		if (!subscriptionAccess.subscription || subscriptionAccess.subscription.provider !== 'stripe') {
			return NextResponse.json(
				{ error: 'No active Stripe subscription found. The billing portal is only available for Stripe subscriptions.' },
				{ status: 400 }
			);
		}

		// Check if subscription grants access (active or trialing)
		if (!subscriptionAccess.hasAccess) {
			return NextResponse.json(
				{ error: 'Your subscription is not active. Please reactivate your subscription to access the billing portal.' },
				{ status: 400 }
			);
		}

		// Get or create Stripe customer
		const { stripeCustomerId } = await ensureStripeCustomer({
			userId: user.id,
			email: user.email ?? null,
			displayName: user.user_metadata?.display_name ?? user.email ?? null,
		});

		// Create Stripe Billing Portal session
		const stripe = assertStripeClient();
		
		// Get base URL from environment variable or request origin
		const envBaseUrl = serverConfig.NEXT_PUBLIC_APP_URL;
		const requestOrigin = request.headers.get('origin') || 
			`${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host') || 'localhost:3000'}`;
		const baseUrl = envBaseUrl && envBaseUrl !== 'http://localhost:3000' 
			? envBaseUrl 
			: requestOrigin;

		const portalSession = await stripe.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: `${baseUrl}/settings`,
		});


		if (!portalSession.url) {
			return NextResponse.json(
				{ error: 'Failed to create billing portal session' },
				{ status: 500 }
			);
		}

		return NextResponse.json({ url: portalSession.url }, { status: 200 });
	} catch (error) {
		console.error('[Stripe Billing Portal] Failed to create portal session:', error);
		return NextResponse.json(
			{ error: 'Unable to open billing portal' },
			{ status: 500 }
		);
	}
}

