import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../../../../../lib/config';
import { commentsService } from '../../../../../lib/services/comments';

const supabaseAuth = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey
);

const supabaseService = createClient(
  supabaseConfig.url,
  supabaseConfig.serviceRoleKey
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  try {
    const { contentId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // Get user from cookies
    const accessToken = request.cookies.get('sb-access-token')?.value;
    let userId: string | null = null;

    if (accessToken) {
      const { data: { user } } = await supabaseAuth.auth.getUser(accessToken);
      userId = user?.id || null;
    }

    const result = await commentsService.getCommentsByContentId(
      contentId,
      userId,
      page,
      pageSize
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  try {
    const { contentId } = await params;
    const body = await request.json();
    const { commentText, parentCommentId } = body;

    if (!commentText || !commentText.trim()) {
      return NextResponse.json(
        { error: 'Comment text is required' },
        { status: 400 }
      );
    }

    // Get user from cookies
    const accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const comment = await commentsService.createComment({
      content_item_id: contentId,
      user_id: user.id,
      parent_comment_id: parentCommentId || null,
      comment_text: commentText.trim()
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}

