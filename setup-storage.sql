-- Setup Supabase Storage Buckets for HarmonyWatch
-- Run this in your Supabase SQL editor

-- Create missing storage buckets (thumbnails already exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT * FROM (VALUES 
  ('banners', 'banners', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('content', 'content', false, 1073741824, ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'])
) AS v(id, name, public, file_size_limit, allowed_mime_types)
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE buckets.id = v.id);

-- Note: Storage policies need to be managed through the Supabase dashboard
-- Go to Storage > Policies in your Supabase dashboard to set up the policies manually
