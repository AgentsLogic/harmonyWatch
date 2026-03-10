-- Add short_id column to content_items table for short URLs
-- This allows videos to have URLs like harmony.watch/hsj9kzm

-- Add short_id column (7-character string, unique)
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS short_id TEXT;

-- Create unique index on short_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_short_id ON content_items(short_id) WHERE short_id IS NOT NULL;

-- Generate short IDs for existing content items (7-character alphanumeric lowercase)
-- Uses MD5 hash of UUID + row number to ensure uniqueness
-- Simple approach: use first 7 characters of MD5 hash (lowercase)
DO $$
DECLARE
  content_record RECORD;
  new_short_id TEXT;
  row_num INT := 0;
  hash TEXT;
BEGIN
  FOR content_record IN SELECT id FROM content_items WHERE short_id IS NULL ORDER BY created_at LOOP
    row_num := row_num + 1;
    
    -- Generate hash from UUID + row number to ensure uniqueness
    hash := MD5(content_record.id::text || row_num::text);
    
    -- Take first 7 characters of hash (lowercase, already hex)
    new_short_id := LOWER(SUBSTRING(hash, 1, 7));
    
    -- Ensure uniqueness by checking and regenerating if needed
    WHILE EXISTS (SELECT 1 FROM content_items WHERE short_id = new_short_id) LOOP
      -- Add random component if collision
      hash := MD5(content_record.id::text || row_num::text || RANDOM()::text);
      new_short_id := LOWER(SUBSTRING(hash, 1, 7));
    END LOOP;
    
    UPDATE content_items SET short_id = new_short_id WHERE id = content_record.id;
  END LOOP;
END $$;

