/**
 * User Migration Script: Custom Auth → Supabase Auth
 * 
 * This script helps migrate existing users from the custom authentication system
 * to Supabase's built-in authentication system.
 * 
 * IMPORTANT: 
 * - Run this script AFTER setting up the new database schema
 * - Backup your database before running this script
 * - Test in a development environment first
 * 
 * Usage:
 * 1. Update the configuration below
 * 2. Run: node migrate-users-to-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Configuration - UPDATE THESE VALUES
const SUPABASE_URL = 'https://qwcunnnhwbewjhqoddec.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Y3Vubm5od2Jld2pocW9kZGVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYzMDA4OSwiZXhwIjoyMDc2MjA2MDg5fQ.kINOkWrsZcY1nRJrGf3ziI8i5ImtUY0_87yTVNfvunQ';

// Initialize Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Migration Strategy:
 * 1. Get all existing users from the old users table
 * 2. For each user, create a new Supabase auth user
 * 3. Create corresponding user_profile record
 * 4. Update any foreign key references
 * 5. Clean up old auth tables
 */

async function migrateUsers() {
  console.log('🚀 Starting user migration to Supabase Auth...');
  
  try {
    // Step 1: Get all existing users from the old system
    console.log('📋 Fetching existing users...');
    const { data: existingUsers, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true);

    if (fetchError) {
      throw new Error(`Failed to fetch existing users: ${fetchError.message}`);
    }

    console.log(`📊 Found ${existingUsers.length} users to migrate`);

    // Step 2: Migrate each user
    const migrationResults = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const user of existingUsers) {
      try {
        console.log(`👤 Migrating user: ${user.email}`);
        
        // Create new Supabase auth user
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: generateTemporaryPassword(), // Generate temp password
          email_confirm: true, // Skip email confirmation for migration
          user_metadata: {
            user_type: user.user_type,
            migrated_from_custom_auth: true,
            original_user_id: user.id
          }
        });

        if (authError) {
          throw new Error(`Failed to create auth user: ${authError.message}`);
        }

        // Create user profile
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: authUser.user.id,
            user_type: user.user_type,
            display_name: user.email.split('@')[0],
            created_at: user.created_at
          });

        if (profileError) {
          throw new Error(`Failed to create user profile: ${profileError.message}`);
        }

        // Update any foreign key references (if needed)
        await updateForeignKeys(user.id, authUser.user.id);

        migrationResults.successful++;
        console.log(`✅ Successfully migrated: ${user.email}`);

      } catch (error) {
        migrationResults.failed++;
        migrationResults.errors.push({
          email: user.email,
          error: error.message
        });
        console.error(`❌ Failed to migrate ${user.email}: ${error.message}`);
      }
    }

    // Step 3: Report results
    console.log('\n📊 Migration Results:');
    console.log(`✅ Successful: ${migrationResults.successful}`);
    console.log(`❌ Failed: ${migrationResults.failed}`);
    
    if (migrationResults.errors.length > 0) {
      console.log('\n🚨 Errors:');
      migrationResults.errors.forEach(err => {
        console.log(`  - ${err.email}: ${err.error}`);
      });
    }

    // Step 4: Cleanup instructions
    console.log('\n🧹 Next Steps:');
    console.log('1. Verify all users can login with their email');
    console.log('2. Send password reset emails to all users');
    console.log('3. Test the application thoroughly');
    console.log('4. Once confirmed working, drop old auth tables:');
    console.log('   - DROP TABLE user_sessions;');
    console.log('   - DROP TABLE users;');

  } catch (error) {
    console.error('💥 Migration failed:', error.message);
    process.exit(1);
  }
}

/**
 * Generate a temporary password for migrated users
 * Users will need to reset their password on first login
 */
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Update foreign key references from old user IDs to new auth user IDs
 */
async function updateForeignKeys(oldUserId, newUserId) {
  // Update any tables that reference the old user ID
  // This is a placeholder - add specific table updates as needed
  
  console.log(`🔄 Updating foreign keys for user ${oldUserId} → ${newUserId}`);
  
  // Example: Update playback_progress if it exists
  // const { error } = await supabase
  //   .from('playback_progress')
  //   .update({ user_id: newUserId })
  //   .eq('user_id', oldUserId);
  
  // Add more foreign key updates as needed
}

/**
 * Send password reset emails to all migrated users
 */
async function sendPasswordResetEmails() {
  console.log('📧 Sending password reset emails...');
  
  const { data: users, error } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_type', 'free'); // Only send to regular users, not admins

  if (error) {
    console.error('Failed to fetch users for password reset:', error.message);
    return;
  }

  for (const user of users) {
    try {
      const { error: resetError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: user.email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`
        }
      });

      if (resetError) {
        console.error(`Failed to generate reset link for ${user.email}:`, resetError.message);
      } else {
        console.log(`✅ Reset link generated for ${user.email}`);
      }
    } catch (error) {
      console.error(`Error processing ${user.email}:`, error.message);
    }
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateUsers()
    .then(() => {
      console.log('🎉 Migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateUsers, sendPasswordResetEmails };
