import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read config from lib/config.ts (we'll use the hardcoded values)
const supabaseUrl = "https://qwcunnnhwbewjhqoddec.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Y3Vubm5od2Jld2pocW9kZGVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYzMDA4OSwiZXhwIjoyMDc2MjA2MDg5fQ.kINOkWrsZcY1nRJrGf3ziI8i5ImtUY0_87yTVNfvunQ";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/check-user-subscription.mjs <user_id>');
  process.exit(1);
}

async function checkSubscription() {
  try {
    // Try to find user by searching user_profiles first
    // The userId might be a partial UUID, email, or other identifier
    let profile = null;
    let email = null;

    // First, try exact match on user_id (if it's a UUID)
    if (userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, user_type, subscription_start_date, subscription_expires_at, subscription_plan, subscription_last_checked_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        profile = data;
        // Get email from auth.users
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(profile.user_id);
          email = authUser?.user?.email || 'Unknown';
        } catch (e) {
          email = 'Unknown';
        }
      }
    }

    // If not found and looks like an email, try to find user by email
    if (!profile && userId.includes('@')) {
      try {
        // Search auth.users by email
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (!listError && users) {
          const matchingUser = users.find(u => u.email?.toLowerCase() === userId.toLowerCase());
          if (matchingUser) {
            email = matchingUser.email;
            // Now get the profile
            const { data: profileData, error: profileError } = await supabase
              .from('user_profiles')
              .select('user_id, user_type, subscription_start_date, subscription_expires_at, subscription_plan, subscription_last_checked_at')
              .eq('user_id', matchingUser.id)
              .maybeSingle();
            
            if (!profileError && profileData) {
              profile = profileData;
            }
          }
        }
      } catch (e) {
        console.error('Error searching by email:', e);
      }
    }

    // If not found, try searching by display_name
    if (!profile) {
      const { data: profiles, error: searchError } = await supabase
        .from('user_profiles')
        .select('user_id, user_type, subscription_start_date, subscription_expires_at, subscription_plan, subscription_last_checked_at, display_name')
        .eq('display_name', userId)
        .limit(10);

      if (!searchError && profiles && profiles.length > 0) {
        if (profiles.length === 1) {
          profile = profiles[0];
          try {
            const { data: authUser } = await supabase.auth.admin.getUserById(profile.user_id);
            email = authUser?.user?.email || 'Unknown';
          } catch (e) {
            email = 'Unknown';
          }
        } else {
          console.log(`Found ${profiles.length} matching profiles. Please use a more specific identifier.`);
          profiles.forEach((p, idx) => {
            console.log(`${idx + 1}. User ID: ${p.user_id}, Display Name: ${p.display_name || 'N/A'}`);
          });
          return;
        }
      }
    }

    if (!profile) {
      console.error(`User not found with identifier: ${userId}`);
      console.log('Try using a full UUID, email address, or display name.');
      return;
    }

    displaySubscriptionInfo(profile, email);
  } catch (error) {
    console.error('Error:', error);
  }
}

function displaySubscriptionInfo(profile, email) {
  console.log('\n=== User Subscription Status ===');
  console.log(`User ID: ${profile.user_id}`);
  console.log(`Email: ${email || 'N/A'}`);
  console.log(`User Type: ${profile.user_type}`);
  console.log(`Subscription Plan: ${profile.subscription_plan || 'None'}`);
  console.log(`Start Date: ${profile.subscription_start_date || 'N/A'}`);
  console.log(`Expires At: ${profile.subscription_expires_at || 'N/A'}`);
  console.log(`Last Checked: ${profile.subscription_last_checked_at || 'N/A'}`);

  if (profile.subscription_expires_at) {
    const expiresAt = new Date(profile.subscription_expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;
    const daysUntilExpiry = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    console.log('\n=== Expiration Status ===');
    console.log(`Current Time (UTC): ${now.toISOString()}`);
    console.log(`Expiration Time (UTC): ${expiresAt.toISOString()}`);
    console.log(`Status: ${isExpired ? '❌ EXPIRED' : '✅ ACTIVE'}`);
    
    if (isExpired) {
      console.log(`Expired ${Math.abs(daysUntilExpiry)} day(s) ago`);
    } else {
      console.log(`Expires in ${daysUntilExpiry} day(s)`);
    }
  } else {
    console.log('\n=== Expiration Status ===');
    console.log('No subscription expiration date set');
  }
}

checkSubscription();

