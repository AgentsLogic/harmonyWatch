-- Add is_one_off column to series table
ALTER TABLE series
ADD COLUMN IF NOT EXISTS is_one_off BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_series_is_one_off ON series(is_one_off);

-- Update existing series to have is_one_off = false by default
UPDATE series
SET is_one_off = false
WHERE is_one_off IS NULL;





