import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getCampaignMembers,
  calculatePatreonExpiresAt,
} from '@/lib/services/patreon-membership';
import {
  upsertSubscription,
  syncUserRoleFromSubscriptions,
} from '@/lib/services/subscription-service';

/**
 * Verify CRON_SECRET authorization
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = serverConfig.CRON_SECRET;

  if (!expectedSecret) {
    console.error('[Patreon Cron] CRON_SECRET is not configured — rejecting request');
    return false;
  }

  // Check if Authorization header matches CRON_SECRET
  // Vercel sends it as "Bearer <secret>" or just the secret
  // TypeScript now knows expectedSecret is string after the null check above
  const providedSecret = authHeader?.replace(/^Bearer\s+/i, '').trim();
  return providedSecret === (expectedSecret as string).trim();
}

/**
 * Map Patreon patron_status to subscription status
 */
function mapPatronStatusToSubscriptionStatus(
  patronStatus: string | null,
  nextChargeDate: string | null,
  lastChargeDate: string | null,
  pledgeCadence: number | null
): {
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  expiresAt: string | null;
} {
  if (patronStatus === 'active_patron') {
    return {
      status: 'active',
      expiresAt: nextChargeDate,
    };
  }

  if (patronStatus === 'declined_patron') {
    return {
      status: 'past_due',
      expiresAt: nextChargeDate,
    };
  }

  if (patronStatus === 'former_patron') {
    // Calculate expiration using cancellation logic
    const { status, expiresAt } = calculatePatreonExpiresAt(
      nextChargeDate,
      lastChargeDate,
      pledgeCadence
    );
    return { status, expiresAt };
  }

  // null or unknown status → expired
  return {
    status: 'expired',
    expiresAt: null,
  };
}

/**
 * GET /api/cron/verify-patreon-members
 * Daily cron job to verify Patreon membership status for all linked accounts
 * This serves as a backup to webhooks and catches any missed events
 */
export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active linked Patreon accounts
    const { data: linkedAccounts, error: fetchError } = await supabaseAdmin
      .from('linked_accounts')
      .select('user_id, external_user_id, metadata')
      .eq('platform', 'patreon')
      .eq('status', 'active');

    if (fetchError) {
      console.error('[Patreon Cron] Error fetching linked accounts:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch linked accounts' },
        { status: 500 }
      );
    }

    if (!linkedAccounts || linkedAccounts.length === 0) {
      return NextResponse.json({
        message: 'No linked Patreon accounts to verify',
        checked: 0,
        active: 0,
        expired: 0,
      });
    }

    // Fetch all campaign members from Patreon
    const allMembers: Array<{
      id: string;
      user_id: string; // Patreon user ID
      patron_status: string | null;
      email: string;
      full_name: string;
      last_charge_status: string | null;
      last_charge_date: string | null;
      next_charge_date: string | null;
      pledge_cadence: number | null;
      pledge_relationship_start: string | null;
    }> = [];

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const { members, hasMore: more } = await getCampaignMembers({
          page,
          pageSize: 25,
        });
        allMembers.push(...members);
        hasMore = more;
        page++;
      } catch (error) {
        console.error('[Patreon Cron] Error fetching campaign members:', error);
        break;
      }
    }

    // Create a map of Patreon user IDs to member data
    const memberMap = new Map<string, typeof allMembers[0]>();
    for (const member of allMembers) {
      // Primary: Match by Patreon user ID (stored in linked_accounts.external_user_id)
      if (member.user_id) {
        memberMap.set(member.user_id, member);
      }
      // Fallback: Also index by email for cases where user_id might be missing
      if (member.email) {
        memberMap.set(member.email.toLowerCase(), member);
      }
    }

    // Process each linked account
    let activeCount = 0;
    let expiredCount = 0;
    let notFoundCount = 0;

    for (const account of linkedAccounts) {
      const patreonUserId = account.external_user_id;
      const userId = account.user_id;

      // Try to find member by Patreon user ID (primary) or email (fallback)
      let member = memberMap.get(patreonUserId);
      
      // Fallback to email matching if user ID match failed
      if (!member) {
        const accountEmail = account.metadata?.email?.toLowerCase() || 
                           (await supabaseAdmin
                             .from('linked_accounts')
                             .select('external_email')
                             .eq('user_id', userId)
                             .eq('platform', 'patreon')
                             .single()).data?.external_email?.toLowerCase();
        
        if (accountEmail) {
          member = memberMap.get(accountEmail);
        }
      }

      if (!member) {
        // Member not found in campaign - check if subscription should be expired
        // This could mean they canceled or were removed
        notFoundCount++;

        // Check current subscription status
        const { data: currentSub } = await supabaseAdmin
          .from('subscriptions')
          .select('status, expires_at')
          .eq('user_id', userId)
          .eq('provider', 'patreon')
          .eq('external_id', patreonUserId)
          .maybeSingle();

        if (currentSub && currentSub.status !== 'expired') {
          // Member is no longer in campaign - expire subscription
          await upsertSubscription({
            user_id: userId,
            provider: 'patreon',
            external_id: patreonUserId,
            status: 'expired',
            plan: 'monthly', // Default, will be updated if we have metadata
            provider_data: {
              patron_status: null,
            },
          });

          // Sync user role
          await syncUserRoleFromSubscriptions(userId);
          expiredCount++;
        }
        continue;
      }

      // Member found - update subscription based on patron_status
      const { status, expiresAt } = mapPatronStatusToSubscriptionStatus(
        member.patron_status,
        member.next_charge_date,
        member.last_charge_date,
        member.pledge_cadence
      );

      const plan = member.pledge_cadence === 12 ? 'yearly' : 'monthly';

      await upsertSubscription({
        user_id: userId,
        provider: 'patreon',
        external_id: patreonUserId,
        status,
        plan,
        current_period_start: member.pledge_relationship_start || new Date().toISOString(),
        current_period_end: expiresAt,
        expires_at: expiresAt,
        canceled_at: status === 'canceled' ? new Date().toISOString() : null,
        provider_data: {
          patron_status: member.patron_status,
          pledge_cadence: member.pledge_cadence,
          next_charge_date: member.next_charge_date,
          last_charge_date: member.last_charge_date,
          last_charge_status: member.last_charge_status,
        },
      });

      // Update linked account metadata
      await supabaseAdmin
        .from('linked_accounts')
        .update({
          metadata: {
            patron_status: member.patron_status,
            pledge_cadence: member.pledge_cadence,
            next_charge_date: member.next_charge_date,
          },
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('platform', 'patreon');

      // Sync user role
      await syncUserRoleFromSubscriptions(userId);

      if (status === 'active' || status === 'past_due' || (status === 'canceled' && expiresAt)) {
        activeCount++;
      } else {
        expiredCount++;
      }
    }

    return NextResponse.json({
      message: 'Patreon membership verification completed',
      checked: linkedAccounts.length,
      active: activeCount,
      expired: expiredCount,
      not_found: notFoundCount,
      campaign_members_total: allMembers.length,
    });
  } catch (error) {
    console.error('[Patreon Cron] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
