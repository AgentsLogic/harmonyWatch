-- NULL out subscription fields in user_profiles table
-- These fields are no longer used - subscription details are stored in subscriptions table only
-- Columns are NOT dropped to allow for rollback if needed
-- Run this in Supabase SQL Editor

-- Set all subscription fields to NULL for all users
UPDATE user_profiles
SET 
  subscription_start_date = NULL,
  subscription_expires_at = NULL,
  subscription_plan = NULL,
  subscription_last_checked_at = NULL,
  updated_at = NOW()
WHERE 
  subscription_start_date IS NOT NULL 
  OR subscription_expires_at IS NOT NULL 
  OR subscription_plan IS NOT NULL 
  OR subscription_last_checked_at IS NOT NULL;

-- Verification: Check that all subscription fields are NULL
-- SELECT 
--   COUNT(*) as total_users,
--   COUNT(subscription_start_date) as users_with_start_date,
--   COUNT(subscription_expires_at) as users_with_expires_at,
--   COUNT(subscription_plan) as users_with_plan,
--   COUNT(subscription_last_checked_at) as users_with_last_checked
-- FROM user_profiles;
