-- Landing Page Series table
-- Stores which series should be featured on the landing page
CREATE TABLE IF NOT EXISTS landing_page_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(series_id)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_landing_page_series_sort_order ON landing_page_series(sort_order);
CREATE INDEX IF NOT EXISTS idx_landing_page_series_series_id ON landing_page_series(series_id);

-- Enable Row Level Security (RLS)
ALTER TABLE landing_page_series ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Enable read access for all users" ON landing_page_series FOR SELECT USING (true);

-- Create policies for admin write access
CREATE POLICY "Enable insert for admins" ON landing_page_series FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Enable update for admins" ON landing_page_series FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Enable delete for admins" ON landing_page_series FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );













