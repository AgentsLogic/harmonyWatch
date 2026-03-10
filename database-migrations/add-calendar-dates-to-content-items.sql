-- Add calendar date fields to content_items table
ALTER TABLE content_items
ADD COLUMN IF NOT EXISTS new_calendar_date DATE,
ADD COLUMN IF NOT EXISTS old_calendar_date DATE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_content_items_new_calendar_date ON content_items(new_calendar_date);
CREATE INDEX IF NOT EXISTS idx_content_items_old_calendar_date ON content_items(old_calendar_date);

