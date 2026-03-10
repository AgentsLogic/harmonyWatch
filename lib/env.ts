import { cleanEnv, str, url, makeValidator, bool } from 'envalid';

// Custom validator that treats empty string as undefined (useful for optional secrets)
const optionalStr = makeValidator<string | undefined>((value) => {
	if (value === undefined || value === null) return undefined;
	const s = String(value).trim();
	if (s.length === 0) return undefined;
	return s;
});

// Validate and normalize environment variables once when accessed
// Build-time defaults are provided for VoltBuilder builds, but production uses Vercel environment variables
// Vercel environment variables will override these defaults in production
export const env = cleanEnv(process.env, {
	// Server-only - Required from Vercel (build-time defaults for VoltBuilder)
	SUPABASE_URL: url({
		default: 'https://qwcunnnhwbewjhqoddec.supabase.co',
		desc: 'Supabase project URL (set in Vercel environment variables, defaults for build)',
	}),
	SUPABASE_SERVICE_ROLE_KEY: str({
		default: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Y3Vubm5od2Jld2pocW9kZGVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYzMDA4OSwiZXhwIjoyMDc2MjA2MDg5fQ.kINOkWrsZcY1nRJrGf3ziI8i5ImtUY0_87yTVNfvunQ',
		desc: 'Supabase service role key (set in Vercel environment variables, defaults for build)',
	}),

	// Mux - Required from Vercel (build-time defaults for VoltBuilder)
	MUX_TOKEN_ID: str({
		default: 'afc0f633-a8bd-4aee-81bf-a4079c32e1ca',
		desc: 'Mux API token ID (set in Vercel environment variables, defaults for build)',
	}),
	MUX_TOKEN_SECRET: str({
		default: 'Hnirn8r6kr/6TZ0QXYygiQv5McbJY2PCaFq16f+z8zj32m6VU4aGGYdWM+lGKvNdbF7HWGUGOfP',
		desc: 'Mux API token secret (set in Vercel environment variables, defaults for build)',
	}),
	MUX_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'Mux webhook signing secret (optional, set in Vercel if using Mux webhooks)' }),

	// RevenueCat - Optional (required if using RevenueCat)
	// Note: NEXT_PUBLIC_* variables are accessed directly via process.env in client code (Next.js best practice)
	// They are NOT validated here because they're embedded at build time by Next.js
	REVENUECAT_API_KEY: optionalStr({ default: undefined, desc: 'RevenueCat public API key for server-side (set in Vercel environment variables)' }),
	REVENUECAT_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'RevenueCat webhook authorization header value (set in Vercel environment variables)' }),
	// Sandbox keys for testing (use in development/test mode)
	REVENUECAT_USE_SANDBOX: bool({ default: false, desc: 'Use RevenueCat Sandbox API keys for testing (set to true in development)' }),

	// Stripe - Optional (required if using Stripe payments)
	STRIPE_SECRET_KEY: optionalStr({ default: undefined, desc: 'Stripe secret key (set in Vercel environment variables)' }),
	STRIPE_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'Stripe webhook signing secret (set in Vercel environment variables)' }),
	STRIPE_MONTHLY_PRICE_ID: optionalStr({ default: undefined, desc: 'Stripe monthly subscription price ID (set in Vercel environment variables)' }),
	STRIPE_YEARLY_PRICE_ID: optionalStr({ default: undefined, desc: 'Stripe yearly subscription price ID (set in Vercel environment variables)' }),

	// YouTube - Optional (required if using YouTube membership linking)
	YOUTUBE_CLIENT_ID: optionalStr({ default: undefined, desc: 'Google Cloud OAuth client ID for YouTube (set in Vercel environment variables)' }),
	YOUTUBE_CLIENT_SECRET: optionalStr({ default: undefined, desc: 'Google Cloud OAuth client secret for YouTube (set in Vercel environment variables)' }),
	YOUTUBE_CHANNEL_ID: optionalStr({ default: undefined, desc: 'YouTube channel ID for members.list API (set in Vercel environment variables)' }),
	YOUTUBE_REFRESH_TOKEN: optionalStr({ default: undefined, desc: 'Channel owner OAuth refresh token for server-side members.list calls (set in Vercel environment variables)' }),

	// Patreon - Optional (required if using Patreon membership linking)
	PATREON_CLIENT_ID: optionalStr({ default: undefined, desc: 'Patreon OAuth client ID (set in Vercel environment variables)' }),
	PATREON_CLIENT_SECRET: optionalStr({ default: undefined, desc: 'Patreon OAuth client secret (set in Vercel environment variables)' }),
	PATREON_CAMPAIGN_ID: optionalStr({ default: undefined, desc: 'Patreon campaign ID (set in Vercel environment variables)' }),
	PATREON_CREATOR_ACCESS_TOKEN: optionalStr({ default: undefined, desc: 'Patreon creator access token with all V2 scopes (set in Vercel environment variables)' }),
	PATREON_WEBHOOK_SECRET: optionalStr({ default: undefined, desc: 'Patreon webhook signing secret for HEX(HMAC-MD5) verification (set in Vercel environment variables)' }),

	// Security - Optional (required for OAuth token encryption and cron job security)
	LINKED_ACCOUNT_ENCRYPTION_KEY: optionalStr({ default: undefined, desc: 'AES-256 key for encrypting OAuth tokens in linked_accounts table (set in Vercel environment variables)' }),
	CRON_SECRET: optionalStr({ default: undefined, desc: 'Secret for securing Vercel cron endpoints (set in Vercel environment variables)' }),

	// Client-safe - Required from Vercel (build-time defaults for VoltBuilder)
	NEXT_PUBLIC_SUPABASE_URL: url({
		default: 'https://qwcunnnhwbewjhqoddec.supabase.co',
		desc: 'Supabase URL for client-side (set in Vercel environment variables, defaults for build)',
	}),
	NEXT_PUBLIC_SUPABASE_ANON_KEY: str({
		default: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Y3Vubm5od2Jld2pocW9kZGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzAwODksImV4cCI6MjA3NjIwNjA4OX0.4Tj_pb2-dblb-w-bEM4FrbeEg0lNixQVoHMsNRB-8T0',
		desc: 'Supabase anonymous key for client-side (set in Vercel environment variables, defaults for build)',
	}),
	NEXT_PUBLIC_APP_URL: str({ 
		default: 'http://localhost:3000', 
		desc: 'App URL for CORS and redirects (defaults to localhost for local dev, set in Vercel for production)' 
	}),
	NEXT_PUBLIC_ENABLE_HOVER_PREVIEW: bool({ default: false, desc: 'Enable hover preview UI on shelves' }),
});

