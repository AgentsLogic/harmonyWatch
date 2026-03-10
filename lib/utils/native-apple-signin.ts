import { Capacitor, registerPlugin } from '@capacitor/core';
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from '@/lib/env';

const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  publicConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Timeout duration for Apple Sign-In (30 seconds)
const APPLE_SIGN_IN_TIMEOUT = 30000;

/**
 * Decodes a JWT token and returns the payload
 * Note: This does NOT verify the signature - only extracts the payload
 */
function decodeJWT(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    // Add padding if needed
    const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('[Apple Sign In] Error decoding JWT:', error);
    return null;
  }
}

// Define the plugin interface
// Note: clientId and redirectURI are required for web OAuth but optional for native iOS
interface SignInWithApplePlugin {
  authorize(options: {
    clientId?: string;
    redirectURI?: string;
    scopes?: string;
    state?: string;
    nonce?: string;
  }): Promise<{
    response: {
      user: string | null;
      email: string | null;
      givenName: string | null;
      familyName: string | null;
      identityToken: string;
      authorizationCode: string;
    };
  }>;
}

// Register the plugin directly - this is more reliable for remote URL apps
// The plugin MUST be registered with the exact same name as in the native code
let SignInWithApplePlugin: SignInWithApplePlugin | null = null;

function getAppleSignInPlugin(): SignInWithApplePlugin | null {
  if (typeof window === 'undefined') {
    console.warn('[Apple Sign In] Window is undefined (SSR)');
    return null;
  }

  if (!Capacitor.isNativePlatform()) {
    console.warn('[Apple Sign In] Not running on native platform');
    return null;
  }

  // Only register once
  if (!SignInWithApplePlugin) {
    try {
      console.log('[Apple Sign In] Registering plugin with Capacitor...');
      console.log('[Apple Sign In] Platform:', Capacitor.getPlatform());
      console.log('[Apple Sign In] Is native:', Capacitor.isNativePlatform());
      
      // Register the plugin - must match the native plugin name exactly
      SignInWithApplePlugin = registerPlugin<SignInWithApplePlugin>('SignInWithApple');
      
      console.log('[Apple Sign In] Plugin registered:', SignInWithApplePlugin);
      console.log('[Apple Sign In] Plugin type:', typeof SignInWithApplePlugin);
      console.log('[Apple Sign In] Plugin keys:', SignInWithApplePlugin ? Object.keys(SignInWithApplePlugin) : 'null');
    } catch (error: any) {
      console.error('[Apple Sign In] Plugin registration error:', error);
      console.error('[Apple Sign In] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return null;
    }
  }

  return SignInWithApplePlugin;
}

/**
 * Wraps a promise with a timeout to prevent infinite hangs
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    })
  ]);
}

export interface NativeAppleSignInResult {
  success: boolean;
  error?: string;
  user?: any;
}

/**
 * Performs native Apple Sign In on iOS devices
 * Shows a native modal popup instead of redirecting to Safari
 * Falls back to web OAuth if native sign in is unavailable
 * @param isSignupFlow - If true, creates profile with 'pending' status (for payment flow). If false, creates with 'complete' status (for login).
 */
export async function nativeAppleSignIn(isSignupFlow: boolean = false): Promise<NativeAppleSignInResult> {
  // Only work on native iOS
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return {
      success: false,
      error: 'Native Apple Sign In is only available on iOS'
    };
  }

  try {
    // Verify Capacitor is available
    if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.getPlatform) {
      console.error('[Apple Sign In] Capacitor not available');
      return {
        success: false,
        error: 'Capacitor is not available. Please ensure the app is running in native mode.'
      };
    }

    // Get the plugin (registers it if not already registered)
    console.log('[Apple Sign In] Getting plugin...');
    const SignInWithApple = getAppleSignInPlugin();
    
    if (!SignInWithApple) {
      console.error('[Apple Sign In] Plugin not available');
      return {
        success: false,
        error: 'Apple Sign In plugin is not available. The plugin may not be installed in the iOS app. Please rebuild the app.'
      };
    }

    console.log('[Apple Sign In] Plugin available, starting native authorization...');
    
    // Try calling authorize with NO options
    // The native iOS API should use defaults and request basic info
    console.log('[Apple Sign In] Calling authorize() with NO options (using defaults)');

    // Perform native Apple Sign In with timeout protection
    let result;
    try {
      // Explicitly request email and name scopes
      result = await withTimeout(
        SignInWithApple.authorize({
          scopes: 'email name',
        }),
        APPLE_SIGN_IN_TIMEOUT,
        'Apple Sign In timed out. Please try again.'
      );
    } catch (authError: any) {
      console.error('[Apple Sign In] Authorization error:', authError);
      
      // Check if user cancelled
      if (authError.message?.includes('canceled') || authError.message?.includes('cancelled') || authError.code === 1001) {
        return {
          success: false,
          error: 'Sign in was cancelled'
        };
      }
      
      // Check if it was a timeout
      if (authError.message?.includes('timed out')) {
        return {
          success: false,
          error: authError.message
        };
      }
      
      // Re-throw to be caught by outer catch
      throw authError;
    }

    console.log('[Apple Sign In] Authorization response received:', {
      hasResponse: !!result.response,
      hasIdentityToken: !!result.response?.identityToken,
      hasAuthorizationCode: !!result.response?.authorizationCode,
      hasEmail: !!result.response?.email,
      email: result.response?.email,
      hasGivenName: !!result.response?.givenName,
      hasFamilyName: !!result.response?.familyName,
    });
    
    // Extract email from response if available
    let emailFromResponse = result.response?.email || null;
    
    // Extract name from response (givenName + familyName)
    let fullNameFromResponse: string | null = null;
    if (result.response?.givenName || result.response?.familyName) {
      const parts = [result.response.givenName, result.response.familyName].filter(Boolean);
      if (parts.length > 0) {
        fullNameFromResponse = parts.join(' ').trim();
      }
    }
    
    // If email not in response, try to decode it from identity token
    if (!emailFromResponse && result.response?.identityToken) {
      const decodedToken = decodeJWT(result.response.identityToken);
      if (decodedToken) {
        emailFromResponse = decodedToken.email || decodedToken.sub || null;
        console.log('[Apple Sign In] Extracted email from identity token:', emailFromResponse);
        
        // Also try to get name from token if not in response
        if (!fullNameFromResponse && decodedToken.name) {
          fullNameFromResponse = decodedToken.name;
        }
      }
    }
    
    console.log('[Apple Sign In] Extracted name from response:', fullNameFromResponse);

    // Check if result exists and has required data
    if (!result || !result.response) {
      console.error('[Apple Sign In] No response from Apple');
      return {
        success: false,
        error: 'No response from Apple Sign In'
      };
    }

    if (!result.response.identityToken) {
      console.error('[Apple Sign In] No identity token in response');
      return {
        success: false,
        error: 'Failed to get identity token from Apple. Please try again.'
      };
    }

    console.log('[Apple Sign In] Authenticating with Supabase...');

    // Use Supabase's signInWithIdToken to authenticate
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: result.response.identityToken,
      access_token: result.response.authorizationCode || undefined
    });

    if (error) {
      console.error('[Apple Sign In] Supabase authentication error:', error);
      return {
        success: false,
        error: error.message || 'Authentication failed. Please try again.'
      };
    }

    if (!data.session || !data.user) {
      console.error('[Apple Sign In] No session or user data from Supabase');
      return {
        success: false,
        error: 'Authentication failed. No session created.'
      };
    }

    console.log('[Apple Sign In] Creating/updating user profile...');
    console.log('[Apple Sign In] User email from Supabase:', data.user.email);
    console.log('[Apple Sign In] Email from Apple response:', emailFromResponse);

    // Ensure profile exists with correct signup_status
    try {
      const profileResponse = await withTimeout(
        fetch('/api/auth/create-native-apple-profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token, // Pass refresh token to set cookies
            isSignupFlow: isSignupFlow || false,
            email: emailFromResponse || data.user.email || null, // Pass email if available
            fullName: fullNameFromResponse || null, // Pass full name if available
          }),
        }),
        10000, // 10 second timeout for profile creation
        'Profile creation timed out'
      );

      if (!profileResponse.ok) {
        const errorData = await profileResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Apple Sign In] Failed to create/update profile:', errorData.error);
        // Don't fail the sign in if profile creation fails - profile will be created on next API call
      } else {
        console.log('[Apple Sign In] Profile created/updated successfully');
      }
    } catch (profileError: any) {
      console.error('[Apple Sign In] Error creating profile:', profileError);
      // Don't fail the sign in if profile creation fails - profile will be created on next API call
    }

    console.log('[Apple Sign In] Success!');
    return {
      success: true,
      user: data.user
    };
  } catch (error: any) {
    console.error('[Apple Sign In] Unexpected error:', error);
    return {
      success: false,
      error: error.message || 'Apple Sign In failed. Please try again.'
    };
  }
}
