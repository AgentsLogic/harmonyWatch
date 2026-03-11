import { cleanEnv, str, url, makeValidator, bool } from 'envalid';

// Custom validator that treats empty string as undefined (useful for optional secrets)
const optionalStr = makeValidator<string | undefined>((value) => {
	if (value === undefined || value === null) return undefined;
	const s = String(value).trim();
	if (s.length === 0) return undefined;
	return s;
});

// ─── Client-safe public config ───────────────────────────────────────────────
// NEXT_PUBLIC_* vars are replaced with literal strings at build time by Next.js.
// They must be accessed as explicit process.env.NEXT_PUBLIC_* references —
// passing process.env as an object to cleanEnv gives it an empty shim in the
// browser and validation fails. Access them directly here instead.

// ─── Server-only env ─────────────────────────────────────────────────────────
// This cleanEnv call only runs in Node.js (server). On the client, serverEnv is
// an empty object — no server vars are ever accessed by client-side code.
const serverEnv = typeof window === 'undefined'
	? cleanEnv(process.env, {
		// Supabase - Required
		SUPABASE_URL: url({
			desc: 'Supabase project URL (set in Vercel environment variables)',
		}),
		SUPABASE_SERVICE_ROLE_KEY: str({
			desc: 'Supabase service role key (set in Vercel environment variables)',
		}),

		// Mux - Required
		MUX_TOKEN_ID: str({
			desc: 'Mux API token ID (set in Vercel environment variables)',
		}),
		MUX_TOKEN_SECRET: str({
			desc: 'Mux API token secret (set in Vercel environment variables)',
		}),
		MUX_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'Mux webhook signing secret (optional, set in Vercel if using Mux webhooks)' }),

		// RevenueCat - Optional
		REVENUECAT_API_KEY: optionalStr({ default: undefined, desc: 'RevenueCat public API key for server-side (set in Vercel environment variables)' }),
		REVENUECAT_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'RevenueCat webhook authorization header value (set in Vercel environment variables)' }),
		REVENUECAT_USE_SANDBOX: bool({ default: false, desc: 'Use RevenueCat Sandbox API keys for testing (set to true in development)' }),

		// Stripe - Optional
		STRIPE_SECRET_KEY: optionalStr({ default: undefined, desc: 'Stripe secret key (set in Vercel environment variables)' }),
		STRIPE_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'Stripe webhook signing secret (set in Vercel environment variables)' }),
		STRIPE_MONTHLY_PRICE_ID: optionalStr({ default: undefined, desc: 'Stripe monthly subscription price ID (set in Vercel environment variables)' }),
		STRIPE_YEARLY_PRICE_ID: optionalStr({ default: undefined, desc: 'Stripe yearly subscription price ID (set in Vercel environment variables)' }),

		// YouTube - Optional
		YOUTUBE_CLIENT_ID: optionalStr({ default: undefined, desc: 'Google Cloud OAuth client ID for YouTube (set in Vercel environment variables)' }),
		YOUTUBE_CLIENT_SECRET: optionalStr({ default: undefined, desc: 'Google Cloud OAuth client secret for YouTube (set in Vercel environment variables)' }),
		YOUTUBE_CHANNEL_ID: optionalStr({ default: undefined, desc: 'YouTube channel ID for members.list API (set in Vercel environment variables)' }),
		YOUTUBE_REFRESH_TOKEN: optionalStr({ default: undefined, desc: 'Channel owner OAuth refresh token for server-side members.list calls (set in Vercel environment variables)' }),

		// Patreon - Optional
		PATREON_CLIENT_ID: optionalStr({ default: undefined, desc: 'Patreon OAuth client ID (set in Vercel environment variables)' }),
		PATREON_CLIENT_SECRET: optionalStr({ default: undefined, desc: 'Patreon OAuth client secret (set in Vercel environment variables)' }),
		PATREON_CAMPAIGN_ID: optionalStr({ default: undefined, desc: 'Patreon campaign ID (set in Vercel environment variables)' }),
		PATREON_CREATOR_ACCESS_TOKEN: optionalStr({ default: undefined, desc: 'Patreon creator access token with all V2 scopes (set in Vercel environment variables)' }),
		PATREON_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'Patreon webhook signing secret for HEX(HMAC-MD5) verification (set in Vercel environment variables)' }),

		// Security - Optional
		LINKED_ACCOUNT_ENCRYPTION_KEY: optionalStr({ default: undefined, desc: 'AES-256 key for encrypting OAuth tokens in linked_accounts table (set in Vercel environment variables)' }),
		CRON_SECRET: optionalStr({ default: undefined, desc: 'Secret for securing Vercel cron endpoints (set in Vercel environment variables)' }),
	})
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	: ({} as any);

