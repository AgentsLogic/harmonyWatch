import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request: NextRequest) {
  try {
    // Get the access token from cookies
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token found' },
        { status: 401 }
      );
    }

    // Verify the user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.user_type !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    // Get total users count
    const { count: totalUsers, error: totalUsersError } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    if (totalUsersError) {
      console.error('Error fetching total users:', totalUsersError);
    }

    // Get free users count
    const { count: freeUsers, error: freeUsersError } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_type', 'free');

    if (freeUsersError) {
      console.error('Error fetching free users:', freeUsersError);
    }

    // Get subscribed users from unified subscriptions table
    const { data: activeSubscriptions, error: subscriptionsError } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status, expires_at')
      .in('status', ['active', 'trialing']);

    if (subscriptionsError) {
      console.error('Error fetching subscriptions:', subscriptionsError);
    }

    // Calculate subscribed users count
    // Count unique users with active subscriptions
    const subscribedUserIds = new Set<string>();
    const now = new Date();
    
    activeSubscriptions?.forEach((sub: any) => {
      if (sub.user_id) {
        // Only count if subscription hasn't expired
        if (!sub.expires_at || new Date(sub.expires_at) > now) {
          subscribedUserIds.add(sub.user_id);
        }
      }
    });

    const subscribedUsers = subscribedUserIds.size;

    // Calculate MRR (Monthly Recurring Revenue)
    // Monthly plan: $7/month
    // Yearly plan: $70/year = $5.83/month
    const MONTHLY_PRICE = 7.0;
    const YEARLY_PRICE = 70.0;
    const YEARLY_MONTHLY_EQUIVALENT = YEARLY_PRICE / 12;

    let monthlySubscriptions = 0;
    let yearlySubscriptions = 0;

    // Count from unified subscriptions table
    activeSubscriptions?.forEach((sub: any) => {
      // Only count if subscription hasn't expired
      if (!sub.expires_at || new Date(sub.expires_at) > now) {
        if (sub.plan === 'monthly') {
          monthlySubscriptions++;
        } else if (sub.plan === 'yearly') {
          yearlySubscriptions++;
        } else {
          // Default to monthly if unclear
          monthlySubscriptions++;
        }
      }
    });

    const estimatedMRR = (monthlySubscriptions * MONTHLY_PRICE) + (yearlySubscriptions * YEARLY_MONTHLY_EQUIVALENT);

    return NextResponse.json({
      statistics: {
        totalUsers: totalUsers || 0,
        subscribedUsers: subscribedUsers,
        freeUsers: freeUsers || 0,
        estimatedMRR: Math.round(estimatedMRR * 100) / 100, // Round to 2 decimal places
        monthlySubscriptions,
        yearlySubscriptions,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Admin statistics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

