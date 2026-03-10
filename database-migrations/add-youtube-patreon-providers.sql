-- Add YouTube and Patreon providers to subscriptions table
-- Create linked_accounts table for OAuth token storage
-- Create patreon_webhook_events table for webhook idempotency
-- This migration enables YouTube and Patreon membership linking

-- Step 1: Update subscriptions provider CHECK constraint
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_provider_check 
  CHECK (provider IN ('stripe', 'revenuecat_ios', 'revenuecat_web', 'revenuecat_android', 'youtube', 'patreon', 'manual'));

-- Step 2: Create linked_accounts table for OAuth token storage
CREATE TABLE IF NOT EXISTS linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT CHECK (platform IN ('youtube', 'patreon')) NOT NULL,
  external_user_id TEXT NOT NULL,
  external_username TEXT,
  external_email TEXT,
  access_token TEXT NOT NULL, -- Encrypted at application layer
  refresh_token TEXT, -- Encrypted at application layer
  token_expires_at TIMESTAMP WITH TIME ZONE,
  linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_verified_at TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('active', 'expired', 'revoked')) DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb, -- Stores platform-specific data like patron_status, pledge_cadence, next_charge_date, YouTube membership level
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(platform, external_user_id), -- Prevent duplicate external accounts
  UNIQUE(user_id, platform) -- One link per platform per user
);

-- Step 3: Create indexes for linked_accounts
CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_id ON linked_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_platform ON linked_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_platform_external_user_id ON linked_accounts(platform, external_user_id);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_status ON linked_accounts(status);

-- Step 4: Create patreon_webhook_events table for webhook idempotency
CREATE TABLE IF NOT EXISTS patreon_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL, -- Patreon event ID for deduplication
  event_type TEXT NOT NULL, -- e.g., 'members:pledge:create', 'members:pledge:delete'
  status TEXT NOT NULL, -- 'pending', 'processed', 'failed'
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_patreon_webhook_events_event_type ON patreon_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_patreon_webhook_events_status ON patreon_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_patreon_webhook_events_event_id ON patreon_webhook_events(event_id);

-- Step 5: Enable RLS on new tables
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patreon_webhook_events ENABLE ROW LEVEL SECURITY;

-- Step 6: RLS Policies for linked_accounts
-- Service role can do everything
CREATE POLICY "Service role can manage all linked accounts"
  ON linked_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own linked accounts
CREATE POLICY "Users can view own linked accounts"
  ON linked_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own linked accounts (for token refresh)
CREATE POLICY "Users can update own linked accounts"
  ON linked_accounts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own linked accounts (unlink)
CREATE POLICY "Users can delete own linked accounts"
  ON linked_accounts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 7: RLS Policies for patreon_webhook_events
-- Service role can do everything
CREATE POLICY "Service role can manage all patreon webhook events"
  ON patreon_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Note: OAuth tokens (access_token, refresh_token) should be encrypted at the application layer
-- before storing in the database. Use AES-256 encryption with LINKED_ACCOUNT_ENCRYPTION_KEY.
