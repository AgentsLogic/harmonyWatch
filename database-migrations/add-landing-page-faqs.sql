-- Landing Page FAQs table
-- Stores frequently asked questions and answers for the landing page
CREATE TABLE IF NOT EXISTS landing_page_faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_landing_page_faqs_sort_order ON landing_page_faqs(sort_order);

-- Enable Row Level Security (RLS)
ALTER TABLE landing_page_faqs ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Enable read access for all users" ON landing_page_faqs FOR SELECT USING (true);

-- Create policies for admin write access
CREATE POLICY "Enable insert for admins" ON landing_page_faqs FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Enable update for admins" ON landing_page_faqs FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Enable delete for admins" ON landing_page_faqs FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );
