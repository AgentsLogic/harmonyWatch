-- Update user to admin
-- User UUID: 65163d49-94dd-442d-960c-0e070aa39157

UPDATE user_profiles
SET user_type = 'admin'
WHERE user_id = '65163d49-94dd-442d-960c-0e070aa39157';

-- Verify the update
SELECT user_id, user_type, display_name, signup_status
FROM user_profiles
WHERE user_id = '65163d49-94dd-442d-960c-0e070aa39157';