export const serverConfig = {
	SUPABASE_URL: serverEnv.SUPABASE_URL as string,
	SUPABASE_SERVICE_ROLE_KEY: serverEnv.SUPABASE_SERVICE_ROLE_KEY as string,
	MUX_TOKEN_ID: (serverEnv.MUX_TOKEN_ID ?? null) as string | null,
	MUX_TOKEN_SECRET: (serverEnv.MUX_TOKEN_SECRET ?? null) as string | null,
	MUX_WEBHOOK_SECRET: (serverEnv.MUX_WEBHOOK_SECRET ?? null) as string | null,
	REVENUECAT_API_KEY: (serverEnv.REVENUECAT_API_KEY ?? null) as string | null,
	REVENUECAT_WEBHOOK_SECRET: (serverEnv.REVENUECAT_WEBHOOK_SECRET ?? null) as string | null,
	REVENUECAT_USE_SANDBOX: (serverEnv.REVENUECAT_USE_SANDBOX ?? false) as boolean,
	STRIPE_SECRET_KEY: (serverEnv.STRIPE_SECRET_KEY ?? null) as string | null,
	STRIPE_WEBHOOK_SECRET: (serverEnv.STRIPE_WEBHOOK_SECRET ?? null) as string | null,
	STRIPE_MONTHLY_PRICE_ID: (serverEnv.STRIPE_MONTHLY_PRICE_ID ?? null) as string | null,
	STRIPE_YEARLY_PRICE_ID: (serverEnv.STRIPE_YEARLY_PRICE_ID ?? null) as string | null,
	YOUTUBE_CLIENT_ID: (serverEnv.YOUTUBE_CLIENT_ID ?? null) as string | null,
	YOUTUBE_CLIENT_SECRET: (serverEnv.YOUTUBE_CLIENT_SECRET ?? null) as string | null,
	YOUTUBE_CHANNEL_ID: (serverEnv.YOUTUBE_CHANNEL_ID ?? null) as string | null,
	YOUTUBE_REFRESH_TOKEN: (serverEnv.YOUTUBE_REFRESH_TOKEN ?? null) as string | null,
	PATREON_CLIENT_ID: (serverEnv.PATREON_CLIENT_ID ?? null) as string | null,
	PATREON_CLIENT_SECRET: (serverEnv.PATREON_CLIENT_SECRET ?? null) as string | null,
	PATREON_CAMPAIGN_ID: (serverEnv.PATREON_CAMPAIGN_ID ?? null) as string | null,
	PATREON_CREATOR_ACCESS_TOKEN: (serverEnv.PATREON_CREATOR_ACCESS_TOKEN ?? null) as string | null,
	PATREON_WEBHOOK_SECRET: (serverEnv.PATREON_WEBHOOK_SECRET ?? null) as string | null,
	LINKED_ACCOUNT_ENCRYPTION_KEY: (serverEnv.LINKED_ACCOUNT_ENCRYPTION_KEY ?? null) as string | null,
	CRON_SECRET: (serverEnv.CRON_SECRET ?? null) as string | null,
	NEXT_PUBLIC_APP_URL: (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
} as const;

/**
 * Public configuration for client-side use
 *
 * Best Practice: NEXT_PUBLIC_* variables are embedded at build time by Next.js.
 * Access them directly via process.env.NEXT_PUBLIC_* in client code.
 * Vercel automatically makes these available during builds.
 *
 * @see https://nextjs.org/docs/basic-features/environment-variables#exposing-environment-variables-to-the-browser
 */
export const publicConfig = {
	// NEXT_PUBLIC_* vars accessed directly — Next.js replaces these with literals at build time
	NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
	NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
	NEXT_PUBLIC_ENABLE_HOVER_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_HOVER_PREVIEW === 'true',

	// RevenueCat API keys - accessed directly from process.env (Next.js best practice)
	// Next.js replaces process.env.NEXT_PUBLIC_* with literal strings at build time
	// This ensures Vercel environment variables are properly embedded
	NEXT_PUBLIC_REVENUECAT_WEB_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined) ?? null,
	NEXT_PUBLIC_REVENUECAT_IOS_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined) ?? null,
	NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY as string | undefined) ?? null,
	// Sandbox keys for testing (use when REVENUECAT_USE_SANDBOX=true or in development)
	NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY as string | undefined) ?? null,
	NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY as string | undefined) ?? null,
	NEXT_PUBLIC_REVENUECAT_ANDROID_SANDBOX_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_SANDBOX_API_KEY as string | undefined) ?? null,
	// Sandbox mode flag (can be set to 'true' to force Sandbox mode even in production)
	NEXT_PUBLIC_REVENUECAT_USE_SANDBOX: (process.env.NEXT_PUBLIC_REVENUECAT_USE_SANDBOX as string | undefined) ?? 'false',
	// Legacy: Keep for backward compatibility, will use web key if platform-specific not set
	NEXT_PUBLIC_REVENUECAT_API_KEY: (process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined) ?? null,
} as const;
