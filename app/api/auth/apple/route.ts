import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next') ?? '/';

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${request.nextUrl.origin}/api/auth/callback/apple?next=${encodeURIComponent(next)}`,
        scopes: 'email name',
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.url) {
      return NextResponse.redirect(data.url);
    }

    return NextResponse.json({ error: 'No redirect URL' }, { status: 400 });
  } catch (error) {
    console.error('Apple OAuth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}








