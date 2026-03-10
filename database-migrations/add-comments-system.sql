-- Comments System Migration
-- This script creates the comments and comment_reactions tables with proper indexes and triggers

-- Step 1: Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0 NOT NULL,
  dislikes_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  is_edited BOOLEAN DEFAULT FALSE NOT NULL
);

-- Step 2: Create indexes for comments table
CREATE INDEX IF NOT EXISTS idx_comments_content_item_id ON comments(content_item_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_likes_count ON comments(likes_count DESC);
CREATE INDEX IF NOT EXISTS idx_comments_deleted_at ON comments(deleted_at) WHERE deleted_at IS NULL;

-- Step 3: Create comment_reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(comment_id, user_id)
);

-- Step 4: Create indexes for comment_reactions table
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id ON comment_reactions(user_id);

-- Step 5: Create function to update comments_count in content_items
CREATE OR REPLACE FUNCTION update_content_items_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment count when comment is added
    UPDATE content_items
    SET comments_count = comments_count + 1
    WHERE id = NEW.content_item_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle soft delete
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      -- Comment was soft deleted, decrement count
      UPDATE content_items
      SET comments_count = GREATEST(0, comments_count - 1)
      WHERE id = NEW.content_item_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      -- Comment was restored, increment count
      UPDATE content_items
      SET comments_count = comments_count + 1
      WHERE id = NEW.content_item_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement count when comment is hard deleted
    UPDATE content_items
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.content_item_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to update comments_count
DROP TRIGGER IF EXISTS trigger_update_comments_count ON comments;
CREATE TRIGGER trigger_update_comments_count
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_content_items_comments_count();

-- Step 7: Create function to update likes/dislikes counts
CREATE OR REPLACE FUNCTION update_comment_reaction_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment appropriate count
    IF NEW.reaction_type = 'like' THEN
      UPDATE comments
      SET likes_count = likes_count + 1
      WHERE id = NEW.comment_id;
    ELSIF NEW.reaction_type = 'dislike' THEN
      UPDATE comments
      SET dislikes_count = dislikes_count + 1
      WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle reaction type change
    IF OLD.reaction_type = 'like' AND NEW.reaction_type = 'dislike' THEN
      UPDATE comments
      SET likes_count = GREATEST(0, likes_count - 1),
          dislikes_count = dislikes_count + 1
      WHERE id = NEW.comment_id;
    ELSIF OLD.reaction_type = 'dislike' AND NEW.reaction_type = 'like' THEN
      UPDATE comments
      SET dislikes_count = GREATEST(0, dislikes_count - 1),
          likes_count = likes_count + 1
      WHERE id = NEW.comment_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement appropriate count
    IF OLD.reaction_type = 'like' THEN
      UPDATE comments
      SET likes_count = GREATEST(0, likes_count - 1)
      WHERE id = OLD.comment_id;
    ELSIF OLD.reaction_type = 'dislike' THEN
      UPDATE comments
      SET dislikes_count = GREATEST(0, dislikes_count - 1)
      WHERE id = OLD.comment_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to update reaction counts
DROP TRIGGER IF EXISTS trigger_update_reaction_counts ON comment_reactions;
CREATE TRIGGER trigger_update_reaction_counts
  AFTER INSERT OR UPDATE OR DELETE ON comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_reaction_counts();

-- Step 9: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create trigger to update updated_at
DROP TRIGGER IF EXISTS trigger_update_comments_updated_at ON comments;
CREATE TRIGGER trigger_update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 11: Enable Row Level Security
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Step 12: Create RLS policies for comments
-- Public read access (excluding deleted comments)
CREATE POLICY "Enable read access for all users" ON comments
  FOR SELECT
  USING (deleted_at IS NULL);

-- Users can insert their own comments
CREATE POLICY "Enable insert for authenticated users" ON comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Enable update for comment owners" ON comments
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- Users can soft delete their own comments, admins can delete any
CREATE POLICY "Enable delete for comment owners and admins" ON comments
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.user_type = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.user_type = 'admin'
    )
  );

-- Step 13: Create RLS policies for comment_reactions
-- Public read access
CREATE POLICY "Enable read access for all users" ON comment_reactions
  FOR SELECT
  USING (true);

-- Users can insert their own reactions
CREATE POLICY "Enable insert for authenticated users" ON comment_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own reactions
CREATE POLICY "Enable update for reaction owners" ON comment_reactions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
CREATE POLICY "Enable delete for reaction owners" ON comment_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Step 14: Initialize comments_count for existing content_items (if needed)
-- This ensures existing content items have accurate counts
UPDATE content_items
SET comments_count = (
  SELECT COUNT(*)
  FROM comments
  WHERE comments.content_item_id = content_items.id
  AND comments.deleted_at IS NULL
);

