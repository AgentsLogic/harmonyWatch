-- Add background_urls column to carousel_items table
-- Stores multiple background URLs that can rotate randomly each day

ALTER TABLE carousel_items
ADD COLUMN IF NOT EXISTS background_urls TEXT[] DEFAULT '{}';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_carousel_items_background_urls ON carousel_items USING GIN (background_urls);

-- Migrate existing background_url to background_urls array if it exists
UPDATE carousel_items
SET background_urls = ARRAY[background_url]
WHERE background_url IS NOT NULL 
  AND (background_urls IS NULL OR array_length(background_urls, 1) IS NULL);

-- Add comment
COMMENT ON COLUMN carousel_items.background_urls IS 'Array of background image URLs that rotate randomly each day';

