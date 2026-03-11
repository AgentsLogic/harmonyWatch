import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { checkAdminOrStaffAuth } from '@/lib/utils/admin-auth';

// GET - Fetch all landing page content or specific content by key (public endpoint)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const contentKey = searchParams.get("key");

    let query = supabase
      .from("landing_page_content")
      .select("*")
      .order("content_key", { ascending: true });

    if (contentKey) {
      query = query.eq("content_key", contentKey);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching landing page content:", error);
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: 'Database table not found. Please run the migration: database-migrations/add-landing-page-content.sql'
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch content"},
        { status: 500 }
      );
    }

    // Add caching headers for better performance
    // Cache for 5 minutes, but allow revalidation
    const headers = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    };

    if (contentKey) {
      if (data && data.length > 0) {
      return NextResponse.json({ content: data[0] }, { headers });
      } else {
        // Content key requested but not found
        return NextResponse.json(
          { error: "Content not found", content: null },
          { status: 404, headers }
        );
      }
    }

    return NextResponse.json({ content: data || [] }, { headers });
  } catch (error) {
    console.error("Error in GET /api/landing-content:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Update or create landing page content (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await checkAdminOrStaffAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { content_key, title, content } = body;

    if (!content_key || !title || content === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: content_key, title, content" },
        { status: 400 }
      );
    }

    // Upsert the content
    const { data: updatedContent, error: upsertError } = await supabase
      .from("landing_page_content")
      .upsert(
        {
          content_key,
          title,
          content,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "content_key",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting landing page content:", upsertError);
      return NextResponse.json(
        { error: "Failed to save content", details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ content: updatedContent });
  } catch (error) {
    console.error("Error in POST /api/landing-content:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
