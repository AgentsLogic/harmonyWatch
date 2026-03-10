"use client";

import { useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Comment } from '../services/comments';
import { useUser } from '@/app/contexts/user-context';
import { queryKeys } from '../query-keys';

interface UseCommentsOptions {
  contentId: string | null;
  pageSize?: number;
  autoLoad?: boolean;
}

interface CommentsPageResponse {
  comments: Comment[];
  hasMore: boolean;
  total: number;
}

interface UseCommentsReturn {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  page: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  addComment: (text: string, parentId?: string | null) => Promise<Comment>;
  updateComment: (commentId: string, text: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  toggleReaction: (commentId: string, reactionType: 'like' | 'dislike') => Promise<void>;
}

async function fetchCommentsPage(
  contentId: string,
  page: number,
  pageSize: number
): Promise<CommentsPageResponse> {
  const response = await fetch(
    `/api/comments/item/${contentId}?page=${page}&pageSize=${pageSize}`,
    {
      credentials: 'include'
    }
  );

  if (!response.ok) {
    throw new Error('Failed to load comments');
  }

  return response.json();
}

export function useComments({
  contentId,
  pageSize = 20,
  autoLoad = true
}: UseCommentsOptions): UseCommentsReturn {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Use infinite query for pagination
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: queryKeys.comments.byContent(contentId || ''), // Stable key based on contentId only
    queryFn: ({ pageParam }: { pageParam: number }) => {
      return fetchCommentsPage(contentId!, pageParam, pageSize);
    },
    initialPageParam: 1,
    enabled: autoLoad && !!contentId,
    getNextPageParam: (lastPage: CommentsPageResponse, allPages: CommentsPageResponse[]) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length + 1;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    placeholderData: (previousData) => previousData, // Keep previous data while refetching
  });

  // Flatten all pages into a single comments array
  const comments = data?.pages.flatMap((page: CommentsPageResponse) => page.comments) || [];
  const total = data?.pages[0]?.total || 0;
  const hasMore = hasNextPage || false;
  const loading = isLoading;
  const page = data?.pages.length || 0;

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ text, parentId }: { text: string; parentId?: string | null }) => {
      if (!contentId || !user?.id) {
        throw new Error('Must be logged in to comment');
      }

      const response = await fetch(`/api/comments/item/${contentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          commentText: text,
          parentCommentId: parentId || null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create comment');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.comments.byContent(contentId || '') 
      });
    }
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) => {
      if (!user?.id) {
        throw new Error('Must be logged in to edit comment');
      }

      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ commentText: text })
      });

      if (!response.ok) {
        throw new Error('Failed to update comment');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.comments.byContent(contentId || '') 
      });
    }
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user?.id) {
        throw new Error('Must be logged in to delete comment');
      }

      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete comment');
      }
    },
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.comments.byContent(contentId || '') 
      });
    }
  });

  // Toggle reaction mutation
  const toggleReactionMutation = useMutation({
    mutationFn: async ({ 
      commentId, 
      reactionType 
    }: { 
      commentId: string; 
      reactionType: 'like' | 'dislike' 
    }) => {
      if (!user?.id) {
        throw new Error('Must be logged in to react');
      }

      // Find current reaction
      const comment = comments.find((c: Comment) => c.id === commentId) ||
        comments.find((c: Comment) => c.replies?.some((r: Comment) => r.id === commentId))?.replies?.find((r: Comment) => r.id === commentId);
      
      const currentReaction = comment?.user_reaction;

      if (currentReaction === reactionType) {
        // Remove reaction
        const response = await fetch(`/api/comments/${commentId}/reactions`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to remove reaction');
        }
      } else {
        // Add or change reaction
        const response = await fetch(`/api/comments/${commentId}/reactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ reactionType })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to add reaction');
        }
      }
    },
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.comments.byContent(contentId || '') 
      });
    }
  });

  const loadMore = useCallback(async () => {
    if (hasNextPage && !isLoading) {
      await fetchNextPage();
    }
  }, [hasNextPage, isLoading, fetchNextPage]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const addComment = useCallback(async (
    text: string,
    parentId?: string | null
  ): Promise<Comment> => {
    return addCommentMutation.mutateAsync({ text, parentId });
  }, [addCommentMutation]);

  const updateComment = useCallback(async (
    commentId: string,
    text: string
  ): Promise<void> => {
    await updateCommentMutation.mutateAsync({ commentId, text });
  }, [updateCommentMutation]);

  const deleteComment = useCallback(async (commentId: string): Promise<void> => {
    await deleteCommentMutation.mutateAsync(commentId);
  }, [deleteCommentMutation]);

  const toggleReaction = useCallback(async (
    commentId: string,
    reactionType: 'like' | 'dislike'
  ): Promise<void> => {
    await toggleReactionMutation.mutateAsync({ commentId, reactionType });
  }, [toggleReactionMutation]);

  return {
    comments,
    loading,
    error: error?.message || null,
    hasMore,
    total,
    page,
    loadMore,
    refresh,
    addComment,
    updateComment,
    deleteComment,
    toggleReaction
  };
}
