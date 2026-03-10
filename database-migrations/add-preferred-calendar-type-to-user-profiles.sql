-- Add preferred_calendar_type column to user_profiles table
-- This stores the user's preference for New Calendar ('new') or Old Calendar ('old')

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS preferred_calendar_type TEXT CHECK (preferred_calendar_type IN ('new', 'old')) DEFAULT 'new';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_calendar_type 
ON user_profiles(preferred_calendar_type);

-- Update existing users to have 'new' as default if they don't have a preference
UPDATE user_profiles
SET preferred_calendar_type = 'new'
WHERE preferred_calendar_type IS NULL;


