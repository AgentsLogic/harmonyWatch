import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin as supabaseService } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    try {
      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Error exchanging code for session:', error);
        return NextResponse.redirect(`${origin}/login?error=authentication_failed`);
      }

      if (!data.user) {
        return NextResponse.redirect(`${origin}/login?error=no_user`);
      }

      // Check if user profile exists, create if not
      const { data: profile, error: profileError } = await supabaseService
        .from('user_profiles')
        .select('id')
        .eq('user_id', data.user.id)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        // Profile doesn't exist, create it
        const email = data.user.email;
        const fullName = data.user.user_metadata?.full_name || 
                        data.user.user_metadata?.name ||
                        email?.split('@')[0] || 
                        'User';

        // If redirecting to payment page, user is in signup flow - set status to 'pending'
        // Otherwise, user is logging in with existing account - set status to 'complete'
        const isSignupFlow = next === '/signup/payment' || next.startsWith('/signup/payment');
        const signupStatus = isSignupFlow ? 'pending' : 'complete';

        const { error: createError } = await supabaseService
          .from('user_profiles')
          .insert({
            user_id: data.user.id,
            user_type: 'free',
            signup_status: signupStatus,
            display_name: fullName,
          });

        if (createError) {
          console.error('Error creating profile:', createError);
        }
      }

      // Set session cookies
      const response = NextResponse.redirect(`${origin}${next}`);
      
      if (data.session?.access_token) {
        response.cookies.set('sb-access-token', data.session.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
          path: '/'
        });
      }

      if (data.session?.refresh_token) {
        response.cookies.set('sb-refresh-token', data.session.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 90,
          path: '/'
        });
      }

      return response;
    } catch (error) {
      console.error('Callback error:', error);
      return NextResponse.redirect(`${origin}/login?error=callback_error`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`);
}








