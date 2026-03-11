import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import {
	upsertSubscription,
	syncUserRoleFromSubscriptions,
	type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';

/**
 * Verify RevenueCat webhook authorization header
 * RevenueCat sends a static Authorization header value that you configure in the dashboard
 */
function verifyRevenueCatAuthorization(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  
  const expectedAuthRaw = serverConfig.REVENUECAT_WEBHOOK_SECRET;
  if (!expectedAuthRaw) {
    console.error('[RevenueCat Webhook] REVENUECAT_WEBHOOK_SECRET is not configured — rejecting request');
    return false;
  }

  // Type assertion: we've checked it's not null, so it must be a string
  const expectedAuth: string = expectedAuthRaw;

  // RevenueCat sends the authorization value as-is in the Authorization header
  // It may be sent as "Bearer <value>" or just the value itself
  if (!authHeader) {
    console.warn('[RevenueCat Webhook] No authorization header found');
    return false;
  }

  // Check if it matches the expected value (with or without "Bearer " prefix)
  const providedAuth = authHeader.replace(/^Bearer\s+/i, '').trim();
  const expectedAuthTrimmed = expectedAuth.trim();
  
  return providedAuth === expectedAuthTrimmed;
}

// No local expiration calculations. We trust RevenueCat's expires_date.

/**
 * Determine plan type from product identifier
 */
function determinePlanFromProductId(productId: string | null | undefined): 'monthly' | 'yearly' | null {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes('yearly') || id.includes('annual') || id.includes('year')) {
    return 'yearly';
  }
  if (id.includes('monthly') || id.includes('month')) {
    return 'monthly';
  }
  return null;
}

/**
 * Determine provider type from RevenueCat entitlement store
 */
function determineProviderFromStore(store: string | null | undefined): 'revenuecat_ios' | 'revenuecat_web' | 'revenuecat_android' {
  const storeLower = store?.toLowerCase() || '';
  if (storeLower === 'app_store') {
    return 'revenuecat_ios';
  }
  if (storeLower === 'play_store') {
    return 'revenuecat_android';
  }
  // Default to web for stripe, rc_billing, promotional, or unknown
  return 'revenuecat_web';
}

/**
 * Convert RevenueCat entitlement to unified subscription params
 */
export function revenueCatEntitlementToUnifiedParams(
  userId: string,
  entitlement: any,
  store?: string | null
): UpsertSubscriptionParams | null {
  if (!entitlement) return null;

  const now = new Date();
  const expiresDate = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
  const isExpired = expiresDate ? expiresDate <= now : false;
  const isActive = entitlement.is_active === true || (!isExpired && entitlement.is_active !== false);

  // Determine status
  let status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'incomplete' = 'expired';
  if (isActive && !isExpired) {
    // Check for billing issues (grace period)
    const hasBillingIssue = entitlement.period_type === 'grace_period' || 
                           entitlement.period_type === 'billing_issue' ||
                           entitlement.billing_issues_detected_at !== undefined;
    if (hasBillingIssue) {
      status = 'past_due';
    } else {
      status = 'active';
    }
  } else if (isExpired) {
    status = 'expired';
  } else {
    status = 'canceled';
  }

  const plan = determinePlanFromProductId(entitlement.product_identifier);
  const provider = determineProviderFromStore(store);

  // Get dates
  const purchaseDate = entitlement.latest_purchase_date_ms
    ? new Date(entitlement.latest_purchase_date_ms)
    : (entitlement.latest_purchase_date ? new Date(entitlement.latest_purchase_date) : new Date());
  
  // External ID: use entitlement identifier or product identifier
  const externalId = entitlement.identifier || entitlement.product_identifier || `${userId}_${provider}`;

  // Grace period expires at
  const gracePeriodExpiresAt = entitlement.grace_period_expires_date 
    ? new Date(entitlement.grace_period_expires_date).toISOString() 
    : null;

  return {
    user_id: userId,
    provider,
    external_id: externalId,
    status,
    plan,
    current_period_start: purchaseDate.toISOString(),
    current_period_end: expiresDate?.toISOString() || null,
    expires_at: expiresDate?.toISOString() || null,
    grace_period_expires_at: gracePeriodExpiresAt,
    provider_data: {
      entitlement_identifier: entitlement.identifier,
      product_identifier: entitlement.product_identifier,
      store: store || null,
      will_renew: entitlement.will_renew,
      period_type: entitlement.period_type,
    },
  };
}

