import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { planFromPriceId } from '@/lib/services/stripe';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';
import { rateLimit, getClientIp } from '@/lib/utils/rate-limit';
import type { UserSubscription } from '@/app/contexts/user-context';

// Initialize Supabase client with anon key for auth operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Initialize Supabase client with service role key for database operations
const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per IP per 15 minutes
    const ip = getClientIp(request);
    const { success, retryAfter } = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      );
    }

    const { email, password } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Use Supabase auth to sign in with anon key
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    // Get user profile with user_type and profile fields using service role
    // Subscription details are read from subscriptions table only
    console.log('[LOGIN DEBUG v2] Step 1: Querying user_profiles for user_id:', data.user.id);
    const { data: profile, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('user_type, display_name, signup_status')
      .eq('user_id', data.user.id)
      .single();

    if (profileError) {
      console.error('[LOGIN DEBUG v2] Profile fetch error:', JSON.stringify(profileError));
      
      // Fallback: try raw fetch to PostgREST
      console.log('[LOGIN DEBUG v2] Attempting raw fetch fallback...');
      try {
        const rawUrl = `${publicConfig.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${data.user.id}&select=user_type,display_name,signup_status`;
        const rawResponse = await fetch(rawUrl, {
          headers: {
            'Authorization': `Bearer ${serverConfig.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': serverConfig.SUPABASE_SERVICE_ROLE_KEY,
            'Accept': 'application/vnd.pgrst.object+json',
          },
        });
        const rawBody = await rawResponse.text();
        console.log('[LOGIN DEBUG v2] Raw fetch result:', rawResponse.status, rawBody);
      } catch (rawErr) {
        console.error('[LOGIN DEBUG v2] Raw fetch also failed:', rawErr);
      }

      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }
    console.log('[LOGIN DEBUG v2] Step 2: Profile fetched OK, user_type:', profile.user_type);

    // Use unified service to check subscription access
    const subscriptionAccess = await checkSubscriptionAccess(data.user.id);

    // Build subscription object from unified service result
    let subscription: UserSubscription | null = null;
    
    if (subscriptionAccess.subscription) {
      const unifiedSub = subscriptionAccess.subscription;
      
      // Map unified subscription to UserSubscription format
      subscription = {
        id: `${unifiedSub.provider}_${unifiedSub.external_id}`,
        status: unifiedSub.status,
        plan: unifiedSub.plan,
        current_period_start: unifiedSub.current_period_start,
        current_period_end: unifiedSub.current_period_end,
        cancel_at: unifiedSub.cancel_at,
        canceled_at: unifiedSub.canceled_at,
        is_active: subscriptionAccess.hasAccess,
        cancel_at_period_end: unifiedSub.cancel_at !== null,
        store: unifiedSub.provider === 'stripe' ? 'stripe' as const :
               unifiedSub.provider === 'revenuecat_web' ? 'rc_billing' as const :
               unifiedSub.provider === 'revenuecat_ios' ? 'app_store' as const :
               unifiedSub.provider === 'revenuecat_android' ? 'play_store' as const :
               unifiedSub.provider === 'youtube' ? 'youtube' as const :
               unifiedSub.provider === 'patreon' ? 'patreon' as const : null,
        has_billing_issue: unifiedSub.status === 'past_due',
        grace_period_expires_at: unifiedSub.grace_period_expires_at,
      };
      
      // NOTE: management_url is now fetched on-demand via /api/payments/create-revenuecat-portal
      // We don't fetch it here to avoid unnecessary API calls on every login
      if (unifiedSub.provider === 'revenuecat_web' || unifiedSub.provider === 'revenuecat_ios' || unifiedSub.provider === 'revenuecat_android') {
        subscription.management_url = null; // Fetched on-demand when user clicks "Manage Subscription"
      }
    } else if (profile.user_type === 'staff') {
      // Staff users get a virtual subscription that never expires
      subscription = {
        id: `staff_${data.user.id}`,
        status: 'active',
        plan: 'monthly',
        current_period_start: new Date().toISOString(),
        current_period_end: null, // Never expires
        cancel_at: null,
        canceled_at: null,
        is_active: true,
        cancel_at_period_end: false,
      };
    }

    // Create response with session cookies
    const response = NextResponse.json(
      { 
        message: 'Login successful',
        user: {
          id: data.user.id,
          email: data.user.email,
          user_type: profile.user_type,
          signup_status: profile.signup_status,
          display_name: profile.display_name,
          created_at: data.user.created_at,
          last_login: data.user.last_sign_in_at,
          subscription,
        }
      },
      { status: 200 }
    );

    // Set access token cookie - extended to 30 days (refresh will keep it updated)
    if (data.session?.access_token) {
      response.cookies.set('sb-access-token', data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days (was 7 days)
        path: '/'
      });
    }

    // Set refresh token cookie - extended to 90 days for longer sessions
    if (data.session?.refresh_token) {
      response.cookies.set('sb-refresh-token', data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 90, // 90 days (was 30 days)
        path: '/'
      });
    }

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}