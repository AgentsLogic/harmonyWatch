import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  const response = NextResponse.json({ success: true });
  response.cookies.delete('sb-access-token');
  response.cookies.delete('sb-refresh-token');
  response.cookies.delete('session_token');

  if (!accessToken) {
    return response;
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return response;
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('signup_status')
      .eq('user_id', user.id)
      .single();

    if (profile?.signup_status === 'pending') {
      await supabase.auth.admin.deleteUser(user.id);
    }
  } catch (error) {
    console.error('[AbortSignup] Failed to delete pending signup', error);
  }

  return response;
}


