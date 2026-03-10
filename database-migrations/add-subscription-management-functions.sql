-- Subscription Management Functions and Triggers
-- This script adds functions to handle subscription expiration and validation
-- Run this in Supabase SQL Editor

-- ============================================
-- Function 1: Automatically downgrade expired subscriptions
-- ============================================
-- This function checks all subscriptions and downgrades users whose subscriptions have expired
CREATE OR REPLACE FUNCTION downgrade_expired_subscriptions()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  expired_at TIMESTAMP WITH TIME ZONE,
  downgraded BOOLEAN
) AS $$
DECLARE
  affected_count INTEGER := 0;
BEGIN
  -- Update users with expired subscriptions
  UPDATE user_profiles
  SET 
    user_type = 'free',
    updated_at = NOW()
  FROM auth.users
  WHERE user_profiles.user_id = auth.users.id
    AND user_profiles.user_type = 'subscriber'
    AND user_profiles.subscription_expires_at IS NOT NULL
    AND user_profiles.subscription_expires_at < NOW()
    AND NOT EXISTS (
      -- Don't downgrade if they have an active Stripe subscription
      SELECT 1 FROM stripe_subscriptions
      WHERE stripe_subscriptions.user_id = user_profiles.user_id
        AND stripe_subscriptions.status IN ('active', 'trialing')
    )
  RETURNING 
    user_profiles.user_id,
    auth.users.email,
    user_profiles.subscription_expires_at,
    TRUE INTO affected_count;

  -- Return affected users
  RETURN QUERY
  SELECT 
    up.user_id,
    u.email,
    up.subscription_expires_at,
    TRUE as downgraded
  FROM user_profiles up
  JOIN auth.users u ON u.id = up.user_id
  WHERE up.user_type = 'free'
    AND up.subscription_expires_at IS NOT NULL
    AND up.subscription_expires_at < NOW()
    AND up.updated_at > NOW() - INTERVAL '1 minute'; -- Only recently updated

  RAISE NOTICE 'Downgraded % expired subscriptions', affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function 2: Validate subscription dates
-- ============================================
-- This function ensures subscription dates are valid
CREATE OR REPLACE FUNCTION validate_subscription_dates()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure subscription_expires_at is after subscription_start_date
  IF NEW.subscription_start_date IS NOT NULL 
     AND NEW.subscription_expires_at IS NOT NULL 
     AND NEW.subscription_expires_at < NEW.subscription_start_date THEN
    RAISE EXCEPTION 'subscription_expires_at must be after subscription_start_date';
  END IF;

  -- If user_type is 'subscriber', ensure subscription_expires_at is in the future
  -- (Allow grace period for recently expired subscriptions being extended)
  IF NEW.user_type = 'subscriber' 
     AND NEW.subscription_expires_at IS NOT NULL 
     AND NEW.subscription_expires_at < NOW() - INTERVAL '1 day' THEN
    -- Allow expired subscriptions if they're being extended (updated_at is recent)
    IF NEW.updated_at IS NULL OR NEW.updated_at < NOW() - INTERVAL '1 minute' THEN
      RAISE WARNING 'Subscriber has expired subscription. Consider running downgrade_expired_subscriptions()';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger: Validate subscription dates on insert/update
-- ============================================
DROP TRIGGER IF EXISTS trigger_validate_subscription_dates ON user_profiles;
CREATE TRIGGER trigger_validate_subscription_dates
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_subscription_dates();

-- ============================================
-- Function 3: Get subscription status for a user
-- ============================================
-- Helper function to check if a user's subscription is active
CREATE OR REPLACE FUNCTION is_subscription_active(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  expires_at TIMESTAMP WITH TIME ZONE;
  user_type_val TEXT;
BEGIN
  SELECT 
    subscription_expires_at,
    user_type
  INTO expires_at, user_type_val
  FROM user_profiles
  WHERE user_id = p_user_id;

  -- Check if user is a subscriber and subscription hasn't expired
  IF user_type_val = 'subscriber' AND expires_at IS NOT NULL THEN
    RETURN expires_at > NOW();
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- Grant permissions
-- ============================================
-- Allow service role to execute the downgrade function
GRANT EXECUTE ON FUNCTION downgrade_expired_subscriptions() TO service_role;
GRANT EXECUTE ON FUNCTION is_subscription_active(UUID) TO authenticated, anon, service_role;

-- ============================================
-- Optional: Set up scheduled job (pg_cron)
-- ============================================
-- Uncomment the following if you have pg_cron extension enabled
-- This will automatically run the downgrade function daily at 2 AM UTC

-- First, enable pg_cron extension (if not already enabled):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup of expired subscriptions:
-- SELECT cron.schedule(
--   'downgrade-expired-subscriptions',
--   '0 2 * * *', -- Run daily at 2 AM UTC
--   $$SELECT downgrade_expired_subscriptions();$$
-- );

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('downgrade-expired-subscriptions');

-- ============================================
-- Manual execution
-- ============================================
-- You can manually run the downgrade function anytime:
-- SELECT * FROM downgrade_expired_subscriptions();

-- Check subscription status for a specific user:
-- SELECT is_subscription_active('user-uuid-here');
