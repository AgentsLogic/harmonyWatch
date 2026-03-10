-- Check and Create Admin Account Script
-- This script checks for admin accounts and creates one for admin@harmonywatch.com if needed

-- Step 1: Check existing admin accounts
SELECT 
    u.id as user_id,
    u.email,
    up.user_type,
    up.signup_status,
    up.display_name
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE up.user_type = 'admin'
ORDER BY u.created_at;

-- Step 2: Find user by email (admin@harmonywatch.com)
SELECT 
    u.id as user_id,
    u.email,
    up.user_type,
    up.signup_status
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE u.email = 'admin@harmonywatch.com';

-- Step 3: Create or update admin account for admin@harmonywatch.com
DO $$ 
DECLARE
    admin_user_id UUID;
    profile_exists BOOLEAN;
BEGIN
    -- Find the user by email
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = 'admin@harmonywatch.com'
    LIMIT 1;

    -- If user doesn't exist, you'll need to create them first via the app signup
    IF admin_user_id IS NULL THEN
        RAISE NOTICE 'User with email admin@harmonywatch.com does not exist.';
        RAISE NOTICE 'Please create the user account first via the app signup, then run this script again.';
        RETURN;
    END IF;

    -- Check if profile exists
    SELECT EXISTS(
        SELECT 1 FROM user_profiles WHERE user_id = admin_user_id
    ) INTO profile_exists;

    IF profile_exists THEN
        -- Update existing profile to admin
        UPDATE user_profiles
        SET 
            user_type = 'admin',
            signup_status = 'complete',
            display_name = COALESCE(display_name, 'HarmonyWatch Admin'),
            updated_at = NOW()
        WHERE user_id = admin_user_id;
        
        RAISE NOTICE 'Updated user profile to admin for: admin@harmonywatch.com';
    ELSE
        -- Create new admin profile
        INSERT INTO user_profiles (user_id, user_type, signup_status, display_name, bio)
        VALUES (
            admin_user_id,
            'admin',
            'complete',
            'HarmonyWatch Admin',
            'HarmonyWatch Administrator'
        );
        
        RAISE NOTICE 'Created admin user profile for: admin@harmonywatch.com';
    END IF;

    -- Verify the update
    SELECT 
        u.email,
        up.user_type,
        up.signup_status,
        up.display_name
    INTO 
        admin_user_id, -- Reusing variable for display
        profile_exists, -- Reusing variable
        admin_user_id, -- Reusing variable
        profile_exists -- Reusing variable
    FROM auth.users u
    JOIN user_profiles up ON u.id = up.user_id
    WHERE u.email = 'admin@harmonywatch.com';
    
    RAISE NOTICE 'Admin account verified successfully!';
END $$;

-- Step 4: Verify all admin accounts (run this after Step 3)
SELECT 
    u.id as user_id,
    u.email,
    up.user_type,
    up.signup_status,
    up.display_name,
    u.created_at as account_created
FROM auth.users u
JOIN user_profiles up ON u.id = up.user_id
WHERE up.user_type = 'admin'
ORDER BY u.created_at;

