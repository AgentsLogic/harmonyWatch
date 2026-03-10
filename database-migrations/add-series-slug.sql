-- Add slug column to series table for URL routing
ALTER TABLE series ADD COLUMN slug text UNIQUE;
CREATE INDEX idx_series_slug ON series(slug);
