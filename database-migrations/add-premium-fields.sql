-- Add premium fields to series and content_items tables
-- This allows admins to mark series as premium (paid-only) or free
-- And mark specific episodes in premium series as free

-- Add is_premium column to series table (default TRUE - premium by default)
ALTER TABLE series
ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT TRUE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_series_is_premium ON series(is_premium);

-- Add is_free_episode column to content_items table (default FALSE - follows series)
ALTER TABLE content_items
ADD COLUMN IF NOT EXISTS is_free_episode BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_content_items_is_free_episode ON content_items(is_free_episode);

-- Update existing series to be premium by default (if they don't have the field set)
-- This ensures backward compatibility
UPDATE series
SET is_premium = TRUE
WHERE is_premium IS NULL;

-- Update existing content_items to follow series premium status by default
UPDATE content_items
SET is_free_episode = FALSE
WHERE is_free_episode IS NULL;