export const serverConfig = {
	SUPABASE_URL: env.SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
	MUX_TOKEN_ID: env.MUX_TOKEN_ID ?? null,
	MUX_TOKEN_SECRET: env.MUX_TOKEN_SECRET ?? null,
	MUX_WEBHOOK_SECRET: env.MUX_WEBHOOK_SECRET ?? null,
	REVENUECAT_API_KEY: env.REVENUECAT_API_KEY ?? null,
	REVENUECAT_WEBHOOK_SECRET: env.REVENUECAT_WEBHOOK_SECRET ?? null,
	REVENUECAT_USE_SANDBOX: env.REVENUECAT_USE_SANDBOX,
	STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ?? null,
	STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ?? null,
	STRIPE_MONTHLY_PRICE_ID: env.STRIPE_MONTHLY_PRICE_ID ?? null,
	STRIPE_YEARLY_PRICE_ID: env.STRIPE_YEARLY_PRICE_ID ?? null,
	YOUTUBE_CLIENT_ID: env.YOUTUBE_CLIENT_ID ?? null,
	YOUTUBE_CLIENT_SECRET: env.YOUTUBE_CLIENT_SECRET ?? null,
	YOUTUBE_CHANNEL_ID: env.YOUTUBE_CHANNEL_ID ?? null,
	YOUTUBE_REFRESH_TOKEN: env.YOUTUBE_REFRESH_TOKEN ?? null,
	PATREON_CLIENT_ID: env.PATREON_CLIENT_ID ?? null,
	PATREON_CLIENT_SECRET: env.PATREON_CLIENT_SECRET ?? null,
	PATREON_CAMPAIGN_ID: env.PATREON_CAMPAIGN_ID ?? null,
	PATREON_CREATOR_ACCESS_TOKEN: env.PATREON_CREATOR_ACCESS_TOKEN ?? null,
	PATREON_WEBHOOK_SECRET: env.PATREON_WEBHOOK_SECRET ?? null,
	LINKED_ACCOUNT_ENCRYPTION_KEY: env.LINKED_ACCOUNT_ENCRYPTION_KEY ?? null,
	CRON_SECRET: env.CRON_SECRET ?? null,
	NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
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
	// Validated server-side variables (with defaults for VoltBuilder)
	NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
	NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
	NEXT_PUBLIC_ENABLE_HOVER_PREVIEW: env.NEXT_PUBLIC_ENABLE_HOVER_PREVIEW,
	
	// RevenueCat API keys - accessed directly from process.env (Next.js best practice)
	// Next.js replaces process.env.NEXT_PUBLIC_* with literal strings at build time
	// This ensures Vercel environment variables are properly embedded
	// Platform-specific keys for better tracking and configuration
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


