-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content Items table
CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  content_url TEXT,
  content_type TEXT CHECK (content_type IN ('video', 'audio')) DEFAULT 'video',
  rating TEXT CHECK (rating IN ('G', 'PG', 'PG-13', 'R', 'NR')) DEFAULT 'PG',
  tags TEXT[],
  duration TEXT,
  visibility TEXT CHECK (visibility IN ('public', 'unlisted', 'private')) DEFAULT 'public',
  monetization BOOLEAN DEFAULT FALSE,
  restrictions TEXT,
  views INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Series table
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  banner_url TEXT,
  rating TEXT CHECK (rating IN ('G', 'PG', 'PG-13', 'R', 'NR')) DEFAULT 'PG',
  tags TEXT[],
  episodes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Category-Content relationship table
CREATE TABLE IF NOT EXISTS category_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, content_item_id)
);

-- Category-Series relationship table
CREATE TABLE IF NOT EXISTS category_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, series_id)
);

-- Series-Episode relationship table
CREATE TABLE IF NOT EXISTS series_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  episode_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(series_id, content_item_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_content_items_created_at ON content_items(created_at);
CREATE INDEX IF NOT EXISTS idx_category_content_sort_order ON category_content(sort_order);
CREATE INDEX IF NOT EXISTS idx_series_episodes_episode_number ON series_episodes(episode_number);

-- Enable Row Level Security (RLS)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_episodes ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (adjust as needed for your use case)
CREATE POLICY "Enable read access for all users" ON categories FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON content_items FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON series FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON category_content FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON category_series FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON series_episodes FOR SELECT USING (true);

-- Sample data will be inserted via the seed page, not here

