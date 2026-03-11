import { NextRequest } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

/**
 * Verify that the user is an admin (for user management and sensitive operations)
 * Returns user object if admin, null otherwise
 */
export async function verifyAdmin(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (!accessToken) {
    return { error: 'No access token found', status: 401, user: null };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  
  if (authError || !user) {
    return { error: 'Invalid or expired token', status: 401, user: null };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_type')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: 'Unauthorized - Admin access required', status: 403, user: null };
  }

  return { error: null, status: 200, user };
}

/**
 * Verify that the user is an admin or staff (for content management operations)
 * Returns user object if admin or staff, null otherwise
 */
export async function verifyAdminOrStaff(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (!accessToken) {
    return { error: 'No access token found', status: 401, user: null, userType: null };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  
  if (authError || !user) {
    return { error: 'Invalid or expired token', status: 401, user: null, userType: null };
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_type')
    .eq('user_id', user.id)
    .single();

  if (!profile || (profile.user_type !== 'admin' && profile.user_type !== 'staff')) {
    return { error: 'Unauthorized - Admin or Staff access required', status: 403, user: null, userType: null };
  }

  return { error: null, status: 200, user, userType: profile.user_type };
}

/**
 * Verify admin access, accepting both Bearer token (Authorization header) and cookie.
 * Use for endpoints that may be called server-side with explicit Bearer tokens.
 */
export async function verifyAdminBearer(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : request.cookies.get('sb-access-token')?.value ?? null;

    if (!accessToken) {
      return { error: 'Not authenticated', status: 401, user: null };
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return { error: 'Invalid session', status: 401, user: null };
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profile?.user_type !== 'admin') {
      return { error: 'Forbidden: Admin access required', status: 403, user: null };
    }

    return { error: null, status: 200, user };
  } catch (error) {
    console.error('Admin verification error:', error);
    return { error: 'Internal server error', status: 500, user: null };
  }
}

/**
 * Check if user is admin or staff (returns user or null, simpler for content routes)
 */
export async function checkAdminOrStaffAuth(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return null;
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return null;
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (!profile || (profile.user_type !== 'admin' && profile.user_type !== 'staff')) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Error checking admin/staff auth:', error);
    return null;
  }
}
