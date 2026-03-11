import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin as supabaseService } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import {
  exchangeYouTubeCode,
  getYouTubeChannelId,
  storeLinkedYouTubeAccount,
  filterByMemberChannelId,
} from '@/lib/services/youtube-membership';
import { upsertSubscription, syncUserRoleFromSubscriptions } from '@/lib/services/subscription-service';

/**
 * GET /api/auth/callback/youtube
 * Handles YouTube OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('YouTube OAuth error:', error);
      return NextResponse.redirect(`${origin}/settings?error=youtube_oauth_failed`);
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/settings?error=no_code`);
    }

    // Verify state (CSRF protection)
    const storedState = request.cookies.get('youtube_oauth_state')?.value;
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
    const redirectUri = `${serverConfig.NEXT_PUBLIC_APP_URL}/api/auth/callback/youtube`;
    const { access_token, refresh_token, expires_in } = await exchangeYouTubeCode(code, redirectUri);

    // Get user's YouTube channel ID
    const channelId = await getYouTubeChannelId(access_token);

    // Check if this channel is already linked to another user
    const { data: existingLink } = await supabaseService
      .from('linked_accounts')
      .select('user_id')
      .eq('platform', 'youtube')
      .eq('external_user_id', channelId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingLink && existingLink.user_id !== user.id) {
      return NextResponse.redirect(`${origin}/settings?error=account_already_linked`);
    }

    // Store linked account
    await storeLinkedYouTubeAccount({
      userId: user.id,
      channelId,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
    });

    // Immediately check if user is a member
    const YOUTUBE_CHANNEL_ID = serverConfig.YOUTUBE_CHANNEL_ID;
    if (YOUTUBE_CHANNEL_ID) {
      try {
        const memberChannelIds = await filterByMemberChannelId([channelId]);
        const isMember = memberChannelIds.has(channelId);

        if (isMember) {
          // User is a member - create subscription
          await upsertSubscription({
            user_id: user.id,
            provider: 'youtube',
            external_id: channelId,
            status: 'active',
            plan: 'monthly', // YouTube memberships are always monthly
            current_period_start: new Date().toISOString(),
            // YouTube memberships don't have explicit expiration - they're active until canceled
            // We'll rely on cron job to detect when membership ends
            provider_data: {
              channel_id: channelId,
            },
          });

          // Sync user role
          await syncUserRoleFromSubscriptions(user.id);
        }
      } catch (memberCheckError) {
        // Log error but don't fail the linking process
        // Cron job will check membership status later
        console.error('Error checking YouTube membership during link:', memberCheckError);
      }
    }

    // Clear OAuth state cookie
    const response = NextResponse.redirect(`${origin}/settings?linked=youtube`);
    response.cookies.delete('youtube_oauth_state');

    return response;
  } catch (error) {
    console.error('YouTube OAuth callback error:', error);
    const { origin } = new URL(request.url);
    return NextResponse.redirect(`${origin}/settings?error=youtube_callback_failed`);
  }
}