/**
 * Find user by app_user_id or email (preserves existing lookup logic)
 */
async function findUserByAppUserIdOrEmail(
  appUserID: string,
  eventEmail?: string
): Promise<string | null> {
  // Try to find user by app_user_id first
  const { data: profile, error: findError } = await supabaseAdmin
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', appUserID)
    .maybeSingle();

  if (!findError && profile) {
    return profile.user_id;
  }

  // If not found, try email lookup
  let email = eventEmail;
  if (!email) {
    // Try RevenueCat API to get email
    try {
      const revenueCatApiKey = serverConfig.REVENUECAT_API_KEY;
      if (revenueCatApiKey) {
        const revenueCatResponse = await fetch(
          `https://api.revenuecat.com/v1/subscribers/${appUserID}`,
          {
            headers: {
              'Authorization': `Bearer ${revenueCatApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (revenueCatResponse.ok) {
          const revenueCatData = await revenueCatResponse.json();
          const subscriber = revenueCatData.subscriber;
          email = subscriber?.subscriber_attributes?.$email?.value;
        }
      }
    } catch (apiError) {
      console.error('[RevenueCat Webhook] Error fetching from RevenueCat API:', apiError);
    }
  }

  if (email) {
    try {
      // Note: getUserByEmail is not available in this SDK version; use listUsers + filter
      const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const supabaseUser = (allUsers as any[] | null)?.find((u: any) => u.email === email) ?? null;
      if (supabaseUser) {
        return supabaseUser.id;
      }
    } catch (emailLookupError) {
      console.error('[RevenueCat Webhook] Error during email lookup:', emailLookupError);
    }
  }

  return null;
}

/**
 * Update subscription from RevenueCat entitlement data
 * This replaces the old updateUserSubscriptionStatus function
 */
async function updateSubscriptionFromRevenueCat(
  appUserID: string,
  eventEmail?: string,
  entitlement?: any,
  store?: string | null
): Promise<void> {
  const userId = await findUserByAppUserIdOrEmail(appUserID, eventEmail);
  
  if (!userId) {
    console.error('[RevenueCat Webhook] User not found by app_user_id or email:', appUserID);
    return;
  }

  // If we have entitlement data, upsert to unified table
  if (entitlement) {
    const params = revenueCatEntitlementToUnifiedParams(userId, entitlement, store);
    if (params) {
      await upsertSubscription(params);
      // Sync user role based on all subscriptions
      await syncUserRoleFromSubscriptions(userId);
    }
  } else {
    // No entitlement data - just sync user role (will check all subscriptions)
    await syncUserRoleFromSubscriptions(userId);
  }
}

/**
 * Update user subscription status based on RevenueCat entitlements
 * @deprecated Use updateSubscriptionFromRevenueCat instead
 */
async function updateUserSubscriptionStatus(
  appUserID: string,
  hasActiveEntitlement: boolean,
  eventEmail?: string,
  subscriptionDates?: {
    startDate: Date;
    expiresAt: Date;
    plan: 'monthly' | 'yearly';
  } | null
): Promise<void> {
  try {
    
    // Find user by RevenueCat app_user_id (which should be Supabase user_id)
    const { data: profile, error: findError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, user_type')
      .eq('user_id', appUserID)
      .single();

    if (findError) {
      console.error('[RevenueCat Webhook] User not found by app_user_id:', {
        app_user_id: appUserID,
        error: findError,
        error_code: findError.code,
        error_message: findError.message,
      });
      
      // Try to find user by email (from webhook event or RevenueCat API)
      let email = eventEmail;
      
      // If no email from event, try RevenueCat API
      if (!email) {
        try {
          const revenueCatApiKey = serverConfig.REVENUECAT_API_KEY;
          if (revenueCatApiKey) {
            const revenueCatResponse = await fetch(
              `https://api.revenuecat.com/v1/subscribers/${appUserID}`,
              {
                headers: {
                  'Authorization': `Bearer ${revenueCatApiKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (revenueCatResponse.ok) {
              const revenueCatData = await revenueCatResponse.json();
              const subscriber = revenueCatData.subscriber;
              email = subscriber?.subscriber_attributes?.$email?.value;
            }
          }
        } catch (apiError) {
          console.error('[RevenueCat Webhook] Error fetching from RevenueCat API:', apiError);
        }
      }
      
      // If we have an email, try to find user by email
      if (email) {
        
        try {
          // Find Supabase user by email
          // Note: getUserByEmail is not available in this SDK version; use listUsers + filter
          const { data: { users: allUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          const supabaseUser = (allUsers as any[] | null)?.find((u: any) => u.email === email) ?? null;

          if (listError) {
            console.error('[RevenueCat Webhook] Error looking up user by email:', listError);
          } else {
            if (supabaseUser) {
              // Update the appUserID to the correct Supabase user_id
              const correctUserID = supabaseUser.id;
              
              // Re-query for the profile with correct ID
              const { data: correctProfile, error: correctFindError } = await supabaseAdmin
                .from('user_profiles')
                .select('user_id, user_type')
                .eq('user_id', correctUserID)
                .single();
              
              if (correctFindError || !correctProfile) {
                console.error('[RevenueCat Webhook] User profile not found even after email lookup:', correctFindError);
                return;
              }
              
              // Use the correct user ID for the update
              const userType = hasActiveEntitlement ? 'subscriber' : 'free';
              const updateData: {
                user_type: string;
                signup_status?: string;
              } = { user_type: userType };
              
              if (hasActiveEntitlement) {
                updateData.signup_status = 'complete';
              }

              const { data: updatedProfile, error: updateError } = await supabaseAdmin
                .from('user_profiles')
                .update(updateData)
                .eq('user_id', correctUserID)
                .select('user_id, user_type, signup_status')
                .single();

              if (updateError) {
                console.error('[RevenueCat Webhook] Failed to update user after email lookup:', updateError);
                throw updateError;
              }

              return;
            } else {
              console.error('[RevenueCat Webhook] Supabase user not found for email:', email);
            }
          }
        } catch (emailLookupError) {
          console.error('[RevenueCat Webhook] Error during email lookup:', emailLookupError);
        }
      }
      
      console.error('[RevenueCat Webhook] User not found by any method. User may need to be created or ID mismatch.');
      return;
    } else {
    }

    // Update user_type based on entitlement status (RC is source of truth)
    const userType = hasActiveEntitlement ? 'subscriber' : 'free';
    
    // Build update data - only write user_type and signup_status
    // Subscription details are stored in subscriptions table only
    const updateData: {
      user_type: string;
      signup_status?: string;
    } = { user_type: userType };
    
    if (hasActiveEntitlement) {
      updateData.signup_status = 'complete';
    }


    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update(updateData)
      .eq('user_id', appUserID)
      .select('user_id, user_type, signup_status')
      .single();

    if (updateError) {
      console.error('[RevenueCat Webhook] Failed to update user type:', {
        error: updateError,
        error_code: updateError.code,
        error_message: updateError.message,
        user_id: appUserID,
      });
      throw updateError;
    }

  } catch (error) {
    console.error('[RevenueCat Webhook] Error updating subscription status:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    
    // Verify webhook authorization header
    if (!verifyRevenueCatAuthorization(request)) {
      console.error('[RevenueCat Webhook] Invalid authorization header');
      return NextResponse.json(
        { error: 'Invalid authorization' },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);

    const { event } = body;

    if (!event || !event.type) {
      console.warn('[RevenueCat Webhook] Invalid event structure');
      return NextResponse.json(
        { error: 'Invalid event structure' },
        { status: 400 }
      );
    }

    // Idempotency check - prevent duplicate processing
    const eventId = event.id || `${event.app_user_id}_${event.type}`;
    const { data: existing } = await supabaseAdmin
      .from('revenuecat_webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    // Record webhook event for idempotency
    await supabaseAdmin
      .from('revenuecat_webhook_events')
      .insert({
        event_id: eventId,
        event_type: event.type,
        status: 'processed',
        payload: body,
        processed_at: new Date().toISOString(),
      });

    // TRANSFER events don't have app_user_id, they have transferred_to array
    // According to RevenueCat docs: TRANSFER means subscription was linked to a new user ID
    let appUserID = event.app_user_id;
    
    if (!appUserID && event.type === 'TRANSFER') {
      // For TRANSFER events, use transferred_to[0] as the new user ID
      appUserID = event.transferred_to?.[0];
    }
    
    if (!appUserID) {
      console.warn('[RevenueCat Webhook] No app_user_id or transferred_to in event');
      return NextResponse.json(
        { error: 'Missing app_user_id or transferred_to' },
        { status: 400 }
      );
    }


    // Check if user has active entitlements
    // For INITIAL_PURCHASE events, entitlement_ids array indicates active entitlements
    // For other events, check the entitlements object
    let hasActiveEntitlement = false;
    
    if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
      // For purchase events, if entitlement_ids array exists and has items, user has active entitlement
      hasActiveEntitlement = Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0;
    } else {
      // For other events, check the entitlements object
      const entitlements = event.entitlements || {};
      hasActiveEntitlement = Object.values(entitlements).some(
        (entitlement: any) => entitlement.is_active === true
      );
    }

    // Get email from event payload (if available)
    const eventEmail = event.subscriber_attributes?.$email?.value;

    // Handle different event types
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION': {
        // Query RevenueCat to get authoritative expires_date and product
        try {
          const rcKey = serverConfig.REVENUECAT_API_KEY;
          if (!rcKey) {
            await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
            break;
          }
          const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${appUserID}`, {
            headers: { 'Authorization': `Bearer ${rcKey}`, 'Content-Type': 'application/json' },
          });
          if (!res.ok) {
            await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
            break;
          }
          const data = await res.json();
          const subscriber = data?.subscriber;
          const entitlements = subscriber?.entitlements || {};
          const subscriptions = subscriber?.subscriptions || {};
          const nonSubscriptions = subscriber?.non_subscriptions || {};
          
          // Find active entitlement
          const now = new Date();
          const activeEntitlement = Object.values(entitlements).find((ent: any) => {
            const exp = ent?.expires_date ? new Date(ent.expires_date) : null;
            return (exp && exp > now) || ent?.is_active === true;
          }) as any | undefined;

          if (activeEntitlement) {
            // Find the subscription/store for this entitlement
            const allSubs = { ...subscriptions, ...nonSubscriptions };
            const matchingSub = Object.values(allSubs).find((sub: any) => {
              return sub.product_identifier === activeEntitlement.product_identifier;
            }) as any;
            
            const store = matchingSub?.store || null;
            await updateSubscriptionFromRevenueCat(appUserID, eventEmail, activeEntitlement, store);
          } else {
            await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
          }
        } catch (e) {
          console.error('[RevenueCat Webhook] Error syncing after purchase/renewal:', e);
          await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
        }
        break;
      }

      case 'TRANSFER':
        // TRANSFER means subscription was successfully linked from anonymous ID to real user ID
        // Query RevenueCat API to get current entitlements
        try {
          const revenueCatApiKey = serverConfig.REVENUECAT_API_KEY;
          if (revenueCatApiKey) {
            const revenueCatResponse = await fetch(
              `https://api.revenuecat.com/v1/subscribers/${appUserID}`,
              {
                headers: {
                  'Authorization': `Bearer ${revenueCatApiKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (revenueCatResponse.ok) {
              const revenueCatData = await revenueCatResponse.json();
              const subscriber = revenueCatData.subscriber;
              const entitlements = subscriber?.entitlements || {};
              const subscriptions = subscriber?.subscriptions || {};
              const nonSubscriptions = subscriber?.non_subscriptions || {};
              
              // Find active entitlement
              const now = new Date();
              const activeEntitlement = Object.values(entitlements).find((ent: any) => {
                const isActive = ent.is_active === true;
                let isNotExpired = true;
                if (ent.expires_date) {
                  const expiresDate = new Date(ent.expires_date);
                  isNotExpired = expiresDate > now;
                }
                return (isActive || ent.is_active === undefined) && isNotExpired;
              }) as any | undefined;

              if (activeEntitlement) {
                // Find the subscription/store for this entitlement
                const allSubs = { ...subscriptions, ...nonSubscriptions };
                const matchingSub = Object.values(allSubs).find((sub: any) => {
                  return sub.product_identifier === activeEntitlement.product_identifier;
                }) as any;
                
                const store = matchingSub?.store || null;
                await updateSubscriptionFromRevenueCat(appUserID, eventEmail, activeEntitlement, store);
              } else {
                await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
              }
            } else {
              await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
            }
          } else {
            await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
          }
        } catch (e) {
          console.error('[RevenueCat Webhook] Error handling TRANSFER event:', e);
          await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
        }
        break;

      case 'CANCELLATION': {
        // Check if expired, downgrade immediately if expired, otherwise keep active until expiration
        try {
          const rcKey = serverConfig.REVENUECAT_API_KEY;
          if (rcKey) {
            const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${appUserID}`, {
              headers: { 'Authorization': `Bearer ${rcKey}`, 'Content-Type': 'application/json' },
            });
            if (res.ok) {
              const data = await res.json();
              const subscriber = data?.subscriber;
              const entitlements = subscriber?.entitlements || {};
              const subscriptions = subscriber?.subscriptions || {};
              const nonSubscriptions = subscriber?.non_subscriptions || {};
              
              const now = new Date();
              const active = Object.values(entitlements).find((ent: any) => {
                const exp = ent?.expires_date ? new Date(ent.expires_date) : null;
                return (exp && exp > now) || ent?.is_active === true;
              }) as any | undefined;
              
              if (active) {
                // Find the subscription/store for this entitlement
                const allSubs = { ...subscriptions, ...nonSubscriptions };
                const matchingSub = Object.values(allSubs).find((sub: any) => {
                  return sub.product_identifier === active.product_identifier;
                }) as any;
                
                const store = matchingSub?.store || null;
                await updateSubscriptionFromRevenueCat(appUserID, eventEmail, active, store);
                break;
              }
            }
          }
        } catch (e) {
          console.error('[RevenueCat Webhook] Error handling CANCELLATION:', e);
        }
        // If no active entitlement found, sync will downgrade
        await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
        break;
      }
      case 'EXPIRATION':
        // Downgrade immediately on expiration
        await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
        break;

      case 'BILLING_ISSUE': {
        // Payment failed - subscription may still be active during grace period
        // Query RevenueCat API to get detailed billing issue information
        try {
          const rcKey = serverConfig.REVENUECAT_API_KEY;
          if (rcKey) {
            const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${appUserID}`, {
              headers: { 'Authorization': `Bearer ${rcKey}`, 'Content-Type': 'application/json' },
            });
            if (res.ok) {
              const data = await res.json();
              const subscriber = data?.subscriber;
              const entitlements = subscriber?.entitlements || {};
              const subscriptions = subscriber?.subscriptions || {};
              const nonSubscriptions = subscriber?.non_subscriptions || {};
              const now = new Date();
              
              // Find active entitlement with billing issue
              const active = Object.values(entitlements).find((ent: any) => {
                const exp = ent?.expires_date ? new Date(ent.expires_date) : null;
                const isActive = (exp && exp > now) || ent?.is_active === true;
                const hasBillingIssue = ent?.period_type === 'grace_period' || 
                                       ent?.period_type === 'billing_issue' ||
                                       ent?.billing_issues_detected_at !== undefined;
                return isActive && hasBillingIssue;
              }) as any | undefined;
              
              if (active) {
                // Find the subscription/store for this entitlement
                const allSubs = { ...subscriptions, ...nonSubscriptions };
                const matchingSub = Object.values(allSubs).find((sub: any) => {
                  return sub.product_identifier === active.product_identifier;
                }) as any;
                
                const store = matchingSub?.store || null;
                
                
                // Update subscription with past_due status (grace period)
                await updateSubscriptionFromRevenueCat(appUserID, eventEmail, active, store);
              } else {
                // No active entitlement found - subscription may have expired
                await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
              }
            } else {
              // API call failed - sync anyway
              await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
            }
          } else {
            // No API key - sync anyway
            await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
          }
        } catch (billingError) {
          console.error('[RevenueCat Webhook] Error processing BILLING_ISSUE:', billingError);
          // On error, sync anyway
          await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
        }
        break;
      }

      default:
        // For other events, sync subscription status
        await updateSubscriptionFromRevenueCat(appUserID, eventEmail);
    }

    return NextResponse.json(
      { received: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('[RevenueCat Webhook] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


