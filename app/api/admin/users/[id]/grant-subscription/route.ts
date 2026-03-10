import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { checkSubscriptionAccess } from '@/lib/services/subscription-check';
import { upsertSubscription, syncUserRoleFromSubscriptions } from '@/lib/services/subscription-service';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to verify admin access
async function verifyAdmin(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (!accessToken) {
    return { error: 'No access token found', status: 401, user: null };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  
  if (authError || !user) {
    return { error: 'Invalid or expired token', status: 401, user: null };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_type')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: 'Unauthorized - Admin access required', status: 403, user: null };
  }

  return { error: null, status: 200, user };
}

// POST - Grant free subscription days to a user
export async function POST(
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
    const { days, minutes } = await request.json();

    // Validate input - must have either days or minutes, but not both
    const hasDays = days !== undefined && days !== null;
    const hasMinutes = minutes !== undefined && minutes !== null;

    if (!hasDays && !hasMinutes) {
      return NextResponse.json(
        { error: 'Either days or minutes must be provided' },
        { status: 400 }
      );
    }

    if (hasDays && hasMinutes) {
      return NextResponse.json(
        { error: 'Cannot provide both days and minutes. Please provide only one.' },
        { status: 400 }
      );
    }

    const value = hasDays ? days : minutes;
    const unit = hasDays ? 'days' : 'minutes';

    if (typeof value !== 'number' || value <= 0) {
      return NextResponse.json(
        { error: `${unit === 'days' ? 'Days' : 'Minutes'} must be a positive number` },
        { status: 400 }
      );
    }

    // Get current user profile
    const { data: userProfile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (fetchError || !userProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check for active paid subscription using unified service
    const subscriptionAccess = await checkSubscriptionAccess(userId);

    if (subscriptionAccess.hasAccess && subscriptionAccess.subscription?.provider !== 'manual') {
      const subscription = subscriptionAccess.subscription;
      if (!subscription) {
        return NextResponse.json(
          { error: 'Subscription data unavailable' },
          { status: 500 }
        );
      }
      
      const subscriptionType = subscription.provider === 'stripe' ? 'Stripe' :
                               subscription.provider === 'revenuecat_ios' ? 'Apple/RevenueCat' :
                               subscription.provider === 'revenuecat_web' ? 'RevenueCat Web' :
                               subscription.provider === 'revenuecat_android' ? 'Google Play/RevenueCat' :
                               subscription.provider === 'youtube' ? 'YouTube' :
                               subscription.provider === 'patreon' ? 'Patreon' :
                               'Unknown';
      return NextResponse.json(
        { 
          error: `Cannot grant manual subscription days. User has an active paid subscription via ${subscriptionType}.` 
        },
        { status: 400 }
      );
    }

    // Calculate new expiration date
    // Subscription details are read from subscriptions table only (source of truth)
    const now = new Date();
    const manualSubscriptionId = `manual_${userId}`;
    
    // Check for existing manual subscription in subscriptions table
    const { data: existingManualSub } = await supabase
      .from('subscriptions')
      .select('expires_at, current_period_end')
      .eq('user_id', userId)
      .eq('provider', 'manual')
      .eq('external_id', manualSubscriptionId)
      .maybeSingle();
    
    // Determine current expiration date from subscriptions table only
    let currentExpiresAt: Date | null = null;
    if (existingManualSub) {
      const expiresAt = existingManualSub.expires_at ? new Date(existingManualSub.expires_at) : null;
      const periodEnd = existingManualSub.current_period_end ? new Date(existingManualSub.current_period_end) : null;
      currentExpiresAt = expiresAt || periodEnd;
    }

    let newExpiresAt: Date;

    if (currentExpiresAt && currentExpiresAt > now) {
      // Extend existing subscription
      newExpiresAt = new Date(currentExpiresAt);
      if (unit === 'days') {
        newExpiresAt.setDate(newExpiresAt.getDate() + value);
      } else {
        // minutes
        newExpiresAt.setMinutes(newExpiresAt.getMinutes() + value);
      }
    } else {
      // Start new subscription from now
      newExpiresAt = new Date(now);
      if (unit === 'days') {
        newExpiresAt.setDate(newExpiresAt.getDate() + value);
      } else {
        // minutes
        newExpiresAt.setMinutes(newExpiresAt.getMinutes() + value);
      }
    }

    // Upsert manual subscription into unified table
    const upsertedSubscription = await upsertSubscription({
      user_id: userId,
      provider: 'manual',
      external_id: manualSubscriptionId,
      status: 'active',
      plan: 'monthly', // Default to monthly for free grants
      expires_at: newExpiresAt.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: newExpiresAt.toISOString(),
      provider_data: {
        granted_by: 'admin',
        granted_at: now.toISOString(),
        duration_days: unit === 'days' ? value : null,
        duration_minutes: unit === 'minutes' ? value : null,
      },
    });

    if (!upsertedSubscription) {
      console.error('Error upserting manual subscription');
      return NextResponse.json(
        { error: 'Failed to grant subscription' },
        { status: 500 }
      );
    }

    // Sync user role based on unified subscriptions
    await syncUserRoleFromSubscriptions(userId);

    const unitLabel = unit === 'days' ? 'days' : 'minutes';
    const valueLabel = value === 1 ? unitLabel.slice(0, -1) : unitLabel; // "1 day" vs "2 days", "1 minute" vs "5 minutes"
    
    return NextResponse.json(
      { 
        message: `Successfully granted ${value} ${valueLabel} of premium subscription`,
        subscription_expires_at: newExpiresAt.toISOString(),
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Grant subscription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
