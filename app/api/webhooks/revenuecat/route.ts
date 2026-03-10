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
    console.warn('[RevenueCat Webhook] Authorization header value not configured');
    // In development, allow without authorization (not recommended for production)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[RevenueCat Webhook] Development mode: skipping authorization verification');
      return true;
    }
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
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError) {
        const supabaseUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (supabaseUser) {
          return supabaseUser.id;
        }
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
    console.log('[RevenueCat Webhook] Looking for user with ID:', appUserID, {
      has_email_from_event: !!eventEmail,
    });
    
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
        console.log('[RevenueCat Webhook] Attempting to find user by email:', email);
        
        try {
          // Find Supabase user by email
          const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          
          if (listError) {
            console.error('[RevenueCat Webhook] Error listing users:', listError);
          } else {
            const supabaseUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
            
            if (supabaseUser) {
              console.log('[RevenueCat Webhook] Found Supabase user by email:', supabaseUser.id);
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

              console.log(`[RevenueCat Webhook] ✅ Successfully updated user ${correctUserID} (resolved from ${appUserID}) to ${userType}`, {
                updated_profile: updatedProfile,
              });
              return;
            } else {
              console.error('[RevenueCat Webhook] Supabase user not found for email:', email, {
                total_users: users.length,
                searched_emails: users.map(u => u.email).slice(0, 5), // Log first 5 for debugging
              });
            }
          }
        } catch (emailLookupError) {
          console.error('[RevenueCat Webhook] Error during email lookup:', emailLookupError);
        }
      }
      
      console.error('[RevenueCat Webhook] User not found by any method. User may need to be created or ID mismatch.');
      return;
    } else {
      console.log('[RevenueCat Webhook] Found user profile:', {
        user_id: profile.user_id,
        current_user_type: profile.user_type,
      });
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

    console.log('[RevenueCat Webhook] Updating user:', {
      user_id: appUserID,
      new_user_type: userType,
      has_active_entitlement: hasActiveEntitlement,
      update_data: updateData,
    });

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

    console.log(`[RevenueCat Webhook] ✅ Successfully updated user ${appUserID} to ${userType}${hasActiveEntitlement ? ' (signup complete)' : ''}`, {
      updated_profile: updatedProfile,
    });
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
    console.log('[RevenueCat Webhook] Received event:', {
      type: body.event?.type,
      app_user_id: body.event?.app_user_id,
      entitlement_ids: body.event?.entitlement_ids,
      product_id: body.event?.product_id,
    });

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
      console.log('[RevenueCat Webhook] Event already processed:', eventId);
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
      console.log('[RevenueCat Webhook] TRANSFER event detected:', {
        transferred_from: event.transferred_from,
        transferred_to: event.transferred_to,
        using_user_id: appUserID,
        note: 'Subscription transferred from anonymous ID to real user ID',
      });
    }
    
    if (!appUserID) {
      console.warn('[RevenueCat Webhook] No app_user_id or transferred_to in event');
      return NextResponse.json(
        { error: 'Missing app_user_id or transferred_to' },
        { status: 400 }
      );
    }

    console.log('[RevenueCat Webhook] Processing event for user:', appUserID);
    console.log('[RevenueCat Webhook] Event details:', {
      type: event.type,
      entitlement_ids: event.entitlement_ids,
      has_entitlements_object: !!event.entitlements,
      email: event.subscriber_attributes?.$email?.value,
    });

    // Check if user has active entitlements
    // For INITIAL_PURCHASE events, entitlement_ids array indicates active entitlements
    // For other events, check the entitlements object
    let hasActiveEntitlement = false;
    
    if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
      // For purchase events, if entitlement_ids array exists and has items, user has active entitlement
      hasActiveEntitlement = Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0;
      console.log('[RevenueCat Webhook] Purchase event - checking entitlement_ids:', {
        entitlement_ids: event.entitlement_ids,
        has_active: hasActiveEntitlement,
      });
    } else {
      // For other events, check the entitlements object
      const entitlements = event.entitlements || {};
      hasActiveEntitlement = Object.values(entitlements).some(
        (entitlement: any) => entitlement.is_active === true
      );
      console.log('[RevenueCat Webhook] Non-purchase event - checking entitlements object:', {
        has_active: hasActiveEntitlement,
        entitlement_count: Object.keys(entitlements).length,
      });
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
                
                console.log('[RevenueCat Webhook] BILLING_ISSUE detected:', {
                  app_user_id: appUserID,
                  grace_period_expires_at: active.grace_period_expires_date,
                  subscription_still_active: true,
                });
                
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
        console.log(`[RevenueCat Webhook] Unhandled event type: ${event.type}, syncing subscription status`);
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


