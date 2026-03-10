"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useComments } from "../../lib/hooks/useComments";
import { useUser } from "../contexts/user-context";
import type { Comment } from "../../lib/services/comments";

interface CommentsSectionProps {
  contentId: string | null;
  onDragStateChange?: (isDragging: boolean, dragY: number) => void;
}

// Format timestamp to relative time
function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
}

// Get avatar URL or default
function getAvatarUrl(comment: Comment): string {
  if (comment.user?.avatar_url) {
    return comment.user.avatar_url;
  }
  return "/images/content-1.png"; // Default avatar
}

// Get display name
function getDisplayName(comment: Comment): string {
  return comment.user?.display_name || "Anonymous";
}

interface CommentItemProps {
  comment: Comment;
  onReply: (parentId: string) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string) => void;
  onDislike: (commentId: string) => void;
  currentUserId: string | null;
  isAdmin: boolean;
  isCollapsed?: boolean; // If true, show collapsed view (mobile only)
  onExpand?: () => void; // Callback when collapsed comment is clicked
}

function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  onLike,
  onDislike,
  currentUserId,
  isAdmin,
  isCollapsed = false,
  onExpand
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<Comment[]>(comment.replies || []);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment_text);
  const [formattedTimestamp, setFormattedTimestamp] = useState<string>("");
  const isOwner = currentUserId === comment.user_id;

  // Format timestamp on client side only to prevent hydration mismatch
  useEffect(() => {
    setFormattedTimestamp(formatTimestamp(comment.created_at));
  }, [comment.created_at]);

  const loadReplies = async () => {
    if (replies.length > 0) {
      setShowReplies(!showReplies);
      return;
    }

    setLoadingReplies(true);
    try {
      // For now, replies are loaded on-demand. In a full implementation,
      // we'd fetch replies via API. For simplicity, we'll show existing replies.
      if (comment.replies && comment.replies.length > 0) {
        setReplies(comment.replies);
      }
      setShowReplies(true);
    } catch (error) {
      console.error("Error loading replies:", error);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      const response = await fetch(`/api/comments/item/${comment.content_item_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          commentText: replyText.trim(),
          parentCommentId: comment.id
        })
      });

      if (!response.ok) {
        throw new Error("Failed to submit reply");
      }

      const newReply = await response.json();
      setReplies([...replies, newReply]);
      setReplyText("");
      setReplying(false);
      setShowReplies(true);
    } catch (error) {
      console.error("Error submitting reply:", error);
      alert("Failed to submit reply");
    }
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || editText === comment.comment_text) {
      setEditing(false);
      return;
    }

    try {
      const response = await fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ commentText: editText.trim() })
      });

      if (!response.ok) throw new Error("Failed to update comment");

      // Refresh the comment
      const updated = await response.json();
      setEditing(false);
      // Parent component will handle the update via refresh
    } catch (error) {
      console.error("Error updating comment:", error);
      alert("Failed to update comment");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
      await onDelete(comment.id);
    } catch (error) {
      console.error("Error deleting comment:", error);
      alert("Failed to delete comment");
    }
  };

  // Collapsed view (mobile only) - show only avatar and 2 lines of text
  if (isCollapsed && onExpand) {
    return (
      <div 
        className="flex gap-3 cursor-pointer sm:cursor-default"
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
          <Image
            src={getAvatarUrl(comment)}
            alt={getDisplayName(comment)}
            width={40}
            height={40}
            className="w-full h-full object-cover"
            unoptimized
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              if (target.parentElement) {
                target.parentElement.innerHTML = `
                  <div class="w-full h-full bg-gray-600 flex items-center justify-center">
                    <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                `;
              }
            }}
          />
        </div>

        {/* Comment Text - Only 2 lines */}
        <div className="flex-1">
          <p className="text-white line-clamp-2 leading-relaxed">{comment.comment_text}</p>
        </div>
      </div>
    );
  }

  // Expanded view (desktop or expanded overlay)
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
        <Image
          src={getAvatarUrl(comment)}
          alt={getDisplayName(comment)}
          width={40}
          height={40}
          className="w-full h-full object-cover"
          unoptimized
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.parentElement) {
              target.parentElement.innerHTML = `
                <div class="w-full h-full bg-gray-600 flex items-center justify-center">
                  <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
              `;
            }
          }}
        />
      </div>

      {/* Comment Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-white">{getDisplayName(comment)}</span>
          {formattedTimestamp && (
            <span className="text-gray-400 text-sm">{formattedTimestamp}</span>
          )}
          {comment.is_edited && (
            <span className="text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">Edited</span>
          )}
        </div>

        {editing ? (
          <div className="mb-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-[#252525] text-white rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditText(comment.comment_text);
                }}
                className="px-4 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-white mb-2">{comment.comment_text}</p>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          {/* Like/Dislike Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onLike(comment.id)}
              className={`flex items-center gap-1 transition-colors ${
                comment.user_reaction === 'like'
                  ? 'text-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
              </svg>
              <span className="text-sm">{comment.likes_count}</span>
            </button>

            <button
              onClick={() => onDislike(comment.id)}
              className={`flex items-center gap-1 transition-colors ${
                comment.user_reaction === 'dislike'
                  ? 'text-red-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 rotate-180" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
              </svg>
              <span className="text-sm">{comment.dislikes_count}</span>
            </button>
          </div>

          {/* Reply Button */}
          {currentUserId && (
            <button
              onClick={() => {
                setReplying(!replying);
                if (!replying) setShowReplies(true);
              }}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Reply
            </button>
          )}

          {/* Edit/Delete Buttons (Owner only) */}
          {isOwner && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="text-gray-400 hover:text-red-500 transition-colors text-sm"
              >
                Delete
              </button>
            </>
          )}

          {/* Show Replies Button */}
          {comment.replies && comment.replies.length > 0 && (
            <button
              onClick={loadReplies}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              {showReplies ? "Hide" : "Show"} {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>

        {/* Reply Input */}
        {replying && currentUserId && (
          <form onSubmit={handleSubmitReply} className="mt-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-[#252525] text-white placeholder-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Post
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplying(false);
                  setReplyText("");
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Replies */}
        {showReplies && (
          <div className="mt-4 ml-8 space-y-4 border-l-2 border-gray-700 pl-4">
            {loadingReplies ? (
              <div className="text-gray-400 text-sm">Loading replies...</div>
            ) : replies.length > 0 ? (
              replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  onReply={onReply}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onLike={onLike}
                  onDislike={onDislike}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              ))
            ) : (
              <div className="text-gray-400 text-sm">No replies yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentsSection({ contentId, onDragStateChange }: CommentsSectionProps) {
  const { user } = useUser();
  const {
    comments,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    addComment,
    updateComment,
    deleteComment,
    toggleReaction
  } = useComments({ contentId, autoLoad: !!contentId });

  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  
  // Expanded overlay state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] = useState(false);
  
  // Drag state for overlay
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingToDismiss, setIsDraggingToDismiss] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const dragStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const touchStartedInHandleRef = useRef<boolean>(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const justExpandedRef = useRef<boolean>(false);
  
  // Touch tracking for container tap vs scroll detection
  const containerTouchStartYRef = useRef<number | null>(null);
  const containerTouchStartTimeRef = useRef<number | null>(null);
  const containerTouchMovedRef = useRef<boolean>(false);
  
  const verticalThreshold = 20;
  
  // Check if mobile
  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, loadMore]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setSubmitting(true);
    try {
      await addComment(newComment.trim());
      setNewComment("");
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("Failed to submit comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!user) {
      alert("Please log in to like comments");
      return;
    }
    try {
      await toggleReaction(commentId, "like");
    } catch (error) {
      console.error("Error liking comment:", error);
    }
  };

  const handleDislike = async (commentId: string) => {
    if (!user) {
      alert("Please log in to dislike comments");
      return;
    }
    try {
      await toggleReaction(commentId, "dislike");
    } catch (error) {
      console.error("Error disliking comment:", error);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
    } catch (error) {
      console.error("Error deleting comment:", error);
      throw error;
    }
  };

  const handleEdit = async (comment: Comment) => {
    // Edit is handled within CommentItem component
  };

  const handleReply = (parentId: string) => {
    // Reply is handled within CommentItem component
  };

  // Drag handlers for overlay - only from top handle area
  const handleAreaRef = useRef<HTMLDivElement>(null);
  
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isExpanded || !isMobile) return;
    
    // Since this handler is attached to the handle area div, any touch here should start dragging
    // Just verify the target is within the handle area (or the handle area itself)
    const target = e.target as HTMLElement;
    const touch = e.touches[0];
    
    // Check if touch is within the handle area div
    const isInHandleArea = handleAreaRef.current && (
      handleAreaRef.current === target || 
      handleAreaRef.current.contains(target)
    );
    
    if (!isInHandleArea) {
      return; // Don't start drag if not in handle area
    }
    
    // Store whether touch started in handle area
    touchStartedInHandleRef.current = true;
    dragStartYRef.current = touch.clientY;
    touchStartTimeRef.current = Date.now();
    setIsDragging(true);
    setIsScrolling(false);
    setIsDraggingToDismiss(false);
    setDragY(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isExpanded || dragStartYRef.current === null) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragStartYRef.current;
    const absDeltaY = Math.abs(deltaY);
    
    // If touch started in handle area, always allow drag-to-dismiss (even when scrolled)
    // Otherwise, only allow if at top of scroll
    const isAtTop = overlayRef.current && overlayRef.current.scrollTop === 0;
    const canDragToDismiss = touchStartedInHandleRef.current || isAtTop;
    
    // Check if scrolling within overlay content (but allow drag-to-dismiss if started in handle)
    if (overlayRef.current && overlayRef.current.scrollTop > 0 && !touchStartedInHandleRef.current) {
      // User is scrolling content, not dragging to dismiss
      setIsScrolling(true);
      return;
    }
    
    // Only allow drag-to-dismiss if dragging down from top or if started in handle area
    if (deltaY > 0 && absDeltaY >= 5 && canDragToDismiss) {
      setIsDraggingToDismiss(true);
      setIsScrolling(false);
      e.preventDefault();
      e.stopPropagation();
      
      // Constrain drag to only downward movement
      const newDragY = Math.max(0, deltaY);
      setDragY(newDragY);
      
      // Notify parent of drag state
      if (onDragStateChange) {
        onDragStateChange(true, newDragY);
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || !isExpanded) return;
    e.stopPropagation();
    
    if (isScrolling && !isDraggingToDismiss) {
      dragStartYRef.current = null;
      touchStartTimeRef.current = null;
      setIsDragging(false);
      setIsScrolling(false);
      return;
    }
    
    const windowHeight = window.innerHeight;
    const verticalDragPercentage = (dragY / windowHeight) * 100;
    const minVerticalDragPercentage = 20;
    
    // Calculate velocity
    const MIN_VELOCITY = 0.5;
    const MIN_VELOCITY_DISTANCE = 50;
    let verticalVelocity = 0;
    let timeDelta = 0;
    
    if (touchStartTimeRef.current !== null) {
      timeDelta = Date.now() - touchStartTimeRef.current;
      if (timeDelta > 0) {
        verticalVelocity = dragY / timeDelta;
      }
    }
    
    const meetsVelocityThreshold = verticalVelocity >= MIN_VELOCITY && dragY >= MIN_VELOCITY_DISTANCE;
    const meetsDistanceThreshold = verticalDragPercentage >= minVerticalDragPercentage;
    
    if (meetsVelocityThreshold || meetsDistanceThreshold) {
      // Animate overlay fully downward before closing
      closeOverlayWithAnimation();
      // Notify parent that dragging stopped
      if (onDragStateChange) {
        onDragStateChange(false, 0);
      }
    } else {
      // Snap back
      setDragY(0);
      // Notify parent that dragging stopped
      if (onDragStateChange) {
        onDragStateChange(false, 0);
      }
    }
    
    // Reset states
    setTimeout(() => {
      dragStartYRef.current = null;
      touchStartTimeRef.current = null;
      touchStartedInHandleRef.current = false;
      setIsDragging(false);
      setIsDraggingToDismiss(false);
      setIsScrolling(false);
    }, 300);
  };

  // Reset opening state when overlay closes
  useEffect(() => {
    if (!isExpanded && !isClosing) {
      setIsOpening(false);
      setIsOpeningAnimationComplete(false);
      justExpandedRef.current = false;
    }
  }, [isExpanded, isClosing]);
  
  // Notify parent of drag state changes
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(isDraggingToDismiss, dragY);
    }
  }, [isDraggingToDismiss, dragY, onDragStateChange]);
  
  // Reset drag state when overlay closes
  useEffect(() => {
    if (!isExpanded && !isClosing) {
      setDragY(0);
      setIsDragging(false);
      setIsDraggingToDismiss(false);
      setIsScrolling(false);
      setIsClosing(false);
      dragStartYRef.current = null;
      touchStartTimeRef.current = null;
      touchStartedInHandleRef.current = false;
      if (onDragStateChange) {
        onDragStateChange(false, 0);
      }
    }
  }, [isExpanded, isClosing, onDragStateChange]);

  if (!contentId) {
    return null;
  }

  // Calculate video player height (16:9 aspect ratio + 60px status bar)
  const videoPlayerTop = 60; // Status bar gap
  const videoPlayerHeight = typeof window !== 'undefined' ? window.innerWidth * (9 / 16) : 0;
  const videoPlayerBottom = videoPlayerTop + videoPlayerHeight;
  
  // Helper function to close overlay with animation
  const closeOverlayWithAnimation = () => {
    if (!isExpanded || isClosing) return;
    
    setIsClosing(true);
    setIsDragging(false);
    setIsDraggingToDismiss(false);
    
    // Calculate full height to animate to bottom
    const overlayHeight = typeof window !== 'undefined' ? window.innerHeight - videoPlayerBottom : 0;
    setDragY(overlayHeight);
    
    // After animation completes, close the overlay
    setTimeout(() => {
      setIsExpanded(false);
      setIsClosing(false);
      setDragY(0);
    }, 300); // Match transition duration
  };
  
  // Calculate overlay transform
  // When first opening, start from bottom (translateY(100%))
  // When dragging, add dragY
  // When closing, animate to bottom
  const baseTransform = isExpanded || isClosing 
    ? (isDraggingToDismiss || isClosing ? `translateY(${dragY}px)` : isOpening ? 'translateY(100%)' : 'translateY(0)') 
    : 'translateY(100%)';
  const overlayTransform = baseTransform;
  const overlayOpacity = 1; // Keep background at full opacity during drag
  
  // Comment box stays visible during drag, transitions down when closing

  // Get featured comment for collapsed view: most upvoted, or most recent if no upvotes
  const featuredComment = useMemo(() => {
    if (comments.length === 0) return null;
    
    // Find comment with highest likes_count
    const mostUpvoted = comments.reduce((prev, current) => {
      return (current.likes_count > prev.likes_count) ? current : prev;
    });
    
    // If the most upvoted has 0 likes, use most recent instead
    if (mostUpvoted.likes_count === 0) {
      // Sort by created_at descending (most recent first)
      const sortedByDate = [...comments].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return sortedByDate[0];
    }
    
    return mostUpvoted;
  }, [comments]);

  // Function to expand overlay - extracted for reuse
  const expandOverlay = () => {
    // Set opening state first, then expand
    setIsOpening(true);
    setIsOpeningAnimationComplete(false);
    setIsExpanded(true);
    // After render, animate up
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsOpening(false);
        // Keep backdrop transparent until animation completes
        setTimeout(() => {
          setIsOpeningAnimationComplete(true);
        }, 300); // Match animation duration
      });
    });
  };

  // Handle touch start on container (mobile only, when collapsed)
  const handleContainerTouchStart = (e: React.TouchEvent) => {
    // Only handle on mobile when in collapsed view
    if (!isMobile || isExpanded || isOpening || isClosing) return;
    
    // Don't trigger if touching interactive elements (buttons, inputs, etc.)
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('form')
    ) {
      return;
    }
    
    // Track touch start position and time
    const touch = e.touches[0];
    containerTouchStartYRef.current = touch.clientY;
    containerTouchStartTimeRef.current = Date.now();
    containerTouchMovedRef.current = false;
  };

  // Handle touch move on container - detect scrolling
  const handleContainerTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || isExpanded || isOpening || isClosing) return;
    if (containerTouchStartYRef.current === null) return;
    
    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - containerTouchStartYRef.current);
    
    // If moved more than 10px, consider it a scroll, not a tap
    if (deltaY > 10) {
      containerTouchMovedRef.current = true;
    }
  };

  // Handle touch end on container - only expand if it was a tap (not a scroll)
  const handleContainerTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || isExpanded || isOpening || isClosing) return;
    if (containerTouchStartYRef.current === null || containerTouchStartTimeRef.current === null) return;
    
    // Don't trigger if touching interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('form')
    ) {
      // Reset tracking
      containerTouchStartYRef.current = null;
      containerTouchStartTimeRef.current = null;
      containerTouchMovedRef.current = false;
      return;
    }
    
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - containerTouchStartTimeRef.current;
    const touch = e.changedTouches[0];
    const deltaY = Math.abs(touch.clientY - containerTouchStartYRef.current);
    
    // Only expand if:
    // 1. Touch didn't move much (less than 10px) - indicates tap, not scroll
    // 2. Touch was quick (less than 300ms) - indicates tap, not long press
    // 3. User didn't scroll (containerTouchMovedRef is false)
    const isTap = !containerTouchMovedRef.current && deltaY < 10 && touchDuration < 300;
    
    if (isTap) {
      expandOverlay();
    }
    
    // Reset tracking
    containerTouchStartYRef.current = null;
    containerTouchStartTimeRef.current = null;
    containerTouchMovedRef.current = false;
  };

  // Handle click on container (desktop/fallback)
  const handleContainerClick = (e: React.MouseEvent) => {
    // Only handle on desktop (not mobile, mobile uses touch handlers)
    if (isMobile) return;
    
    // Don't trigger if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('form')
    ) {
      return;
    }
    
    // On desktop, just expand (no scroll detection needed)
    expandOverlay();
  };

  if (!contentId) {
    return null;
  }

  return (
    <>
      <div 
        className="mb-8"
        onClick={handleContainerClick}
        onTouchStart={handleContainerTouchStart}
        onTouchMove={handleContainerTouchMove}
        onTouchEnd={handleContainerTouchEnd}
        style={{
          cursor: isMobile && !isExpanded && !isOpening && !isClosing ? 'pointer' : 'default'
        }}
      >
        {/* Add Comment Input - Only show on desktop (never show in mobile collapsed view) */}
        {user && !isMobile && (
          <form onSubmit={handleSubmitComment} className="mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                {user.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt={user.display_name || "You"}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover rounded-full"
                    unoptimized
                  />
                ) : (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                )}
              </div>
              <input
                type="text"
                placeholder="Add comment"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={submitting}
                className="flex-1 bg-[#252525] text-white placeholder-gray-300 focus:outline-none rounded-full px-4 py-3 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="h-12 px-4 rounded-full bg-[#252525] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </form>
        )}

        {/* Comments List - Collapsed view on mobile (shows only featured comment), full view on desktop */}
        {loading && comments.length === 0 ? (
          <div className="bg-[#1a1a1a] sm:bg-transparent rounded-lg sm:rounded-none p-4 sm:p-0">
            <div className="text-gray-400 text-center py-8">Loading comments...</div>
          </div>
        ) : error ? (
          <div className="bg-[#1a1a1a] sm:bg-transparent rounded-lg sm:rounded-none p-4 sm:p-0">
            <div className="text-red-400 text-center py-8">{error}</div>
          </div>
        ) : comments.length === 0 ? (
          <div className="bg-[#1a1a1a] sm:bg-transparent rounded-lg sm:rounded-none p-4 sm:p-0">
            <div className="text-gray-400 text-center py-8">No comments yet. Be the first to comment!</div>
          </div>
        ) : (
          <div className="bg-[#1a1a1a] sm:bg-transparent rounded-lg sm:rounded-none p-4 sm:p-0">
            {/* Comments Heading - Top Left */}
            <h2 className="text-white font-bold text-lg mb-4 sm:mb-0 sm:hidden">
              Comments {comments.length}
            </h2>
            <div className="space-y-4">
              {/* On mobile collapsed view: show only featured comment, on desktop or expanded: show all */}
              {/* Also show collapsed view when dragging to dismiss or closing, since overlay is transparent */}
              {(isMobile && (!isExpanded || isDraggingToDismiss || isClosing || isOpening || !isOpeningAnimationComplete) && featuredComment) ? (
                <CommentItem
                  key={featuredComment.id}
                  comment={featuredComment}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  currentUserId={user?.id || null}
                  isAdmin={user?.user_type === 'admin'}
                  isCollapsed={true}
                  onExpand={expandOverlay}
                />
              ) : (
                comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    onReply={handleReply}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    currentUserId={user?.id || null}
                    isAdmin={user?.user_type === 'admin'}
                    isCollapsed={false}
                  />
                ))
              )}

              {/* Infinite scroll trigger - only show in expanded/desktop view */}
              {hasMore && (!isMobile || isExpanded) && (
                <div ref={observerTarget} className="h-10 flex items-center justify-center">
                  {loading && <div className="text-gray-400 text-sm">Loading more...</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expanded Comment Overlay - Mobile only */}
      {/* Render via portal to escape modal stacking context - Z-index [200] ensures it's above video player [105-106] and modal [100] */}
      {mounted && isMobile && (isExpanded || isClosing || isOpening) && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200]"
          style={{
            opacity: overlayOpacity,
            transition: isDragging ? 'none' : 'opacity 0.3s ease-out',
          }}
        >
          {/* Backdrop - only covers area below video player */}
          <div 
            className="absolute left-0 right-0"
            onClick={closeOverlayWithAnimation}
            style={{ 
              pointerEvents: (isDraggingToDismiss || isClosing || isOpening || !isOpeningAnimationComplete) ? 'none' : 'auto',
              top: `${videoPlayerBottom}px`,
              bottom: 0,
              backgroundColor: (isDraggingToDismiss || isClosing || isOpening || !isOpeningAnimationComplete) ? 'transparent' : 'rgba(15, 15, 15, 0.95)',
              transition: 'none',
            }}
          />
          
          {/* Overlay Panel - starts from video player bottom */}
          <div
            className="absolute left-0 right-0 rounded-t-2xl shadow-2xl bg-[#0f0f0f]"
            style={{
              top: `${videoPlayerBottom}px`,
              bottom: 0,
              transform: overlayTransform,
              transition: (isDragging && !isClosing && !isOpening) ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              maxHeight: `calc(100vh - ${videoPlayerBottom}px)`,
              height: `calc(100vh - ${videoPlayerBottom}px)`,
            }}
          >
            {/* Drag Handle Area */}
            <div
              ref={handleAreaRef}
              className="absolute top-0 left-0 right-0 h-16 z-20 cursor-grab active:cursor-grabbing"
              style={{
                touchAction: 'none', // Prevent default touch behaviors like scrolling
                userSelect: 'none', // Prevent text selection
                WebkitUserSelect: 'none',
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div 
                className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/30 rounded-full"
                style={{
                  pointerEvents: 'none', // Allow touches to pass through to parent
                }}
              />
            </div>
            
            {/* Overlay Content */}
            <div
              ref={overlayRef}
              className="h-full pt-0 overflow-y-auto"
              style={{ 
                touchAction: isDraggingToDismiss ? 'none' : 'pan-y',
                paddingBottom: '80px', // Space for add-comment box
              }}
            >
              <div className="px-4">
                {/* Comments Heading */}
                <h2 
                  className="text-white font-bold text-lg mb-4 sticky top-0 py-2 z-10"
                  style={{
                    backgroundColor: '#0f0f0f',
                    marginLeft: '-1rem',
                    marginRight: '-1rem',
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                    marginTop: '-2rem',
                    paddingTop: '2rem',
                  }}
                >
                  Comments
                </h2>
              
                {/* Comments List - Full expanded view */}
                {loading && comments.length === 0 ? (
                  <div className="text-gray-400 text-center py-8">Loading comments...</div>
                ) : error ? (
                  <div className="text-red-400 text-center py-8">{error}</div>
                ) : comments.length === 0 ? (
                  <div className="text-gray-400 text-center py-8">No comments yet. Be the first to comment!</div>
                ) : (
                  <div className="space-y-4 pt-[31px]">
                    {comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        onReply={handleReply}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onLike={handleLike}
                        onDislike={handleDislike}
                        currentUserId={user?.id || null}
                        isAdmin={user?.user_type === 'admin'}
                        isCollapsed={false}
                      />
                    ))}

                    {/* Infinite scroll trigger */}
                    {hasMore && (
                      <div ref={observerTarget} className="h-10 flex items-center justify-center">
                        {loading && <div className="text-gray-400 text-sm">Loading more...</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Add Comment Box - Fixed at bottom, transitions up when opening, down when closing */}
          {user && (isExpanded || isClosing) && (
            <div 
              className="fixed left-0 right-0 bottom-0 bg-[#0f0f0f] border-t border-gray-800 p-4 z-[201]"
              style={{
                // Start from bottom when opening, then animate to top
                // Transition downward with panel when closing
                transform: isClosing ? `translateY(${dragY}px)` : isOpening ? 'translateY(100%)' : 'translateY(0)',
                transition: (isOpening || isClosing) ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                // Add padding for Android navigation bar
                paddingBottom: `calc(1rem + env(safe-area-inset-bottom, 0px))`,
              }}
            >
              <form onSubmit={handleSubmitComment}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    {user.avatar_url ? (
                      <Image
                        src={user.avatar_url}
                        alt={user.display_name || "You"}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover rounded-full"
                        unoptimized
                      />
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Add comment"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    disabled={submitting}
                    className="flex-1 bg-[#252525] text-white placeholder-gray-300 focus:outline-none rounded-full px-4 py-3 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    className="h-12 px-4 rounded-full bg-[#252525] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
