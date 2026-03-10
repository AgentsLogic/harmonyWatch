-- Verification Script: User Deletion Cascade Constraints
-- This script verifies that all user-related tables have ON DELETE CASCADE
-- Run this in Supabase SQL Editor to check your database setup

-- Check all foreign key constraints that reference auth.users
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'users'
    AND ccu.table_schema = 'auth'
ORDER BY 
    tc.table_name;

-- Expected results should show:
-- user_profiles: ON DELETE CASCADE
-- playback_progress: ON DELETE CASCADE
-- user_playback_progress: ON DELETE CASCADE
-- comments: ON DELETE CASCADE
-- comment_reactions: ON DELETE CASCADE
-- stripe_customers: ON DELETE CASCADE
-- stripe_subscriptions: ON DELETE CASCADE

-- If any table shows 'NO ACTION' or 'RESTRICT', you need to add CASCADE delete
-- Use the following template to fix any missing CASCADE constraints:

-- Example fix (replace with actual table name):
-- ALTER TABLE table_name
--   DROP CONSTRAINT constraint_name,
--   ADD CONSTRAINT constraint_name
--   FOREIGN KEY (user_id) 
--   REFERENCES auth.users(id) 
--   ON DELETE CASCADE;
