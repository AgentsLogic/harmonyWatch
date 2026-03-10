-- Create mobile_landing_slideshow table for mobile landing page background slideshow images
CREATE TABLE IF NOT EXISTS mobile_landing_slideshow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_mobile_landing_slideshow_sort_order ON mobile_landing_slideshow(sort_order);
CREATE INDEX IF NOT EXISTS idx_mobile_landing_slideshow_is_active ON mobile_landing_slideshow(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE mobile_landing_slideshow ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all users to read active images
CREATE POLICY "Enable read access for all users" ON mobile_landing_slideshow FOR SELECT USING (true);

-- Policy: Only admins can insert
CREATE POLICY "Enable insert for admins" ON mobile_landing_slideshow FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

-- Policy: Only admins can update
CREATE POLICY "Enable update for admins" ON mobile_landing_slideshow FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

-- Policy: Only admins can delete
CREATE POLICY "Enable delete for admins" ON mobile_landing_slideshow FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mobile_landing_slideshow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_mobile_landing_slideshow_updated_at
  BEFORE UPDATE ON mobile_landing_slideshow
  FOR EACH ROW
  EXECUTE FUNCTION update_mobile_landing_slideshow_updated_at();

-- Insert default duration setting in landing_page_content table
INSERT INTO landing_page_content (content_key, title, content) 
VALUES ('mobile_slideshow_duration', 'Mobile Slideshow Duration', '7')
ON CONFLICT (content_key) DO NOTHING;
