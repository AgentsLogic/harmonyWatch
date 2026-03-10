-- Add 'staff' user type to user_profiles table
-- Staff users have access to admin panel but can only manage content (not users, settings, etc.)
-- Run this in Supabase SQL Editor

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_user_type_check;

-- Step 2: Add new CHECK constraint that includes 'staff'
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_user_type_check 
  CHECK (user_type IN ('free', 'subscriber', 'admin', 'staff'));

-- Step 3: Update any existing triggers or functions that reference user_type
-- (If you have any triggers that check for 'admin', you may need to update them)

-- Verification: Check that the constraint was added correctly
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'user_profiles'::regclass 
-- AND conname = 'user_profiles_user_type_check';
