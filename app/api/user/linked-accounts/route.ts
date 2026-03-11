import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/user/linked-accounts
 * Returns user's linked accounts with status information
 */
export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Get linked accounts
    const { data: linkedAccounts, error: fetchError } = await supabaseAdmin
      .from('linked_accounts')
      .select('id, platform, external_user_id, external_username, external_email, status, linked_at, last_verified_at, metadata')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('linked_at', { ascending: false });

    if (fetchError) {
      console.error('[Linked Accounts] Error fetching linked accounts:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch linked accounts' },
        { status: 500 }
      );
    }

    // Get associated subscriptions for status
    const { data: subscriptions } = await supabaseAdmin
      .from('subscriptions')
      .select('provider, external_id, status, expires_at')
      .eq('user_id', user.id)
      .in('provider', ['youtube', 'patreon']);

    // Map subscriptions by provider and external_id
    const subscriptionMap = new Map<string, any>();
    if (subscriptions) {
      for (const sub of subscriptions) {
        const key = `${sub.provider}_${sub.external_id}`;
        subscriptionMap.set(key, sub);
      }
    }

    // Format response
    const formattedAccounts = (linkedAccounts || []).map((account) => {
      const subKey = `${account.platform}_${account.external_user_id}`;
      const subscription = subscriptionMap.get(subKey);

      return {
        id: account.id,
        platform: account.platform,
        external_user_id: account.external_user_id,
        external_username: account.external_username,
        external_email: account.external_email,
        status: account.status,
        linked_at: account.linked_at,
        last_verified_at: account.last_verified_at,
        subscription: subscription
          ? {
              status: subscription.status,
              expires_at: subscription.expires_at,
            }
          : null,
        metadata: account.metadata,
      };
    });

    return NextResponse.json({
      linked_accounts: formattedAccounts,
    });
  } catch (error) {
    console.error('[Linked Accounts] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
