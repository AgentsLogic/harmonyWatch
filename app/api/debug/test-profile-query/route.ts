import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';

const supabaseService = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// Auth client (same as login route)
const supabaseAuth = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};
  const testUserId = request.nextUrl.searchParams.get('user_id') || '';
  
  results.build_marker = 'DEBUG_V3_' + new Date().toISOString();
  results.vercel_git_commit_sha = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8);

  // Test 1: Basic query with limit (already proven to work)
  try {
    const { data, error } = await supabaseService
      .from('user_profiles')
      .select('user_type, display_name, signup_status')
      .limit(1);
    results.test1_limit = { success: !error, rows: data?.length, error: error ? error.message : null };
  } catch (e: any) {
    results.test1_limit = { success: false, error: e.message };
  }

  // Test 2: EXACT same query pattern as /api/auth/login line 47-51
  // Uses .eq().single() which is different from .limit(1)
  if (testUserId) {
    try {
      const { data, error } = await supabaseService
        .from('user_profiles')
        .select('user_type, display_name, signup_status')
        .eq('user_id', testUserId)
        .single();
      results.test2_eq_single = {
        success: !error,
        data: data ? { user_type: data.user_type, display_name: data.display_name } : null,
        error: error ? { code: error.code, message: error.message, details: error.details } : null,
      };
    } catch (e: any) {
      results.test2_eq_single = { success: false, error: e.message };
    }
  } else {
    results.test2_eq_single = 'SKIPPED - pass ?user_id=UUID to test';
  }

  // Test 3: EXACT same query pattern as /api/auth/me line 138-142
  if (testUserId) {
    try {
      const { data, error } = await supabaseService
        .from('user_profiles')
        .select('user_type, display_name, avatar_url, bio, signup_status')
        .eq('user_id', testUserId)
        .single();
      results.test3_me_pattern = {
        success: !error,
        data: data ? { user_type: data.user_type, display_name: data.display_name, signup_status: data.signup_status } : null,
        error: error ? { code: error.code, message: error.message, details: error.details } : null,
      };
    } catch (e: any) {
      results.test3_me_pattern = { success: false, error: e.message };
    }
  } else {
    results.test3_me_pattern = 'SKIPPED - pass ?user_id=UUID to test';
  }

  // Test 4: checkSubscriptionAccess (this is called after profile in login/me)
  if (testUserId) {
    try {
      const access = await checkSubscriptionAccess(testUserId);
      results.test4_subscription_check = {
        success: true,
        hasAccess: access.hasAccess,
        source: access.source,
        subscriptionId: access.subscription?.id,
      };
    } catch (e: any) {
      results.test4_subscription_check = { success: false, error: e.message };
    }
  } else {
    results.test4_subscription_check = 'SKIPPED - pass ?user_id=UUID to test';
  }

  // Test 5: Simulate FULL login flow (auth + profile + subscription)
  // Uses email/password from query params for testing ONLY
  const testEmail = request.nextUrl.searchParams.get('email');
  const testPassword = request.nextUrl.searchParams.get('password');
  if (testEmail && testPassword) {
    try {
      // Step A: Auth
      const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      
      if (authError) {
        results.test5_full_flow = { success: false, step: 'auth', error: authError.message };
      } else {
        results.test5_full_flow_auth = { success: true, user_id: authData.user?.id };
        
        // Step B: Profile query (exact same as login route)
        const { data: profile, error: profileError } = await supabaseService
          .from('user_profiles')
          .select('user_type, display_name, signup_status')
          .eq('user_id', authData.user!.id)
          .single();
        
        if (profileError) {
          results.test5_full_flow_profile = {
            success: false,
            step: 'profile',
            error: { code: profileError.code, message: profileError.message, details: profileError.details },
          };
          
          // Step B fallback: raw fetch
          const rawUrl = `${publicConfig.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${authData.user!.id}&select=user_type,display_name,signup_status`;
          const rawResponse = await fetch(rawUrl, {
            headers: {
              'Authorization': `Bearer ${serverConfig.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': serverConfig.SUPABASE_SERVICE_ROLE_KEY,
              'Accept': 'application/vnd.pgrst.object+json',
            },
          });
          const rawBody = await rawResponse.text();
          results.test5_full_flow_profile_raw_fallback = {
            status: rawResponse.status,
            body: rawBody.substring(0, 500),
          };
        } else {
          results.test5_full_flow_profile = { success: true, user_type: profile.user_type };
          
          // Step C: Subscription check
          try {
            const access = await checkSubscriptionAccess(authData.user!.id);
            results.test5_full_flow_subscription = { success: true, hasAccess: access.hasAccess };
          } catch (subErr: any) {
            results.test5_full_flow_subscription = { success: false, error: subErr.message };
          }
        }
      }
    } catch (e: any) {
      results.test5_full_flow = { success: false, error: e.message };
    }
  } else {
    results.test5_full_flow = 'SKIPPED - pass ?email=X&password=Y to test full login flow';
  }

  // Test 6: Raw fetch with .single() equivalent header (Accept: application/vnd.pgrst.object+json)
  if (testUserId) {
    try {
      const rawUrl = `${publicConfig.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${testUserId}&select=user_type,display_name,signup_status`;
      const rawResponse = await fetch(rawUrl, {
        headers: {
          'Authorization': `Bearer ${serverConfig.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': serverConfig.SUPABASE_SERVICE_ROLE_KEY,
          'Accept': 'application/vnd.pgrst.object+json', // This is what .single() adds
        },
      });
      const rawBody = await rawResponse.text();
      results.test6_raw_single = {
        success: rawResponse.ok,
        status: rawResponse.status,
        body: rawBody.substring(0, 500),
      };
    } catch (e: any) {
      results.test6_raw_single = { success: false, error: e.message };
    }
  } else {
    results.test6_raw_single = 'SKIPPED - pass ?user_id=UUID to test';
  }

  return NextResponse.json(results, { status: 200 });
}
