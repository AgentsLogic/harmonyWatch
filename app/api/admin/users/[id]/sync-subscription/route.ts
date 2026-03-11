import { NextRequest, NextResponse } from 'next/server';
import { assertStripeClient, planFromPriceId } from '@/lib/services/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import {
	upsertSubscription,
	syncUserRoleFromSubscriptions,
	mapStripeStatus,
	type UpsertSubscriptionParams,
} from '@/lib/services/subscription-service';
import { serverConfig } from '@/lib/env';

/**
 * Admin endpoint to sync a user's subscription status from Stripe or RevenueCat
 * POST /api/admin/users/[id]/sync-subscription
 * 
 * This attempts to sync from:
 * 1. Stripe (if user has Stripe customer record)
 * 2. RevenueCat (if user has RevenueCat subscription)
 * 3. Falls back to syncing user role from existing database subscriptions
 */
async function verifyAdmin(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7)
      : request.cookies.get('sb-access-token')?.value ?? null;

    if (!accessToken) {
      return { error: 'Not authenticated', status: 401, user: null };
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) {
      return { error: 'Invalid session', status: 401, user: null };
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profile?.user_type !== 'admin') {
      return { error: 'Forbidden: Admin access required', status: 403, user: null };
    }

    return { error: null, status: 200, user };
  } catch (error) {
    console.error('Admin verification error:', error);
    return { error: 'Internal server error', status: 500, user: null };
  }
}

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

    // Try Stripe first
    const { data: stripeCustomer } = await supabaseAdmin
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (stripeCustomer?.stripe_customer_id) {
      try {
        const stripe = assertStripeClient();

        // Find all subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomer.stripe_customer_id,
          status: 'all',
          limit: 100,
        });

        // Find active subscription (check expiration dates FIRST, then status)
        // Stripe best practice: If current_period_end is in the past, subscription is expired
        // regardless of status. This handles sandbox time advancement correctly.
        const now = new Date();
        const activeSubscription = subscriptions.data
          .filter(sub => {
            const status = sub.status;
            const subWithPeriods = sub as any; // Cast to access current_period_end (Stripe types don't expose it)
            const periodEnd = subWithPeriods.current_period_end ? new Date(subWithPeriods.current_period_end * 1000) : null;
            
            // CRITICAL: Check expiration FIRST (Stripe best practice)
            // If current_period_end is in the past, subscription is expired regardless of status
            // This correctly handles sandbox time advancement where status might still be 'active'
            // but current_period_end has passed
            if (periodEnd && periodEnd <= now) {
              return false; // Expired - don't include
            }
            
            // Not expired - now check status (Stripe best practice)
            // Only these statuses grant access:
            // - 'active': Normal active subscription
            // - 'trialing': In trial period
            // - 'canceled': Canceled but not expired (user paid until period_end)
            // - 'past_due': In grace period (Stripe is retrying payment)
            if (status === 'active' || status === 'trialing') {
              return true;
            }
            
            // Canceled but not expired - user paid until period_end (Stripe behavior)
            if (status === 'canceled' && periodEnd && periodEnd > now) {
              return true;
            }
            
            // Past due but not expired - in grace period (Stripe retry period)
            if (status === 'past_due' && periodEnd && periodEnd > now) {
              return true;
            }
            
            // Explicitly exclude these statuses (never grant access):
            // - 'unpaid': Payment failed, no retries left
            // - 'incomplete': Payment not completed
            // - 'incomplete_expired': Payment incomplete and expired
            // - 'paused': Subscription paused
            
            return false;
          })
          .sort((a, b) => b.created - a.created)[0];

        if (activeSubscription) {
          // Check if subscription has the user_id in metadata
          if (!activeSubscription.metadata?.supabase_user_id) {
            // Add metadata if missing
            await stripe.subscriptions.update(activeSubscription.id, {
              metadata: {
                ...activeSubscription.metadata,
                supabase_user_id: userId,
              },
            });
          }

          // Convert Stripe subscription to unified params
          const subscriptionWithPeriods = activeSubscription as any;
          const planFromMetadata = activeSubscription.metadata?.plan as 'monthly' | 'yearly' | undefined;
          let subscriptionPlan: 'monthly' | 'yearly' | null = null;
          if (planFromMetadata && (planFromMetadata === 'monthly' || planFromMetadata === 'yearly')) {
            subscriptionPlan = planFromMetadata;
          } else {
            const priceId = activeSubscription.items.data[0]?.price.id;
            if (priceId) {
              const plan = planFromPriceId(priceId);
              if (plan) {
                subscriptionPlan = plan;
              }
            }
          }

          const params: UpsertSubscriptionParams = {
            user_id: userId,
            provider: 'stripe',
            external_id: activeSubscription.id,
            status: mapStripeStatus(activeSubscription.status),
            plan: subscriptionPlan,
            current_period_start: subscriptionWithPeriods.current_period_start 
              ? new Date(subscriptionWithPeriods.current_period_start * 1000).toISOString() 
              : null,
            current_period_end: subscriptionWithPeriods.current_period_end 
              ? new Date(subscriptionWithPeriods.current_period_end * 1000).toISOString() 
              : null,
            expires_at: subscriptionWithPeriods.current_period_end 
              ? new Date(subscriptionWithPeriods.current_period_end * 1000).toISOString() 
              : null,
            cancel_at: subscriptionWithPeriods.cancel_at 
              ? new Date(subscriptionWithPeriods.cancel_at * 1000).toISOString() 
              : null,
            canceled_at: subscriptionWithPeriods.canceled_at 
              ? new Date(subscriptionWithPeriods.canceled_at * 1000).toISOString() 
              : null,
            provider_data: activeSubscription.metadata as any,
          };

          // Upsert to unified table
          await upsertSubscription(params);

          // Sync user role (will upgrade to subscriber if subscription is active)
          await syncUserRoleFromSubscriptions(userId);

          const shouldBeSubscriber = activeSubscription.status === 'active' || activeSubscription.status === 'trialing';

          return NextResponse.json({
            success: true,
            message: shouldBeSubscriber 
              ? 'Stripe subscription synced successfully. User updated to subscriber.' 
              : 'Stripe subscription synced but status is not active.',
            subscription: {
              id: activeSubscription.id,
              status: activeSubscription.status,
              plan: subscriptionPlan,
              expiresAt: params.expires_at,
              provider: 'stripe',
            },
            userUpdated: shouldBeSubscriber,
          });
        } else {
          // No active subscription found in Stripe
          // CRITICAL: We need to mark ALL database Stripe subscriptions as expired
          // This handles the case where Stripe doesn't return subscriptions (e.g., sandbox time advanced)
          
          let updatedCount = 0;
          
          // First, update any expired subscriptions from Stripe API
          const expiredFromStripe = subscriptions.data.filter(sub => {
            const subWithPeriods = sub as any;
            const periodEnd = subWithPeriods.current_period_end ? new Date(subWithPeriods.current_period_end * 1000) : null;
            return periodEnd && periodEnd <= now;
          });

          for (const expiredSub of expiredFromStripe) {
            try {
              const expiredSubWithPeriods = expiredSub as any;
              const expiredParams: UpsertSubscriptionParams = {
                user_id: userId,
                provider: 'stripe',
                external_id: expiredSub.id,
                status: 'expired',
                plan: null,
                current_period_start: expiredSubWithPeriods.current_period_start 
                  ? new Date(expiredSubWithPeriods.current_period_start * 1000).toISOString() 
                  : null,
                current_period_end: expiredSubWithPeriods.current_period_end 
                  ? new Date(expiredSubWithPeriods.current_period_end * 1000).toISOString() 
                  : null,
                expires_at: expiredSubWithPeriods.current_period_end 
                  ? new Date(expiredSubWithPeriods.current_period_end * 1000).toISOString() 
                  : null,
                cancel_at: expiredSubWithPeriods.cancel_at 
                  ? new Date(expiredSubWithPeriods.cancel_at * 1000).toISOString() 
                  : null,
                canceled_at: expiredSubWithPeriods.canceled_at 
                  ? new Date(expiredSubWithPeriods.canceled_at * 1000).toISOString() 
                  : null,
                provider_data: expiredSub.metadata as any,
              };
              
              await upsertSubscription(expiredParams);
              updatedCount++;
            } catch (updateError) {
              console.error('[Sync Subscription] Error updating expired subscription:', updateError);
            }
          }

          // CRITICAL: Also check database for any Stripe subscriptions that are marked as active
          // but shouldn't be (because Stripe says there's no active subscription)
          const { data: dbSubscriptions } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'stripe')
            .in('status', ['active', 'trialing', 'past_due']);

          if (dbSubscriptions && dbSubscriptions.length > 0) {
            
            for (const dbSub of dbSubscriptions) {
              try {
                // Mark as expired since Stripe has no active subscription
                const { error: updateError } = await supabaseAdmin
                  .from('subscriptions')
                  .update({
                    status: 'expired',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', dbSub.id);
                
                if (!updateError) {
                  updatedCount++;
                } else {
                  console.error('[Sync Subscription] Error expiring database subscription:', updateError);
                }
              } catch (err) {
                console.error('[Sync Subscription] Error expiring database subscription:', err);
              }
            }
            
            // Invalidate cache after updating database subscriptions
            try {
              const { revalidateTag } = await import('next/cache');
              revalidateTag(`subscription-${userId}`);
              revalidateTag('subscription');
            } catch (cacheError) {
              console.warn('[Sync Subscription] Cache invalidation failed:', cacheError);
            }
          }

          // Now sync user role - will correctly downgrade to 'free'
          await syncUserRoleFromSubscriptions(userId);

          // Also directly update user_type to 'free' to ensure it happens
          const { error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .update({
              user_type: 'free',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('user_type', 'subscriber'); // Only update if currently subscriber

          if (profileError) {
            console.error('[Sync Subscription] Error updating user profile:', profileError);
          } else {
          }

          return NextResponse.json({
            success: true,
            message: `No active Stripe subscription found. ${updatedCount} subscription(s) marked as expired. User downgraded to free.`,
            subscription: null,
            expiredSubscriptionsUpdated: updatedCount,
          });
        }
      } catch (stripeError) {
        console.error('[Sync Subscription] Stripe sync error:', stripeError);
        // Continue to try RevenueCat
      }
    }

    // Try RevenueCat
    const revenueCatApiKey = serverConfig.REVENUECAT_API_KEY;
    
    if (revenueCatApiKey) {
      try {
        const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${userId}`, {
          headers: {
            'Authorization': `Bearer ${revenueCatApiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const subscriber = data?.subscriber;
          const entitlements = subscriber?.entitlements || {};
          
          // Find active entitlement
          // CRITICAL: Must check is_active === true, not just expiration date
          // RevenueCat entitlements can have future expiration dates but still be inactive (refunded, revoked, etc.)
          const now = new Date();
          const activeEntitlement = Object.values(entitlements).find((ent: any) => {
            const expiresDate = ent?.expires_date ? new Date(ent.expires_date) : null;
            return ent?.is_active === true && expiresDate && expiresDate > now;
          }) as any;

          if (activeEntitlement) {
            // Find store type
            const subscriptions = subscriber?.subscriptions || {};
            const nonSubscriptions = subscriber?.non_subscriptions || {};
            const allSubs = { ...subscriptions, ...nonSubscriptions };
            const matchingSub = Object.values(allSubs).find((sub: any) => {
              return sub.product_identifier === activeEntitlement.product_identifier;
            }) as any;
            const store = matchingSub?.store || null;

            // Import RevenueCat conversion function from webhook route
            // We need to import the entire module to access the helper functions
            const revenueCatWebhook = await import('@/app/api/webhooks/revenuecat/route');
            const params = revenueCatWebhook.revenueCatEntitlementToUnifiedParams(userId, activeEntitlement, store);
            
            if (params) {
              await upsertSubscription(params);
              await syncUserRoleFromSubscriptions(userId);
              
              return NextResponse.json({
                success: true,
                message: 'RevenueCat subscription synced successfully.',
                subscription: {
                  provider: store === 'app_store' ? 'revenuecat_ios' : 'revenuecat_web',
                  expiresAt: params.expires_at,
                  plan: params.plan,
                },
                userUpdated: true,
              });
            }
          } else {
            // No active entitlement found in RevenueCat
            // CRITICAL: Expire all RevenueCat subscriptions in database (same pattern as Stripe)
            // This handles the case where RevenueCat doesn't return active entitlements
            // but database still has active RevenueCat subscriptions
            
            const { data: rcDbSubscriptions } = await supabaseAdmin
              .from('subscriptions')
              .select('*')
              .eq('user_id', userId)
              .in('provider', ['revenuecat_web', 'revenuecat_ios', 'revenuecat_android'])
              .in('status', ['active', 'trialing', 'past_due']);

            let rcExpiredCount = 0;
            if (rcDbSubscriptions && rcDbSubscriptions.length > 0) {
              
              for (const dbSub of rcDbSubscriptions) {
                try {
                  const { error: updateError } = await supabaseAdmin
                    .from('subscriptions')
                    .update({
                      status: 'expired',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', dbSub.id);
                  
                  if (!updateError) {
                    rcExpiredCount++;
                  } else {
                    console.error('[Sync Subscription] Error expiring RC database subscription:', updateError);
                  }
                } catch (err) {
                  console.error('[Sync Subscription] Error expiring RC database subscription:', err);
                }
              }
              
              // Invalidate cache after updating database subscriptions
              try {
                const { revalidateTag } = await import('next/cache');
                revalidateTag(`subscription-${userId}`);
                revalidateTag('subscription');
              } catch (cacheError) {
                console.warn('[Sync Subscription] Cache invalidation failed:', cacheError);
              }
            }

            // Now sync user role - will correctly downgrade to 'free' if no other active subscriptions
            await syncUserRoleFromSubscriptions(userId);

            // Also directly update user_type to 'free' to ensure it happens (if no manual subscription exists)
            // Only update if currently subscriber and no manual subscription found
            const { data: manualSub } = await supabaseAdmin
              .from('subscriptions')
              .select('id')
              .eq('user_id', userId)
              .eq('provider', 'manual')
              .in('status', ['active', 'trialing'])
              .maybeSingle();

            if (!manualSub) {
              const { error: profileError } = await supabaseAdmin
                .from('user_profiles')
                .update({
                  user_type: 'free',
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId)
                .eq('user_type', 'subscriber'); // Only update if currently subscriber

              if (profileError) {
                console.error('[Sync Subscription] Error updating user profile:', profileError);
              } else {
              }
            }

            return NextResponse.json({
              success: true,
              message: `No active RevenueCat subscription found. ${rcExpiredCount} RevenueCat subscription(s) marked as expired. User downgraded to free.`,
              subscription: null,
              expiredSubscriptionsUpdated: rcExpiredCount,
            });
          }
        }
      } catch (rcError) {
        console.error('[Sync Subscription] RevenueCat sync error:', rcError);
        // Continue to final fallback
      }
    }

    // No active subscription found in either provider - sync user role (will downgrade if no other active subscriptions)
    await syncUserRoleFromSubscriptions(userId);

    return NextResponse.json({
      success: true,
      message: 'No active subscription found in Stripe or RevenueCat. User role synced from database subscriptions.',
      subscription: null,
    });
  } catch (error) {
    console.error('[Stripe] Failed to sync subscription', error);
    return NextResponse.json(
      { error: 'Unable to sync subscription', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
