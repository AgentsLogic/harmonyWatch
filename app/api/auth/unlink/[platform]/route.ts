import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import {
  upsertSubscription,
  syncUserRoleFromSubscriptions,
} from '@/lib/services/subscription-service';

const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * DELETE /api/auth/unlink/[platform]
 * Unlinks an external account and expires the associated subscription
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  
  try {

    // Validate platform
    if (platform !== 'youtube' && platform !== 'patreon') {
      return NextResponse.json(
        { error: 'Invalid platform. Must be "youtube" or "patreon"' },
        { status: 400 }
      );
    }

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

    // Get linked account
    const { data: linkedAccount, error: fetchError } = await supabaseAdmin
      .from('linked_accounts')
      .select('id, external_user_id')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('status', 'active')
      .maybeSingle();

    if (fetchError || !linkedAccount) {
      return NextResponse.json(
        { error: 'Linked account not found' },
        { status: 404 }
      );
    }

    // Delete linked account
    const { error: deleteError } = await supabaseAdmin
      .from('linked_accounts')
      .delete()
      .eq('id', linkedAccount.id);

    if (deleteError) {
      console.error(`[Unlink ${platform}] Error deleting linked account:`, deleteError);
      return NextResponse.json(
        { error: 'Failed to unlink account' },
        { status: 500 }
      );
    }

    // Expire associated subscription
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', platform)
      .eq('external_id', linkedAccount.external_user_id)
      .maybeSingle();

    if (subscription) {
      await upsertSubscription({
        user_id: user.id,
        provider: platform as 'youtube' | 'patreon',
        external_id: linkedAccount.external_user_id,
        status: 'expired',
        plan: 'monthly', // Default, actual plan doesn't matter for expired subscriptions
        provider_data: {
          unlinked_at: new Date().toISOString(),
        },
      });

      // Sync user role (will downgrade if no other active subscriptions)
      await syncUserRoleFromSubscriptions(user.id);
    }

    return NextResponse.json({
      message: `${platform} account unlinked successfully`,
    });
  } catch (error) {
    const platformName = platform || 'unknown';
    console.error(`[Unlink ${platformName}] Error:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
