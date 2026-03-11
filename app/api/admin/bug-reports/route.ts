import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from access token
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.user_type !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabaseAdmin
      .from('bug_reports')
      .select(`
        id,
        user_id,
        report_text,
        image_url,
        status,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: bugReports, error } = await query;

    if (error) {
      console.error('[Admin Bug Reports API] Error fetching bug reports:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bug reports', details: error.message },
        { status: 500 }
      );
    }

    // Get total count
    let countQuery = supabaseAdmin
      .from('bug_reports')
      .select('id', { count: 'exact', head: true });

    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('[Admin Bug Reports API] Error counting bug reports:', countError);
    }

    // Fetch user profiles and auth users separately
    const userIds = [...new Set((bugReports || []).map((r: any) => r.user_id))];
    
    // Fetch user profiles
    const { data: userProfiles, error: profilesError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('[Admin Bug Reports API] Error fetching user profiles:', profilesError);
    }

    // Create a map of user_id -> display_name
    const userProfilesMap = new Map();
    (userProfiles || []).forEach((profile: any) => {
      userProfilesMap.set(profile.user_id, profile.display_name);
    });

    // Fetch emails for just these reporters (targeted lookup instead of all users)
    const authUserResults = await Promise.all(
      userIds.map((id: string) => supabaseAdmin.auth.admin.getUserById(id))
    );

    // Create a map of user_id -> email
    const authUsersMap = new Map();
    authUserResults.forEach(({ data: { user: authUser } }) => {
      if (authUser) authUsersMap.set(authUser.id, authUser.email);
    });

    // Transform data to include user email and display name
    const transformedReports = (bugReports || []).map((report: any) => ({
      id: report.id,
      user_id: report.user_id,
      report_text: report.report_text,
      image_url: report.image_url,
      status: report.status,
      created_at: report.created_at,
      updated_at: report.updated_at,
      user_email: authUsersMap.get(report.user_id) || null,
      user_display_name: userProfilesMap.get(report.user_id) || null,
    }));

    return NextResponse.json(
      {
        bug_reports: transformedReports,
        total: count || 0,
        limit,
        offset
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Admin Bug Reports API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Get authenticated user from access token
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.user_type !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Bug report ID and status are required' },
        { status: 400 }
      );
    }

    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Update bug report status
    const { data, error } = await supabaseAdmin
      .from('bug_reports')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Admin Bug Reports API] Error updating bug report:', error);
      return NextResponse.json(
        { error: 'Failed to update bug report' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, bug_report: data },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Admin Bug Reports API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user from access token
    const accessToken = request.cookies.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.user_type !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Bug report ID is required' },
        { status: 400 }
      );
    }

    // Delete bug report
    const { error } = await supabaseAdmin
      .from('bug_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Admin Bug Reports API] Error deleting bug report:', error);
      return NextResponse.json(
        { error: 'Failed to delete bug report' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Admin Bug Reports API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
