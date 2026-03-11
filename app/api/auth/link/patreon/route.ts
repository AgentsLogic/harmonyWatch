import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin as supabaseService } from '@/lib/supabase';
import { serverConfig } from '@/lib/env';
import crypto from 'crypto';

/**
 * GET /api/auth/link/patreon
 * Initiates Patreon OAuth flow
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

    // Check if user already has a linked Patreon account
    const { data: existingLink } = await supabaseService
      .from('linked_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'patreon')
      .eq('status', 'active')
      .maybeSingle();

    if (existingLink) {
      return NextResponse.json(
        { error: 'Patreon account is already linked' },
        { status: 400 }
      );
    }

    // Build OAuth URL
    const PATREON_CLIENT_ID = serverConfig.PATREON_CLIENT_ID;
    if (!PATREON_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Patreon OAuth is not configured' },
        { status: 500 }
      );
    }

    const redirectUri = `${serverConfig.NEXT_PUBLIC_APP_URL}/api/auth/callback/patreon`;
    const scopes = ['identity', 'identity[email]', 'identity.memberships'].join(' ');

    const state = crypto.randomUUID(); // Generate random state for CSRF protection
    const oauthUrl = new URL('https://www.patreon.com/oauth2/authorize');
    oauthUrl.searchParams.set('client_id', PATREON_CLIENT_ID);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('scope', scopes);
    oauthUrl.searchParams.set('state', state);

    // Store state in session/cookie for verification in callback
    const response = NextResponse.json({ url: oauthUrl.toString() });
    response.cookies.set('patreon_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Patreon OAuth link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
