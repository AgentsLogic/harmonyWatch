import { supabaseAdmin } from '../supabase';

// Types
export interface Comment {
  id: string;
  content_item_id: string;
  user_id: string;
  parent_comment_id: string | null;
  comment_text: string;
  likes_count: number;
  dislikes_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_edited: boolean;
  user?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string;
  };
  user_reaction?: 'like' | 'dislike' | null;
  replies?: Comment[];
}

export interface CommentInsert {
  content_item_id: string;
  user_id: string;
  parent_comment_id?: string | null;
  comment_text: string;
}

export interface CommentUpdate {
  comment_text: string;
}

export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  reaction_type: 'like' | 'dislike';
  created_at: string;
}

export const commentsService = {
  /**
   * Get comments for a content item with pagination
   * Returns: top 1 most liked comment, then newest first for the rest
   */
  async getCommentsByContentId(
    contentId: string,
    userId: string | null = null,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ comments: Comment[]; hasMore: boolean; total: number }> {
    const offset = (page - 1) * pageSize;

    // First, get the top 1 most liked comment
    const { data: topComment, error: topError } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('content_item_id', contentId)
      .is('deleted_at', null)
      .is('parent_comment_id', null) // Only top-level comments
      .order('likes_count', { ascending: false })
      .limit(1);

    if (topError) throw topError;

    // Get the rest of the comments (newest first), excluding the top one if it exists
    const topCommentId = topComment && topComment.length > 0 ? topComment[0].id : null;
    
    let query = supabaseAdmin
      .from('comments')
      .select('*')
      .eq('content_item_id', contentId)
      .is('deleted_at', null)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false });

    if (topCommentId) {
      query = query.neq('id', topCommentId);
    }

    // Adjust limit: if we have a top comment, fetch one less from the rest
    const restLimit = topCommentId ? pageSize - 1 : pageSize;
    const restOffset = topCommentId ? offset : offset + 1;

    const { data: restComments, error: restError } = await query
      .range(restOffset, restOffset + restLimit - 1);

    if (restError) throw restError;

    // Get total count
    const { count, error: countError } = await supabaseAdmin
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('content_item_id', contentId)
      .is('deleted_at', null)
      .is('parent_comment_id', null);

    if (countError) throw countError;

    // Combine comments: top comment first, then rest
    const allComments = [
      ...(topComment || []),
      ...(restComments || [])
    ].slice(0, pageSize);

    // Fetch user reactions if userId is provided
    let userReactions: CommentReaction[] = [];
    if (userId && allComments.length > 0) {
      const commentIds = allComments.map(c => c.id);
      const { data: reactions, error: reactionsError } = await supabaseAdmin
        .from('comment_reactions')
        .select('*')
        .eq('user_id', userId)
        .in('comment_id', commentIds);

      if (!reactionsError && reactions) {
        userReactions = reactions;
      }
    }

    // Fetch user profiles for all comment authors
    const userIds = [...new Set(allComments.map(c => c.user_id))];
    let profiles: any[] = [];
    
    if (userIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);
      
      profiles = profileData || [];
    }

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    // Enrich comments with user data and reactions
    const enrichedComments: Comment[] = allComments.map(comment => {
      const profile = profileMap.get(comment.user_id);
      const reaction = userReactions.find(r => r.comment_id === comment.id);

      return {
        ...comment,
        user: {
          id: comment.user_id,
          display_name: profile?.display_name || null,
          avatar_url: profile?.avatar_url || null,
          email: '' // Email would need to come from auth.users, handled separately if needed
        },
        user_reaction: reaction?.reaction_type || null,
        replies: [] // Replies will be fetched separately if needed
      };
    });

    const total = count || 0;
    const hasMore = (offset + allComments.length) < total;

    return {
      comments: enrichedComments,
      hasMore,
      total
    };
  },

  /**
   * Get replies for a comment
   */
  async getRepliesByCommentId(
    commentId: string,
    userId: string | null = null
  ): Promise<Comment[]> {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('parent_comment_id', commentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return [];
    }

    // Fetch user reactions if userId is provided
    let userReactions: CommentReaction[] = [];
    const replyIds = data.map(c => c.id);
    if (userId) {
      const { data: reactions, error: reactionsError } = await supabaseAdmin
        .from('comment_reactions')
        .select('*')
        .eq('user_id', userId)
        .in('comment_id', replyIds);

      if (!reactionsError && reactions) {
        userReactions = reactions;
      }
    }

    // Fetch user profiles
    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    // Enrich replies with user data and reactions
    return data.map(comment => {
      const profile = profileMap.get(comment.user_id);
      const reaction = userReactions.find(r => r.comment_id === comment.id);

      return {
        ...comment,
        user: {
          id: comment.user_id,
          display_name: profile?.display_name || null,
          avatar_url: profile?.avatar_url || null,
          email: ''
        },
        user_reaction: reaction?.reaction_type || null,
        replies: []
      };
    });
  },

  /**
   * Create a new comment
   */
  async createComment(data: CommentInsert): Promise<Comment> {
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        content_item_id: data.content_item_id,
        user_id: data.user_id,
        parent_comment_id: data.parent_comment_id || null,
        comment_text: data.comment_text
      })
      .select('*')
      .single();

    if (error) throw error;

    // Fetch user profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, display_name, avatar_url')
      .eq('user_id', comment.user_id)
      .single();

    return {
      ...comment,
      user: {
        id: comment.user_id,
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
        email: ''
      },
      user_reaction: null,
      replies: []
    };
  },

  /**
   * Update a comment (only by owner)
   */
  async updateComment(
    commentId: string,
    userId: string,
    data: CommentUpdate
  ): Promise<Comment> {
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .update({
        comment_text: data.comment_text,
        is_edited: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) throw error;
    if (!comment) throw new Error('Comment not found or unauthorized');

    // Fetch user profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, display_name, avatar_url')
      .eq('user_id', comment.user_id)
      .single();

    return {
      ...comment,
      user: {
        id: comment.user_id,
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
        email: ''
      },
      user_reaction: null,
      replies: []
    };
  },

  /**
   * Soft delete a comment (owner or admin)
   */
  async deleteComment(
    commentId: string,
    userId: string,
    isAdmin: boolean = false
  ): Promise<void> {
    let query = supabaseAdmin
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId);

    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;

    if (error) throw error;
  },

  /**
   * Add or update a reaction
   */
  async addReaction(
    commentId: string,
    userId: string,
    reactionType: 'like' | 'dislike'
  ): Promise<void> {
    // Check if reaction already exists
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('comment_reactions')
      .select('*')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle() to avoid error when no rows found

    if (existingError && existingError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      throw existingError;
    }

    if (existing) {
      // Update existing reaction
      if (existing.reaction_type !== reactionType) {
        const { error } = await supabaseAdmin
          .from('comment_reactions')
          .update({ reaction_type: reactionType })
          .eq('id', existing.id);

        if (error) throw error;
      }
      // If same reaction type, do nothing (user clicked same button)
    } else {
      // Insert new reaction
      const { error } = await supabaseAdmin
        .from('comment_reactions')
        .insert({
          comment_id: commentId,
          user_id: userId,
          reaction_type: reactionType
        });

      if (error) throw error;
    }
  },

  /**
   * Remove a reaction
   */
  async removeReaction(commentId: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  /**
   * Get user's reaction for a comment
   */
  async getUserReaction(
    commentId: string,
    userId: string
  ): Promise<'like' | 'dislike' | null> {
    const { data, error } = await supabaseAdmin
      .from('comment_reactions')
      .select('reaction_type')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned

    return data?.reaction_type || null;
  }
};

