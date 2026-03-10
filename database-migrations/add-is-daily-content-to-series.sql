-- Add is_daily_content column to series table
ALTER TABLE series
ADD COLUMN IF NOT EXISTS is_daily_content BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_series_is_daily_content ON series(is_daily_content);

-- Update existing series to have is_daily_content = false by default
UPDATE series
SET is_daily_content = false
WHERE is_daily_content IS NULL;

