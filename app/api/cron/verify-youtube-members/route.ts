import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { batchFilterByMemberChannelId } from '@/lib/services/youtube-membership';
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
    console.warn('[YouTube Cron] CRON_SECRET not configured');
    // In development, allow without secret (not recommended for production)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[YouTube Cron] Development mode: skipping secret verification');
      return true;
    }
    return false;
  }

  // Check if Authorization header matches CRON_SECRET
  // Vercel sends it as "Bearer <secret>" or just the secret
  // TypeScript now knows expectedSecret is string after the null check above
  const providedSecret = authHeader?.replace(/^Bearer\s+/i, '').trim();
  return providedSecret === (expectedSecret as string).trim();
}

/**
 * GET /api/cron/verify-youtube-members
 * Daily cron job to verify YouTube membership status for all linked accounts
 */
export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active linked YouTube accounts
    const { data: linkedAccounts, error: fetchError } = await supabaseAdmin
      .from('linked_accounts')
      .select('user_id, external_user_id, metadata')
      .eq('platform', 'youtube')
      .eq('status', 'active');

    if (fetchError) {
      console.error('[YouTube Cron] Error fetching linked accounts:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch linked accounts' },
        { status: 500 }
      );
    }

    if (!linkedAccounts || linkedAccounts.length === 0) {
      return NextResponse.json({
        message: 'No linked YouTube accounts to verify',
        checked: 0,
        active: 0,
        expired: 0,
      });
    }

    // Extract channel IDs
    const channelIds = linkedAccounts.map((account) => account.external_user_id);

    // Batch check membership status
    const memberChannelIds = await batchFilterByMemberChannelId(channelIds);

    // Process each linked account
    let activeCount = 0;
    let expiredCount = 0;
    const now = new Date();

    for (const account of linkedAccounts) {
      const channelId = account.external_user_id;
      const userId = account.user_id;
      const isMember = memberChannelIds.has(channelId);

      // Check if user has pending_expiry flag (24-hour grace period)
      const metadata = account.metadata || {};
      const pendingExpiry = metadata.pending_expiry;
      const pendingExpiryDate = pendingExpiry
        ? new Date(pendingExpiry)
        : null;

      if (isMember) {
        // User is a member - ensure subscription is active
        // Clear pending_expiry flag if it exists
        if (pendingExpiry) {
          await supabaseAdmin
            .from('linked_accounts')
            .update({
              metadata: { ...metadata, pending_expiry: null },
              last_verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('platform', 'youtube');
        }

        // Upsert active subscription
        await upsertSubscription({
          user_id: userId,
          provider: 'youtube',
          external_id: channelId,
          status: 'active',
          plan: 'monthly',
          current_period_start: new Date().toISOString(),
          provider_data: {
            channel_id: channelId,
          },
        });

        activeCount++;
      } else {
        // User is not a member
        if (pendingExpiry && pendingExpiryDate && pendingExpiryDate > now) {
          // Still in grace period - don't expire yet
          continue;
        }

        if (pendingExpiry && pendingExpiryDate && pendingExpiryDate <= now) {
          // Grace period expired - mark subscription as expired
          await upsertSubscription({
            user_id: userId,
            provider: 'youtube',
            external_id: channelId,
            status: 'expired',
            plan: 'monthly',
            provider_data: {
              channel_id: channelId,
            },
          });

          // Clear pending_expiry flag
          await supabaseAdmin
            .from('linked_accounts')
            .update({
              metadata: { ...metadata, pending_expiry: null },
              last_verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('platform', 'youtube');

          // Sync user role
          await syncUserRoleFromSubscriptions(userId);
          expiredCount++;
        } else if (!pendingExpiry) {
          // First time missing - set pending_expiry flag (24-hour grace period)
          const gracePeriodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

          await supabaseAdmin
            .from('linked_accounts')
            .update({
              metadata: { ...metadata, pending_expiry: gracePeriodEnd.toISOString() },
              last_verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('platform', 'youtube');
        }
      }
    }

    return NextResponse.json({
      message: 'YouTube membership verification completed',
      checked: linkedAccounts.length,
      active: activeCount,
      expired: expiredCount,
      pending_grace_period: linkedAccounts.length - activeCount - expiredCount,
    });
  } catch (error) {
    console.error('[YouTube Cron] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
