-- Create landing_page_content table for footer content (About Us, Refund Policy, Terms, Privacy, Contact)
CREATE TABLE IF NOT EXISTS landing_page_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key VARCHAR(50) UNIQUE NOT NULL, -- 'about_us', 'refund_policy', 'terms_of_service', 'privacy_policy', 'contact_us'
  title VARCHAR(255) NOT NULL, -- Display title (e.g., "About Us")
  content TEXT NOT NULL, -- HTML or markdown content
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on content_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_landing_page_content_key ON landing_page_content(content_key);

-- Enable Row Level Security
ALTER TABLE landing_page_content ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all users to read content
CREATE POLICY "Enable read access for all users" ON landing_page_content FOR SELECT USING (true);

-- Policy: Only admins can insert
CREATE POLICY "Enable insert for admins" ON landing_page_content FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

-- Policy: Only admins can update
CREATE POLICY "Enable update for admins" ON landing_page_content FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

-- Policy: Only admins can delete
CREATE POLICY "Enable delete for admins" ON landing_page_content FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_landing_page_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_landing_page_content_updated_at
  BEFORE UPDATE ON landing_page_content
  FOR EACH ROW
  EXECUTE FUNCTION update_landing_page_content_updated_at();

-- Insert default content (can be edited later in admin panel)
INSERT INTO landing_page_content (content_key, title, content) VALUES
  ('about_us', 'About Us', 'Welcome to Harmony. We are dedicated to sharing stories and shows rooted in Orthodox Christianity.'),
  ('refund_policy', 'Refund Policy', 'Our refund policy will be detailed here.'),
  ('terms_of_service', 'Terms of Service', 'Our terms of service will be detailed here.'),
  ('privacy_policy', 'Privacy Policy', 'Our privacy policy will be detailed here.'),
  ('contact_us', 'Contact Us', 'For support, please contact us at support@harmony.watch')
ON CONFLICT (content_key) DO NOTHING;
