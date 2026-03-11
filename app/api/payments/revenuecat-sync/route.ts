import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { upsertSubscription, syncUserRoleFromSubscriptions } from '@/lib/services/subscription-service';
import { revenueCatEntitlementToUnifiedParams } from '@/app/api/webhooks/revenuecat/route';

// Helper to get user from Supabase auth
async function getUserFromAuth(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (!accessToken) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error getting user from auth:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getUserFromAuth(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { customerInfo, plan } = body;

    if (!customerInfo) {
      return NextResponse.json(
        { error: 'Customer info is required' },
        { status: 400 }
      );
    }

    // Check if user has active entitlements
    // RevenueCat entitlements can have is_active: undefined, so we also check expiration date
    const entitlements = customerInfo.entitlements || {};
    const now = new Date();
    let activeEntitlement: any = null;
    const hasActiveEntitlement = Object.values(entitlements).some((entitlement: any) => {
      // Check if explicitly active
      const isActive = entitlement.is_active === true;
      
      // Check expiration date - if it exists and is in the past, entitlement is expired
      let isNotExpired = true;
      if (entitlement.expires_date) {
        const expiresDate = new Date(entitlement.expires_date);
        isNotExpired = expiresDate > now;
      }
      
      // If is_active is undefined but expiration is in future, consider it active
      // (some RevenueCat responses don't include is_active for active entitlements)
      if (entitlement.is_active === undefined && isNotExpired) {
        activeEntitlement = entitlement;
        return true;
      }
      
      if (isActive && isNotExpired) {
        activeEntitlement = entitlement;
        return true;
      }
      
      return false;
    });

    // Upsert subscription to unified subscriptions table
    if (activeEntitlement) {
      // Try to determine store from customerInfo (subscriptions object)
      const subscriptions = customerInfo.subscriptions || {};
      const nonSubscriptions = customerInfo.non_subscriptions || {};
      const allSubs = { ...subscriptions, ...nonSubscriptions };
      const matchingSub = Object.values(allSubs).find((sub: any) => {
        return sub.product_identifier === activeEntitlement.product_identifier;
      }) as any;
      const store = matchingSub?.store || null;

      // Convert to unified subscription params and upsert
      const params = revenueCatEntitlementToUnifiedParams(user.id, activeEntitlement, store);
      if (params) {
        await upsertSubscription(params);
      }
    }

    // Sync user role from subscriptions table (will update user_type and signup_status)
    await syncUserRoleFromSubscriptions(user.id);

    // Get updated profile to return
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_type, signup_status, display_name, avatar_url, bio')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('[RevenueCat Sync] Failed to fetch updated profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch updated profile' },
        { status: 500 }
      );
    }


    // Return updated user data
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_type: profile.user_type,
        signup_status: profile.signup_status,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        created_at: user.created_at,
        last_login: user.last_sign_in_at
      }
    });
  } catch (error) {
    console.error('[RevenueCat Sync] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


