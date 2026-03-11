import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin as supabaseService } from '@/lib/supabase';

// Helper function to set auth cookies
function setAuthCookies(response: NextResponse, accessToken: string, refreshToken?: string) {
  response.cookies.set('sb-access-token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'
  });

  if (refreshToken) {
    response.cookies.set('sb-refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: '/'
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken, refreshToken, isSignupFlow, email: emailFromRequest, fullName: fullNameFromRequest } = body;

    // Get the access token from request body or cookies
    const token = accessToken || request.cookies.get('sb-access-token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'No access token found' },
        { status: 401 }
      );
    }

    // Verify the user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Check if user profile exists
    const { data: profile, error: profileError } = await supabaseService
      .from('user_profiles')
      .select('display_name, signup_status')
      .eq('user_id', user.id)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      // Profile doesn't exist, create it
      // Try multiple sources for email (Apple Sign-In can put it in different places)
      // Priority: user.email > emailFromRequest > user_metadata.email
      const email = user.email || emailFromRequest || user.user_metadata?.email || user.user_metadata?.email_address;
      
      // Log what we have for debugging
      
      // Extract display name with proper fallback
      // Priority: fullNameFromRequest > user_metadata.full_name > user_metadata.name > email prefix
      let fullName: string | null = null;
      
      if (fullNameFromRequest && typeof fullNameFromRequest === 'string' && fullNameFromRequest.trim()) {
        fullName = fullNameFromRequest.trim();
      } else if (user.user_metadata?.full_name) {
        fullName = user.user_metadata.full_name;
      } else if (user.user_metadata?.name) {
        fullName = user.user_metadata.name;
      } else if (email && typeof email === 'string' && email.trim() && email.includes('@')) {
        // Only use email prefix if email is valid
        const emailPrefix = email.split('@')[0].trim();
        if (emailPrefix && emailPrefix.length > 0) {
          fullName = emailPrefix;
        }
      }
      

      // If isSignupFlow is true, user is going to payment page - set status to 'pending'
      // Otherwise, user is logging in - set status to 'complete'
      const signupStatus = isSignupFlow ? 'pending' : 'complete';

      const { error: createError } = await supabaseService
        .from('user_profiles')
        .insert({
          user_id: user.id,
          user_type: 'free',
          signup_status: signupStatus,
          display_name: fullName,
        });

      if (createError) {
        console.error('Error creating profile:', createError);
        return NextResponse.json(
          { error: 'Failed to create user profile' },
          { status: 500 }
        );
      }

      // Set session cookies so subsequent API calls can authenticate
      const response = NextResponse.json(
        { success: true, signup_status: signupStatus },
        { status: 200 }
      );
      
      if (accessToken) {
        setAuthCookies(response, accessToken, refreshToken);
      }
      
      return response;
    }

    // Profile already exists - update display_name if missing or set to default 'User'
    if (profile && (!profile.display_name || profile.display_name === 'User')) {
      // Try multiple sources for email (Apple Sign-In can put it in different places)
      // Priority: user.email > emailFromRequest > user_metadata.email
      const email = user.email || emailFromRequest || user.user_metadata?.email || user.user_metadata?.email_address;
      
      // Extract display name with proper fallback
      // Priority: fullNameFromRequest > user_metadata.full_name > user_metadata.name > email prefix
      let fullName: string | null = null;
      
      if (fullNameFromRequest && typeof fullNameFromRequest === 'string' && fullNameFromRequest.trim()) {
        fullName = fullNameFromRequest.trim();
      } else if (user.user_metadata?.full_name) {
        fullName = user.user_metadata.full_name;
      } else if (user.user_metadata?.name) {
        fullName = user.user_metadata.name;
      } else if (email && typeof email === 'string' && email.trim() && email.includes('@')) {
        // Only use email prefix if email is valid
        const emailPrefix = email.split('@')[0].trim();
        if (emailPrefix && emailPrefix.length > 0) {
          fullName = emailPrefix;
        }
      }
      
      if (fullName) {
        await supabaseService
          .from('user_profiles')
          .update({ display_name: fullName })
          .eq('user_id', user.id);
      } else {
      }
    }

    // Set session cookies so subsequent API calls can authenticate
    const response = NextResponse.json(
      { success: true, signup_status: profile?.signup_status },
      { status: 200 }
    );
    
    if (accessToken) {
      setAuthCookies(response, accessToken, refreshToken);
    }
    
    return response;
  } catch (error) {
    console.error('Create native Apple profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
