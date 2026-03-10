import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { report, image_url } = body;

    if (!report || typeof report !== 'string' || report.trim().length === 0) {
      return NextResponse.json(
        { error: 'Bug report text is required' },
        { status: 400 }
      );
    }

    // Insert bug report into database
    const { data, error } = await supabaseAdmin
      .from('bug_reports')
      .insert({
        user_id: user.id,
        report_text: report.trim(),
        image_url: image_url || null,
        status: 'open'
      })
      .select()
      .single();

    if (error) {
      console.error('[Bug Report API] Error inserting bug report:', error);
      return NextResponse.json(
        { error: 'Failed to submit bug report' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, id: data.id },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Bug Report API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
