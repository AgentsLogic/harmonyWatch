-- Create carousel_items table
CREATE TABLE IF NOT EXISTS carousel_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  logo_url TEXT,
  subtitle TEXT,
  background_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_carousel_items_sort_order ON carousel_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_carousel_items_series_id ON carousel_items(series_id);
CREATE INDEX IF NOT EXISTS idx_carousel_items_is_active ON carousel_items(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE carousel_items ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Public read access for active items
CREATE POLICY "Enable read access for active carousel items" 
  ON carousel_items 
  FOR SELECT 
  USING (is_active = true);

-- Admin-only write access
CREATE POLICY "Enable admin write access for carousel items" 
  ON carousel_items 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.user_type = 'admin'
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_carousel_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_carousel_items_updated_at
  BEFORE UPDATE ON carousel_items
  FOR EACH ROW
  EXECUTE FUNCTION update_carousel_items_updated_at();

