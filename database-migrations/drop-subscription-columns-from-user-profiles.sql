-- Migration: Drop Subscription Columns from user_profiles
-- This migration permanently removes the deprecated subscription columns from user_profiles.
-- These columns are no longer used - subscription data is now exclusively in the 'subscriptions' table.
--
-- IMPORTANT: Run this migration AFTER null-out-subscription-fields-from-user-profiles.sql
-- The columns should already be NULL'd out, but this removes them completely.
--
-- Execution Order:
-- 1. Drop trigger (prevents validation errors on user_profiles updates)
-- 2. Drop functions (they reference the columns)
-- 3. Drop columns (now safe)
-- 4. Drop indexes (cleanup)
-- 5. Verify (confirm success)

-- ============================================
-- Step 1: Drop the validation trigger
-- ============================================
-- This trigger fires on every user_profiles update and references subscription columns.
-- Must be dropped FIRST to prevent errors during column removal.
DROP TRIGGER IF EXISTS trigger_validate_subscription_dates ON user_profiles;

-- ============================================
-- Step 2: Drop functions that reference subscription columns
-- ============================================
-- These functions are legacy and not used by the application.
-- They reference subscription columns, so must be dropped before columns.
DROP FUNCTION IF EXISTS downgrade_expired_subscriptions();
DROP FUNCTION IF EXISTS validate_subscription_dates();
DROP FUNCTION IF EXISTS is_subscription_active(UUID);

-- ============================================
-- Step 3: Drop the subscription columns
-- ============================================
-- Now safe to drop the columns since no triggers or functions reference them.
ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS subscription_start_date,
  DROP COLUMN IF EXISTS subscription_expires_at,
  DROP COLUMN IF EXISTS subscription_plan,
  DROP COLUMN IF EXISTS subscription_last_checked_at;

-- ============================================
-- Step 4: Drop indexes on removed columns (if they exist)
-- ============================================
-- Clean up any indexes that were created on the subscription columns.
DROP INDEX IF EXISTS idx_user_profiles_subscription_expires_at;
DROP INDEX IF EXISTS idx_user_profiles_subscription_plan;
DROP INDEX IF EXISTS idx_user_profiles_subscription_start_date;

-- ============================================
-- Step 5: Verification
-- ============================================
-- Verify that the columns are completely removed.
-- This query should return 0 rows if successful.
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ SUCCESS: All subscription columns removed from user_profiles'
    ELSE '❌ WARNING: Some columns still exist: ' || string_agg(column_name, ', ')
  END AS verification_result
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
  AND table_schema = 'public'
  AND column_name IN (
    'subscription_start_date', 
    'subscription_expires_at', 
    'subscription_plan', 
    'subscription_last_checked_at'
  );

-- ============================================
-- Additional Verification: Check for orphaned functions/triggers
-- ============================================
-- Verify that functions and trigger are removed.
SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname IN ('downgrade_expired_subscriptions', 'validate_subscription_dates', 'is_subscription_active')
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'trigger_validate_subscription_dates'
    ) THEN '✅ SUCCESS: All functions and triggers removed'
    ELSE '❌ WARNING: Some functions or triggers still exist'
  END AS functions_verification_result;

-- ============================================
-- Notes
-- ============================================
-- After running this migration:
-- 1. Subscription data is now exclusively in the 'subscriptions' table
-- 2. user_profiles only stores user_type and signup_status (derived from subscriptions)
-- 3. The utility scripts (delete-user-subscription.mjs, etc.) will need to be updated
--    if you want to continue using them, but they don't affect the running application.
-- 4. All application code has already been updated to use the subscriptions table.
