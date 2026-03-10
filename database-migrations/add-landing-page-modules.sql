-- Landing Page Modules table
-- Stores customizable modules for the landing page (like the "DUST to DUST" box)
CREATE TABLE IF NOT EXISTS landing_page_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  -- Override fields (null means use series data)
  logo_url_override TEXT,
  background_url_override TEXT,
  subtitle_override TEXT,
  -- Hide subtitle completely
  hide_subtitle BOOLEAN DEFAULT FALSE,
  -- Button text override (null means use default "Start Watching >")
  button_text_override TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_landing_page_modules_sort_order ON landing_page_modules(sort_order);
CREATE INDEX IF NOT EXISTS idx_landing_page_modules_series_id ON landing_page_modules(series_id);

-- Enable Row Level Security (RLS)
ALTER TABLE landing_page_modules ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Enable read access for all users" ON landing_page_modules FOR SELECT USING (true);

-- Create policies for admin write access
CREATE POLICY "Enable insert for admins" ON landing_page_modules FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Enable update for admins" ON landing_page_modules FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Enable delete for admins" ON landing_page_modules FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.user_id = auth.uid() 
      AND user_profiles.user_type = 'admin'
    )
  );
