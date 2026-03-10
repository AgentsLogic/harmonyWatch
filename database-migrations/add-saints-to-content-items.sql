-- Add saints JSONB column to content_items table
-- Saints will be stored as an array of objects with name, picture_url, and biography
ALTER TABLE content_items
ADD COLUMN IF NOT EXISTS saints JSONB DEFAULT '[]'::jsonb;

-- Create index for better query performance (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_content_items_saints ON content_items USING GIN (saints);

-- Add comment to document the structure
COMMENT ON COLUMN content_items.saints IS 'Array of saint objects: [{"name": "string", "picture_url": "string", "biography": "string"}]';

