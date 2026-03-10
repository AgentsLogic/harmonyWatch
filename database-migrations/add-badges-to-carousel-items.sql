-- Add badges column to carousel_items table
-- Badges are stored as a TEXT array (TEXT[]) to allow multiple badges per item

ALTER TABLE carousel_items
ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_carousel_items_badges ON carousel_items USING GIN (badges);

-- Add comment
COMMENT ON COLUMN carousel_items.badges IS 'Array of badge text labels to display on carousel items';

