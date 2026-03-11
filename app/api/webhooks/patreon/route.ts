import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import {
  verifyPatreonWebhook,
  calculatePatreonExpiresAt,
} from '@/lib/services/patreon-membership';
import {
  upsertSubscription,
  syncUserRoleFromSubscriptions,
} from '@/lib/services/subscription-service';

/**
 * Verify Patreon webhook signature using HEX(HMAC-MD5)
 */
function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature) {
    return false;
  }

  const secret = serverConfig.PATREON_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Patreon Webhook] PATREON_WEBHOOK_SECRET is not configured — rejecting request');
    return false;
  }

  return verifyPatreonWebhook(rawBody, signature, secret);
}

/**
 * Check if webhook event has already been processed (idempotency)
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('patreon_webhook_events')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle();

  return !!data;
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(
  eventId: string,
  eventType: string,
  status: 'processed' | 'failed',
  payload: any
): Promise<void> {
  await supabaseAdmin.from('patreon_webhook_events').upsert(
    {
      event_id: eventId,
      event_type: eventType,
      status,
      payload,
      processed_at: new Date().toISOString(),
    },
    {
      onConflict: 'event_id',
    }
  );
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
 * Process Patreon webhook event
 */
async function processPatreonWebhook(payload: any): Promise<void> {
  const eventType = payload.type;
  const eventId = payload.id || `${eventType}_${Date.now()}`;

  // Check idempotency
  if (await isEventProcessed(eventId)) {
    return;
  }

  try {
    // Extract member data from payload
    const memberData = payload.data;
    if (!memberData || memberData.type !== 'member') {
      console.warn('[Patreon Webhook] Invalid member data in payload');
      await markEventProcessed(eventId, eventType, 'failed', payload);
      return;
    }

    const memberId = memberData.id;
    const attributes = memberData.attributes || {};
    const patronStatus = attributes.patron_status || null;
    const nextChargeDate = attributes.next_charge_date || null;
    const lastChargeDate = attributes.last_charge_date || null;
    const pledgeCadence = attributes.pledge_cadence || null;
    const pledgeRelationshipStart = attributes.pledge_relationship_start || null;
    const lastChargeStatus = attributes.last_charge_status || null;
    const currentlyEntitledAmountCents = attributes.currently_entitled_amount_cents || 0;

    // For webhooks, we need to match by Patreon user ID, not member ID
    // The member relationship is stored in the webhook payload relationships
    const relationships = memberData.relationships || {};
    const userRelationship = relationships.user?.data;
    const patreonUserId = userRelationship?.id;

    if (!patreonUserId) {
      console.warn('[Patreon Webhook] No user ID in member relationships');
      await markEventProcessed(eventId, eventType, 'failed', payload);
      return;
    }

    // Find linked account by Patreon user ID
    const { data: linkedAccountByUserId } = await supabaseAdmin
      .from('linked_accounts')
      .select('user_id, metadata')
      .eq('platform', 'patreon')
      .eq('external_user_id', patreonUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (!linkedAccountByUserId) {
      await markEventProcessed(eventId, eventType, 'processed', payload);
      return;
    }

    const userId = linkedAccountByUserId.user_id;

    // Map patron_status to subscription status
    const { status, expiresAt } = mapPatronStatusToSubscriptionStatus(
      patronStatus,
      nextChargeDate,
      lastChargeDate,
      pledgeCadence
    );

    // Determine plan from pledge_cadence
    const plan = pledgeCadence === 12 ? 'yearly' : 'monthly';

    // Handle different event types
    if (
      eventType === 'members:pledge:delete' ||
      (eventType === 'members:update' && patronStatus === 'former_patron')
    ) {
      // Cancellation or removal
      if (status === 'canceled' && expiresAt) {
        // Access period still active
        await upsertSubscription({
          user_id: userId,
          provider: 'patreon',
          external_id: patreonUserId,
          status: 'canceled',
          plan,
          current_period_start: pledgeRelationshipStart || new Date().toISOString(),
          current_period_end: expiresAt,
          expires_at: expiresAt,
          canceled_at: new Date().toISOString(),
          provider_data: {
            patron_status: patronStatus,
            pledge_cadence: pledgeCadence,
            next_charge_date: nextChargeDate,
            last_charge_date: lastChargeDate,
            last_charge_status: lastChargeStatus,
            currently_entitled_amount_cents: currentlyEntitledAmountCents,
          },
        });
      } else {
        // Access period ended
        await upsertSubscription({
          user_id: userId,
          provider: 'patreon',
          external_id: patreonUserId,
          status: 'expired',
          plan,
          provider_data: {
            patron_status: patronStatus,
            pledge_cadence: pledgeCadence,
            last_charge_date: lastChargeDate,
            last_charge_status: lastChargeStatus,
          },
        });
      }
    } else if (
      eventType === 'members:pledge:create' ||
      eventType === 'members:create' ||
      (eventType === 'members:update' && patronStatus === 'active_patron')
    ) {
      // New pledge or active patron
      await upsertSubscription({
        user_id: userId,
        provider: 'patreon',
        external_id: patreonUserId,
        status,
        plan,
        current_period_start: pledgeRelationshipStart || new Date().toISOString(),
        current_period_end: expiresAt,
        expires_at: expiresAt,
        provider_data: {
          patron_status: patronStatus,
          pledge_cadence: pledgeCadence,
          next_charge_date: nextChargeDate,
          last_charge_date: lastChargeDate,
          last_charge_status: lastChargeStatus,
          currently_entitled_amount_cents: currentlyEntitledAmountCents,
        },
      });
    } else if (
      eventType === 'members:update' && patronStatus === 'declined_patron'
    ) {
      // Payment declined - grant temporary access
      await upsertSubscription({
        user_id: userId,
        provider: 'patreon',
        external_id: patreonUserId,
        status: 'past_due',
        plan,
        current_period_start: pledgeRelationshipStart || new Date().toISOString(),
        current_period_end: expiresAt,
        expires_at: expiresAt,
        provider_data: {
          patron_status: patronStatus,
          pledge_cadence: pledgeCadence,
          next_charge_date: nextChargeDate,
          last_charge_date: lastChargeDate,
          last_charge_status: lastChargeStatus,
        },
      });
    }

    // Sync user role
    await syncUserRoleFromSubscriptions(userId);

    // Update linked account metadata
    await supabaseAdmin
      .from('linked_accounts')
      .update({
        metadata: {
          patron_status: patronStatus,
          pledge_cadence: pledgeCadence,
          next_charge_date: nextChargeDate,
        },
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'patreon');

    // Mark event as processed
    await markEventProcessed(eventId, eventType, 'processed', payload);
  } catch (error) {
    console.error('[Patreon Webhook] Error processing event:', error);
    await markEventProcessed(eventId, eventType, 'failed', payload);
    throw error;
  }
}

/**
 * POST /api/webhooks/patreon
 * Handles Patreon webhook events
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('X-Patreon-Signature');

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[Patreon Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('[Patreon Webhook] Invalid JSON payload:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Process webhook event
    await processPatreonWebhook(payload);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[Patreon Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
