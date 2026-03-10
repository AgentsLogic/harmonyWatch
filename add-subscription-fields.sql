-- Add subscription date fields to user_profiles table
-- Run this in Supabase SQL Editor

-- Add subscription_start_date column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE;

-- Add subscription_expires_at column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;

-- Add subscription_plan column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT CHECK (subscription_plan IN ('monthly', 'yearly'));

-- Add subscription_last_checked_at column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_last_checked_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster queries on expiration date
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_expires_at 
  ON user_profiles(subscription_expires_at) 
  WHERE subscription_expires_at IS NOT NULL;

-- Add index for faster queries on subscription plan
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_plan 
  ON user_profiles(subscription_plan) 
  WHERE subscription_plan IS NOT NULL;

