import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { batchFilterByMemberChannelId } from '@/lib/services/youtube-membership';
import {
  batchUpsertSubscriptions,
  syncUserRoleFromSubscriptions,
  type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';

/**
 * Verify CRON_SECRET authorization
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = serverConfig.CRON_SECRET;

  if (!expectedSecret) {
    console.error('[YouTube Cron] CRON_SECRET is not configured — rejecting request');
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

    // Pre-fetch all existing YouTube subscriptions for these users in one query
    const userIds = linkedAccounts.map((a) => a.user_id);
    const { data: existingSubs } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, external_id, status')
      .in('user_id', userIds)
      .eq('provider', 'youtube');

    const existingSubMap = new Map<string, string>();
    for (const sub of existingSubs || []) {
      existingSubMap.set(`${sub.user_id}:${sub.external_id}`, sub.status);
    }

    // Build batch arrays — no DB calls inside the loop
    const subscriptionUpserts: UpsertSubscriptionParams[] = [];
    const linkedAccountUpdates: Array<{ userId: string; data: object }> = [];
    const expiredUserIds = new Set<string>(); // only expired users need role sync

    let activeCount = 0;
    let expiredCount = 0;
    const now = new Date();

    for (const account of linkedAccounts) {
      const channelId = account.external_user_id;
      const userId = account.user_id;
      const isMember = memberChannelIds.has(channelId);
      const metadata = account.metadata || {};
      const pendingExpiry = metadata.pending_expiry;
      const pendingExpiryDate = pendingExpiry ? new Date(pendingExpiry) : null;

      if (isMember) {
        subscriptionUpserts.push({
          user_id: userId,
          provider: 'youtube',
          external_id: channelId,
          status: 'active',
          plan: 'monthly',
          current_period_start: now.toISOString(),
          provider_data: { channel_id: channelId },
        });

        if (pendingExpiry) {
          linkedAccountUpdates.push({
            userId,
            data: {
              metadata: { ...metadata, pending_expiry: null },
              last_verified_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
          });
        }

        activeCount++;
      } else {
        if (pendingExpiry && pendingExpiryDate && pendingExpiryDate > now) {
          // Still in grace period - skip
          continue;
        }

        if (pendingExpiry && pendingExpiryDate && pendingExpiryDate <= now) {
          // Grace period expired - expire subscription
          subscriptionUpserts.push({
            user_id: userId,
            provider: 'youtube',
            external_id: channelId,
            status: 'expired',
            plan: 'monthly',
            provider_data: { channel_id: channelId },
          });

          linkedAccountUpdates.push({
            userId,
            data: {
              metadata: { ...metadata, pending_expiry: null },
              last_verified_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
          });

          expiredUserIds.add(userId);
          expiredCount++;
        } else if (!pendingExpiry) {
          // First time missing - set 24-hour grace period
          const gracePeriodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

          linkedAccountUpdates.push({
            userId,
            data: {
              metadata: { ...metadata, pending_expiry: gracePeriodEnd.toISOString() },
              last_verified_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
          });
        }
      }
    }

    // 1. Batch upsert all subscription changes in a single DB call
    await batchUpsertSubscriptions(subscriptionUpserts);

    // 2. Update linked account metadata in parallel
    if (linkedAccountUpdates.length > 0) {
      await Promise.all(
        linkedAccountUpdates.map(({ userId, data }) =>
          supabaseAdmin
            .from('linked_accounts')
            .update(data)
            .eq('user_id', userId)
            .eq('platform', 'youtube')
        )
      );
    }

    // 3. Sync roles only for users whose subscription just expired
    if (expiredUserIds.size > 0) {
      await Promise.all(
        Array.from(expiredUserIds).map((userId) => syncUserRoleFromSubscriptions(userId))
      );
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
