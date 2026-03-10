import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { serverConfig } from '@/lib/env';

const planAmountMap: Record<string, number> = {
	monthly: 700, // $7.00
	yearly: 7000, // $70.00
};

// Only check at runtime, not during build
const stripeSecretKey = serverConfig.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export async function POST(request: NextRequest) {
	if (!stripe) {
		console.warn('[Stripe] STRIPE_SECRET_KEY is missing. Payment intents cannot be created.');
		return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
	}

	try {
		const { plan = 'monthly', customerEmail } = await request.json().catch(() => ({ plan: 'monthly' }));
		const amount = planAmountMap[plan];

		if (!amount) {
			return NextResponse.json({ error: 'Unsupported plan selected' }, { status: 400 });
		}

		const paymentIntent = await stripe.paymentIntents.create({
			amount,
			currency: 'usd',
			automatic_payment_methods: { enabled: true },
			receipt_email: customerEmail,
			metadata: {
				plan,
			},
		});

		return NextResponse.json({ clientSecret: paymentIntent.client_secret }, { status: 200 });
	} catch (error) {
		console.error('[Stripe] Failed to create payment intent', error);
		return NextResponse.json({ error: 'Unable to initiate payment' }, { status: 500 });
	}
}

