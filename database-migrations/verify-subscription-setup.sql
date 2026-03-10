-- Verification Script: Subscription Management Setup
-- This script verifies that subscription management functions are properly set up
-- Run this in Supabase SQL Editor to check your database setup

-- Check if downgrade function exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = 'downgrade_expired_subscriptions'
        ) THEN '✅ Function exists'
        ELSE '❌ Function missing - run add-subscription-management-functions.sql'
    END AS downgrade_function_status;

-- Check if validation function exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = 'validate_subscription_dates'
        ) THEN '✅ Function exists'
        ELSE '❌ Function missing - run add-subscription-management-functions.sql'
    END AS validation_function_status;

-- Check if subscription status function exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = 'is_subscription_active'
        ) THEN '✅ Function exists'
        ELSE '❌ Function missing - run add-subscription-management-functions.sql'
    END AS status_function_status;

-- Check if validation trigger exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'trigger_validate_subscription_dates'
        ) THEN '✅ Trigger exists'
        ELSE '❌ Trigger missing - run add-subscription-management-functions.sql'
    END AS validation_trigger_status;

-- Check for expired subscriptions that need downgrading
SELECT 
    COUNT(*) as expired_subscriptions_count,
    'Run: SELECT * FROM downgrade_expired_subscriptions();' as action
FROM user_profiles
WHERE user_type = 'subscriber'
  AND subscription_expires_at IS NOT NULL
  AND subscription_expires_at < NOW()
  AND NOT EXISTS (
    SELECT 1 FROM stripe_subscriptions
    WHERE stripe_subscriptions.user_id = user_profiles.user_id
      AND stripe_subscriptions.status IN ('active', 'trialing')
  );

-- Check subscription columns exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_profiles'
  AND column_name IN (
    'subscription_start_date',
    'subscription_expires_at',
    'subscription_plan',
    'subscription_last_checked_at'
  )
ORDER BY column_name;

-- Check indexes on subscription columns
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'user_profiles'
  AND indexname LIKE '%subscription%'
ORDER BY indexname;
