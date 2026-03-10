import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publicConfig, serverConfig } from '@/lib/env';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  publicConfig.NEXT_PUBLIC_SUPABASE_URL,
  serverConfig.SUPABASE_SERVICE_ROLE_KEY
);

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
