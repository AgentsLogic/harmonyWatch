import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';
import { verifyAdmin } from '@/lib/utils/admin-auth';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Check if a user has an active paid subscription (Stripe or Apple/RevenueCat)
 * GET /api/admin/users/[id]/check-paid-subscription
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminCheck = await verifyAdmin(request);
    if (adminCheck.error) {
      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { id: userId } = await params;

    // Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check subscription access using unified service
    const subscriptionAccess = await checkSubscriptionAccess(userId);

    const hasActivePaidSubscription = subscriptionAccess.hasAccess;
    const subscription = subscriptionAccess.subscription;

    // Determine subscription type
    let subscriptionType: 'stripe' | 'revenuecat_ios' | 'revenuecat_web' | 'manual' | null = null;
    if (subscription) {
      if (subscription.provider === 'stripe') {
        subscriptionType = 'stripe';
      } else if (subscription.provider === 'revenuecat_ios') {
        subscriptionType = 'revenuecat_ios';
      } else if (subscription.provider === 'revenuecat_web') {
        subscriptionType = 'revenuecat_web';
      } else if (subscription.provider === 'manual') {
        subscriptionType = 'manual';
      }
    }

    return NextResponse.json(
      {
        hasActivePaidSubscription,
        subscriptionType,
        subscriptionProvider: subscription?.provider || null,
        subscriptionStatus: subscription?.status || null,
        subscriptionPlan: subscription?.plan || null,
        expiresAt: subscription?.expires_at || null,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Check paid subscription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
