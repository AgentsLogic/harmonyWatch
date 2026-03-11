import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin as supabaseService } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import {
  exchangePatreonCode,
  getPatreonIdentity,
  storeLinkedPatreonAccount,
  calculatePatreonExpiresAt,
} from '@/lib/services/patreon-membership';
import { upsertSubscription, syncUserRoleFromSubscriptions } from '@/lib/services/subscription-service';

/**
 * GET /api/auth/callback/patreon
 * Handles Patreon OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('Patreon OAuth error:', error);
      return NextResponse.redirect(`${origin}/settings?error=patreon_oauth_failed`);
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/settings?error=no_code`);
    }

    // Verify state (CSRF protection)
    const storedState = request.cookies.get('patreon_oauth_state')?.value;
    if (!state || state !== storedState) {
      return NextResponse.redirect(`${origin}/settings?error=invalid_state`);
    }

    // Get user from session
    const accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      return NextResponse.redirect(`${origin}/settings?error=not_authenticated`);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.redirect(`${origin}/settings?error=invalid_session`);
    }

    // Exchange code for tokens
    const redirectUri = `${serverConfig.NEXT_PUBLIC_APP_URL}/api/auth/callback/patreon`;
    const { access_token, refresh_token, expires_in } = await exchangePatreonCode(code, redirectUri);

    // Get Patreon identity and membership status
    const { user: patreonUser, membership } = await getPatreonIdentity(access_token);

    // Check if this Patreon account is already linked to another user
    const { data: existingLink } = await supabaseService
      .from('linked_accounts')
      .select('user_id')
      .eq('platform', 'patreon')
      .eq('external_user_id', patreonUser.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingLink && existingLink.user_id !== user.id) {
      return NextResponse.redirect(`${origin}/settings?error=account_already_linked`);
    }

    // Store linked account
    await storeLinkedPatreonAccount({
      userId: user.id,
      patreonUserId: patreonUser.id,
      patreonEmail: patreonUser.email,
      patreonFullName: patreonUser.full_name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      membership: membership ? {
        patron_status: membership.patron_status,
        pledge_cadence: membership.pledge_cadence,
        next_charge_date: membership.next_charge_date,
      } : undefined,
    });

    // Check membership status and create subscription if active
    if (membership) {
      const patronStatus = membership.patron_status;

      if (patronStatus === 'active_patron') {
        // Active patron - create active subscription
        const plan = membership.pledge_cadence === 12 ? 'yearly' : 'monthly';
        const expiresAt = membership.next_charge_date || null;

        await upsertSubscription({
          user_id: user.id,
          provider: 'patreon',
          external_id: patreonUser.id,
          status: 'active',
          plan,
          current_period_start: membership.pledge_relationship_start || new Date().toISOString(),
          current_period_end: expiresAt,
          expires_at: expiresAt,
          provider_data: {
            patron_status: patronStatus,
            pledge_cadence: membership.pledge_cadence,
            next_charge_date: membership.next_charge_date,
            last_charge_date: membership.last_charge_date,
            last_charge_status: membership.last_charge_status,
            currently_entitled_amount_cents: membership.currently_entitled_amount_cents,
          },
        });

        // Sync user role
        await syncUserRoleFromSubscriptions(user.id);
      } else if (patronStatus === 'declined_patron') {
        // Declined patron - payment retry in progress, grant temporary access
        const plan = membership.pledge_cadence === 12 ? 'yearly' : 'monthly';
        const expiresAt = membership.next_charge_date || null;

        await upsertSubscription({
          user_id: user.id,
          provider: 'patreon',
          external_id: patreonUser.id,
          status: 'past_due',
          plan,
          current_period_start: membership.pledge_relationship_start || new Date().toISOString(),
          current_period_end: expiresAt,
          expires_at: expiresAt,
          provider_data: {
            patron_status: patronStatus,
            pledge_cadence: membership.pledge_cadence,
            next_charge_date: membership.next_charge_date,
            last_charge_date: membership.last_charge_date,
            last_charge_status: membership.last_charge_status,
          },
        });

        // Sync user role (past_due grants temporary access)
        await syncUserRoleFromSubscriptions(user.id);
      } else if (patronStatus === 'former_patron') {
        // Former patron - check if access period is still active
        const { status, expiresAt } = calculatePatreonExpiresAt(
          membership.next_charge_date,
          membership.last_charge_date,
          membership.pledge_cadence
        );

        if (status === 'canceled' && expiresAt) {
          // Access period still active - create canceled subscription
          const plan = membership.pledge_cadence === 12 ? 'yearly' : 'monthly';

          await upsertSubscription({
            user_id: user.id,
            provider: 'patreon',
            external_id: patreonUser.id,
            status: 'canceled',
            plan,
            current_period_start: membership.pledge_relationship_start || new Date().toISOString(),
            current_period_end: expiresAt,
            expires_at: expiresAt,
            canceled_at: new Date().toISOString(),
            provider_data: {
              patron_status: patronStatus,
              pledge_cadence: membership.pledge_cadence,
              next_charge_date: membership.next_charge_date,
              last_charge_date: membership.last_charge_date,
              last_charge_status: membership.last_charge_status,
            },
          });

          // Sync user role (canceled with future expires_at grants access)
          await syncUserRoleFromSubscriptions(user.id);
        }
        // If status is 'expired', don't create subscription - user is not a patron
      }
      // If patron_status is null, don't create subscription - user is not a patron
    }

    // Clear OAuth state cookie
    const response = NextResponse.redirect(`${origin}/settings?linked=patreon`);
    response.cookies.delete('patreon_oauth_state');

    return response;
  } catch (error) {
    console.error('Patreon OAuth callback error:', error);
    const { origin } = new URL(request.url);
    return NextResponse.redirect(`${origin}/settings?error=patreon_callback_failed`);
  }
}
