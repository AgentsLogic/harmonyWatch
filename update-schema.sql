-- Add category_series table
CREATE TABLE IF NOT EXISTS category_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, series_id)
);

-- Enable RLS on the new table
ALTER TABLE category_series ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Enable read access for all users" ON category_series FOR SELECT USING (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_category_series_sort_order ON category_series(sort_order);
