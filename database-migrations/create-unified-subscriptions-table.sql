-- Unified Subscriptions Table Migration
-- This migration creates a unified subscriptions table that consolidates
-- all subscription sources (Stripe, RevenueCat iOS, RevenueCat Web, Manual)
-- into a single table for consistent subscription management.

-- Drop existing stripe_subscriptions table (no data to preserve per plan)
DROP TABLE IF EXISTS stripe_subscriptions CASCADE;

-- Create unified subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT CHECK (provider IN ('stripe', 'revenuecat_ios', 'revenuecat_web', 'manual')) NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired', 'incomplete')) NOT NULL,
  plan TEXT CHECK (plan IN ('monthly', 'yearly')) NULL,
  current_period_start TIMESTAMP WITH TIME ZONE NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NULL,
  expires_at TIMESTAMP WITH TIME ZONE NULL,
  cancel_at TIMESTAMP WITH TIME ZONE NULL,
  canceled_at TIMESTAMP WITH TIME ZONE NULL,
  grace_period_expires_at TIMESTAMP WITH TIME ZONE NULL,
  provider_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider, external_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_external_id ON subscriptions(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status);

-- Create revenuecat_webhook_events table for idempotency
CREATE TABLE IF NOT EXISTS revenuecat_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_event_type ON revenuecat_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_status ON revenuecat_webhook_events(status);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions table
-- Service role can do everything
CREATE POLICY "Service role can manage all subscriptions"
  ON subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for revenuecat_webhook_events table
-- Service role can do everything
CREATE POLICY "Service role can manage all revenuecat webhook events"
  ON revenuecat_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Note: We keep subscription_expires_at in user_profiles temporarily for manual subscriptions
-- This will be removed in a future migration once all manual subscriptions are migrated
