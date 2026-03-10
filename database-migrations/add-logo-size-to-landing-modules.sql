-- Add logo size fields to landing_page_modules table
ALTER TABLE landing_page_modules 
ADD COLUMN IF NOT EXISTS logo_width INTEGER,
ADD COLUMN IF NOT EXISTS logo_height INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN landing_page_modules.logo_width IS 'Custom width for logo in pixels (null uses default)';
COMMENT ON COLUMN landing_page_modules.logo_height IS 'Custom height for logo in pixels (null uses default)';
