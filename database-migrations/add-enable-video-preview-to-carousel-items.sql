-- Add enable_video_preview column to carousel_items table
-- When enabled, the carousel will show a video preview for this item

ALTER TABLE carousel_items
ADD COLUMN IF NOT EXISTS enable_video_preview BOOLEAN DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_carousel_items_enable_video_preview ON carousel_items(enable_video_preview);

-- Add comment
COMMENT ON COLUMN carousel_items.enable_video_preview IS 'When true, enables video preview for this carousel item (only for first item with video content)';

