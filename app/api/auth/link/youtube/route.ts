import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin as supabaseService } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import crypto from 'crypto';

/**
 * GET /api/auth/link/youtube
 * Initiates YouTube OAuth flow
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

    // Check if user already has a linked YouTube account
    const { data: existingLink } = await supabaseService
      .from('linked_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'youtube')
      .eq('status', 'active')
      .maybeSingle();

    if (existingLink) {
      return NextResponse.json(
        { error: 'YouTube account is already linked' },
        { status: 400 }
      );
    }

    // Build OAuth URL
    const YOUTUBE_CLIENT_ID = serverConfig.YOUTUBE_CLIENT_ID;
    if (!YOUTUBE_CLIENT_ID) {
      return NextResponse.json(
        { error: 'YouTube OAuth is not configured' },
        { status: 500 }
      );
    }

    const redirectUri = `${serverConfig.NEXT_PUBLIC_APP_URL}/api/auth/callback/youtube`;
    const scopes = [
      'openid',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' ');

    const state = crypto.randomUUID(); // Generate random state for CSRF protection
    const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauthUrl.searchParams.set('client_id', YOUTUBE_CLIENT_ID);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('scope', scopes);
    oauthUrl.searchParams.set('access_type', 'offline'); // Required to get refresh token
    oauthUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
    oauthUrl.searchParams.set('state', state);

    // Store state in session/cookie for verification in callback
    const response = NextResponse.json({ url: oauthUrl.toString() });
    response.cookies.set('youtube_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('YouTube OAuth link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
