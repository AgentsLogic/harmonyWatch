import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

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


