import { createClient } from '@supabase/supabase-js';

// Read config from lib/config.ts (we'll use the hardcoded values)
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
  console.error('Usage: node scripts/delete-user-subscription.mjs <display_name>');
  process.exit(1);
}

async function deleteSubscription() {
  try {
    console.log(`\n🔍 Searching for user with display name: "${displayName}"...\n`);

    // Find user by display_name
    const { data: profiles, error: searchError } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, user_type, subscription_plan, subscription_expires_at')
      .eq('display_name', displayName)
      .limit(10);

    if (searchError) {
      console.error('Error searching for user:', searchError);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.error(`❌ User not found with display name: "${displayName}"`);
      return;
    }

    if (profiles.length > 1) {
      console.error(`⚠️  Found ${profiles.length} users with display name "${displayName}". Please use a more specific identifier.`);
      profiles.forEach((p, idx) => {
        console.log(`${idx + 1}. User ID: ${p.user_id}, Display Name: ${p.display_name || 'N/A'}`);
      });
      return;
    }

    const profile = profiles[0];
    console.log(`✅ Found user:`);
    console.log(`   User ID: ${profile.user_id}`);
    console.log(`   Display Name: ${profile.display_name}`);
    console.log(`   Current User Type: ${profile.user_type}`);
    console.log(`   Current Plan: ${profile.subscription_plan || 'None'}`);
    console.log(`   Expires At: ${profile.subscription_expires_at || 'None'}`);

    // Check for Stripe subscriptions
    const { data: stripeSubs, error: stripeError } = await supabase
      .from('stripe_subscriptions')
      .select('id, stripe_subscription_id, status')
      .eq('user_id', profile.user_id);

    if (stripeError) {
      console.error('Error checking Stripe subscriptions:', stripeError);
    } else if (stripeSubs && stripeSubs.length > 0) {
      console.log(`\n⚠️  Found ${stripeSubs.length} Stripe subscription(s):`);
      stripeSubs.forEach((sub, idx) => {
        console.log(`   ${idx + 1}. Stripe Subscription ID: ${sub.stripe_subscription_id}, Status: ${sub.status}`);
      });
    }

    // Delete subscription data from user_profiles
    console.log(`\n🗑️  Deleting subscription data...`);

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        user_type: 'free',
        subscription_expires_at: null,
        subscription_start_date: null,
        subscription_plan: null,
        subscription_last_checked_at: null,
      })
      .eq('user_id', profile.user_id);

    if (updateError) {
      console.error('❌ Error updating user profile:', updateError);
      return;
    }

    console.log('✅ Successfully cleared subscription data from user_profiles');

    // Delete Stripe subscriptions if they exist
    if (stripeSubs && stripeSubs.length > 0) {
      console.log(`\n🗑️  Deleting Stripe subscription records...`);
      const { error: deleteStripeError } = await supabase
        .from('stripe_subscriptions')
        .delete()
        .eq('user_id', profile.user_id);

      if (deleteStripeError) {
        console.error('❌ Error deleting Stripe subscriptions:', deleteStripeError);
      } else {
        console.log(`✅ Successfully deleted ${stripeSubs.length} Stripe subscription record(s)`);
      }
    }

    // Verify the deletion
    const { data: updatedProfile, error: verifyError } = await supabase
      .from('user_profiles')
      .select('user_id, user_type, subscription_plan, subscription_expires_at')
      .eq('user_id', profile.user_id)
      .single();

    if (verifyError) {
      console.error('Error verifying deletion:', verifyError);
    } else {
      console.log(`\n✅ Verification:`);
      console.log(`   User Type: ${updatedProfile.user_type}`);
      console.log(`   Subscription Plan: ${updatedProfile.subscription_plan || 'None'}`);
      console.log(`   Expires At: ${updatedProfile.subscription_expires_at || 'None'}`);
      console.log(`\n✨ Subscription completely deleted! User is now on free plan.`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

deleteSubscription();

