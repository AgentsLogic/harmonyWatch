-- Safe Admin Setup Script
-- This script only creates what's needed for admin functionality
-- without dropping existing data

-- Step 1: Create user_profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT CHECK (user_type IN ('free', 'subscriber', 'admin')) DEFAULT 'free',
  signup_status TEXT CHECK (signup_status IN ('pending', 'complete')) DEFAULT 'pending',
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Ensure signup_status column exists for older databases
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS signup_status TEXT CHECK (signup_status IN ('pending', 'complete')) DEFAULT 'pending';

ALTER TABLE user_profiles
  ALTER COLUMN signup_status SET DEFAULT 'pending';

-- Step 2: Create playback_progress table if it doesn't exist
CREATE TABLE IF NOT EXISTS playback_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  current_time_seconds NUMERIC NOT NULL,
  duration NUMERIC NOT NULL,
  percentage_watched NUMERIC GENERATED ALWAYS AS (
    CASE WHEN duration > 0 THEN (current_time_seconds / duration) * 100 ELSE 0 END
  ) STORED,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);

-- Step 3: Create user_playback_progress table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_playback_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
  current_position FLOAT NOT NULL,
  duration FLOAT NOT NULL,
  progress_percentage FLOAT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  last_played TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, content_item_id)
);

-- Step 4: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_type ON user_profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_user_profiles_signup_status ON user_profiles(signup_status);
CREATE INDEX IF NOT EXISTS idx_playback_progress_user_id ON playback_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_playback_progress_content_id ON playback_progress(content_id);
CREATE INDEX IF NOT EXISTS idx_user_playback_progress_user_id ON user_playback_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_playback_progress_content_id ON user_playback_progress(content_item_id);

-- Step 5: Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE playback_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playback_progress ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for user_profiles (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can view own profile') THEN
        CREATE POLICY "Users can view own profile" 
            ON user_profiles FOR SELECT 
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" 
            ON user_profiles FOR UPDATE 
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'Service role can insert profiles') THEN
        CREATE POLICY "Service role can insert profiles" 
            ON user_profiles FOR INSERT 
            WITH CHECK (true);
    END IF;
END $$;

-- Step 7: Create RLS policies for playback_progress (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playback_progress' AND policyname = 'Users can view own playback progress') THEN
        CREATE POLICY "Users can view own playback progress" 
            ON playback_progress FOR SELECT 
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playback_progress' AND policyname = 'Users can insert own playback progress') THEN
        CREATE POLICY "Users can insert own playback progress" 
            ON playback_progress FOR INSERT 
            WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playback_progress' AND policyname = 'Users can update own playback progress') THEN
        CREATE POLICY "Users can update own playback progress" 
            ON playback_progress FOR UPDATE 
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'playback_progress' AND policyname = 'Users can delete own playback progress') THEN
        CREATE POLICY "Users can delete own playback progress" 
            ON playback_progress FOR DELETE 
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Step 8: Create RLS policies for user_playback_progress (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_playback_progress' AND policyname = 'Users can view own audio progress') THEN
        CREATE POLICY "Users can view own audio progress" 
            ON user_playback_progress FOR SELECT 
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_playback_progress' AND policyname = 'Users can insert own audio progress') THEN
        CREATE POLICY "Users can insert own audio progress" 
            ON user_playback_progress FOR INSERT 
            WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_playback_progress' AND policyname = 'Users can update own audio progress') THEN
        CREATE POLICY "Users can update own audio progress" 
            ON user_playback_progress FOR UPDATE 
            USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_playback_progress' AND policyname = 'Users can delete own audio progress') THEN
        CREATE POLICY "Users can delete own audio progress" 
            ON user_playback_progress FOR DELETE 
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Step 9: Stripe customer + subscription tables
CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_price_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')) NOT NULL,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_user_id ON stripe_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON stripe_subscriptions(status);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status ON stripe_webhook_events(status);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_customers' AND policyname = 'Users can view own stripe customer') THEN
        CREATE POLICY "Users can view own stripe customer"
            ON stripe_customers FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_subscriptions' AND policyname = 'Users can view own subscriptions') THEN
        CREATE POLICY "Users can view own subscriptions"
            ON stripe_subscriptions FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_customers' AND policyname = 'Service role manages stripe customers') THEN
        CREATE POLICY "Service role manages stripe customers"
            ON stripe_customers FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_subscriptions' AND policyname = 'Service role manages stripe subscriptions') THEN
        CREATE POLICY "Service role manages stripe subscriptions"
            ON stripe_subscriptions FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_webhook_events' AND policyname = 'Service role manages stripe webhook events') THEN
        CREATE POLICY "Service role manages stripe webhook events"
            ON stripe_webhook_events FOR ALL
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- Step 10: Add comments
COMMENT ON TABLE user_profiles IS 'User profiles linked to Supabase auth.users';
COMMENT ON TABLE playback_progress IS 'Video playback progress tracking for Supabase auth users';
COMMENT ON TABLE user_playback_progress IS 'Audio playback progress tracking for Supabase auth users';
COMMENT ON TABLE stripe_customers IS 'Stripe customer mapping for Supabase auth users';
COMMENT ON TABLE stripe_subscriptions IS 'Stripe subscription records for Supabase auth users';
COMMENT ON TABLE stripe_webhook_events IS 'Audit log of Stripe webhook deliveries processed by HarmonyWatch';

-- Step 11: Create admin user profile for existing auth user
-- This will only work if the auth user exists
INSERT INTO user_profiles (user_id, user_type, display_name, bio)
SELECT 
    '65163d49-94dd-442d-960c-0e070aa39157'::uuid,
    'admin',
    'HarmonyWatch Admin',
    'HarmonyWatch Administrator'
WHERE EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = '65163d49-94dd-442d-960c-0e070aa39157'::uuid
)
ON CONFLICT (user_id) DO UPDATE SET
    user_type = EXCLUDED.user_type,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    updated_at = NOW();
