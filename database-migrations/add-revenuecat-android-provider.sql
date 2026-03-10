-- Add revenuecat_android to subscriptions provider CHECK constraint
-- This migration allows Android Google Play subscriptions to be stored in the subscriptions table

-- Drop existing constraint
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

-- Add new constraint with revenuecat_android included
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_provider_check 
  CHECK (provider IN ('stripe', 'revenuecat_ios', 'revenuecat_web', 'revenuecat_android', 'manual'));
