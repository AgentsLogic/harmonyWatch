-- Migration: Add Bug Reports Table
-- This table stores bug reports submitted by users

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_text TEXT NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);

-- Enable Row Level Security
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own bug reports
CREATE POLICY "Users can view their own bug reports" ON bug_reports
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own bug reports
CREATE POLICY "Users can insert their own bug reports" ON bug_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all bug reports
CREATE POLICY "Admins can view all bug reports" ON bug_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.user_type = 'admin'
    )
  );

-- Policy: Admins can update bug reports
CREATE POLICY "Admins can update bug reports" ON bug_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.user_type = 'admin'
    )
  );

-- Policy: Admins can delete bug reports
CREATE POLICY "Admins can delete bug reports" ON bug_reports
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.user_type = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bug_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_bug_reports_updated_at();
