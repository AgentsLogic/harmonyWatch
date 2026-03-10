import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qwcunnnhwbewjhqoddec.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3Y3Vubm5od2Jld2pocW9kZGVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYzMDA4OSwiZXhwIjoyMDc2MjA2MDg5fQ.kINOkWrsZcY1nRJrGf3ziI8i5ImtUY0_87yTVNfvunQ";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const displayName = process.argv[2];

if (!displayName) {
  console.error('Usage: node scripts/update-subscription-expiry.mjs <display_name>');
  process.exit(1);
}

async function updateExpiry() {
  try {
    // Find user by display_name
    const { data: profile, error: findError } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, subscription_expires_at')
      .eq('display_name', displayName)
      .single();

    if (findError || !profile) {
      console.error('User not found:', findError);
      return;
    }

    // Calculate 2 minutes from now
    const now = new Date();
    const expiresIn2Minutes = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes in milliseconds
    const expiresAtISO = expiresIn2Minutes.toISOString();

    console.log(`Current time (UTC): ${now.toISOString()}`);
    console.log(`Setting expiration to (UTC): ${expiresAtISO}`);
    console.log(`This is 2 minutes from now`);

    // Update the subscription_expires_at field
    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_expires_at: expiresAtISO
      })
      .eq('user_id', profile.user_id)
      .select('user_id, display_name, subscription_expires_at, subscription_plan')
      .single();

    if (updateError) {
      console.error('Error updating subscription:', updateError);
      return;
    }

    console.log('\n✅ Successfully updated subscription expiration!');
    console.log(`User: ${updated.display_name || 'N/A'}`);
    console.log(`User ID: ${updated.user_id}`);
    console.log(`New Expiration: ${updated.subscription_expires_at}`);
    console.log(`Plan: ${updated.subscription_plan || 'N/A'}`);
    console.log('\n⚠️  The subscription will expire in approximately 2 minutes.');
  } catch (error) {
    console.error('Error:', error);
  }
}

updateExpiry();

