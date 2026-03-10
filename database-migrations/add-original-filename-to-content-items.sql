-- Add original_filename column to content_items table
ALTER TABLE content_items
ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Create index for better query performance (optional, but useful if we search by filename)
CREATE INDEX IF NOT EXISTS idx_content_items_original_filename ON content_items(original_filename);

