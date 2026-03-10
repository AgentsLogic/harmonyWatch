-- Add auto_badge_enabled column to carousel_items table
-- When enabled for daily series, automatically adds "Today's reading (date)" badge

ALTER TABLE carousel_items
ADD COLUMN IF NOT EXISTS auto_badge_enabled BOOLEAN DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_carousel_items_auto_badge ON carousel_items(auto_badge_enabled);

-- Add comment
COMMENT ON COLUMN carousel_items.auto_badge_enabled IS 'When true and series is daily content, automatically adds a "Today''s reading" badge with the current date';

