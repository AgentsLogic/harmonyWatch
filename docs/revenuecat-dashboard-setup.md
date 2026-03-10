# RevenueCat Dashboard Configuration Guide

This guide walks you through the manual configuration steps needed in the RevenueCat dashboard to complete the web billing migration.

## Prerequisites

- RevenueCat account (https://app.revenuecat.com)
- Stripe account (connected or ready to connect)
- Access to your Supabase project
- Your RevenueCat Public API Key (found in RevenueCat dashboard → Project Settings → API Keys)

## Step 1: Connect Stripe Account

1. **Navigate to RevenueCat Dashboard**
   - Go to https://app.revenuecat.com
   - Select your project (or create a new one)

2. **Connect Stripe**
   - Go to **Project Settings** → **Integrations**
   - Find **Stripe** in the list
   - Click **Connect** or **Configure**
   - Follow the OAuth flow to connect your Stripe account
   - Ensure both **Test Mode** and **Live Mode** are connected if you use both

3. **Verify Connection**
   - You should see your Stripe account name in the integrations list
   - Status should show as "Connected"

## Step 2: Create Products in Stripe (if not already created)

**Note:** RevenueCat will sync products from Stripe, so create them in Stripe first.

1. **Go to Stripe Dashboard**
   - Navigate to https://dashboard.stripe.com
   - Go to **Products** → **Add Product**

2. **Create Monthly Subscription Product**
   - **Name:** `Harmony Monthly Subscription` (or your preferred name)
   - **Description:** Monthly subscription to Harmony
   - **Pricing Model:** Recurring
   - **Price:** Your monthly price (e.g., $9.99)
   - **Billing Period:** Monthly
   - **Currency:** USD (or your currency)
   - Click **Save Product**
   - **Copy the Price ID** (starts with `price_...`) - you'll need this

3. **Create Yearly Subscription Product**
   - **Name:** `Harmony Yearly Subscription` (or your preferred name)
   - **Description:** Yearly subscription to Harmony
   - **Pricing Model:** Recurring
   - **Price:** Your yearly price (e.g., $99.99)
   - **Billing Period:** Yearly
   - **Currency:** USD (or your currency)
   - Click **Save Product**
   - **Copy the Price ID** (starts with `price_...`) - you'll need this

## Step 3: Create Products in RevenueCat

1. **Navigate to Products**
   - In RevenueCat dashboard, go to **Products** → **Add Product**

2. **Create Monthly Product**
   - **Product Identifier:** `monthly_subscription` (or your preferred identifier)
   - **Type:** Subscription
   - **Store:** Stripe
   - **Stripe Product:** Select the monthly product you created in Stripe
   - **Stripe Price ID:** Paste the monthly price ID from Stripe
   - Click **Save**

3. **Create Yearly Product**
   - **Product Identifier:** `yearly_subscription` (or your preferred identifier)
   - **Type:** Subscription
   - **Store:** Stripe
   - **Stripe Product:** Select the yearly product you created in Stripe
   - **Stripe Price ID:** Paste the yearly price ID from Stripe
   - Click **Save**

**Important:** The product identifiers (`monthly_subscription`, `yearly_subscription`) are what you'll reference in your code. Make sure they match what you use in your RevenueCat packages.

## Step 4: Create Entitlement

1. **Navigate to Entitlements**
   - Go to **Entitlements** → **Add Entitlement**

2. **Create Premium Entitlement**
   - **Identifier:** `premium` (or `subscriber` - must match what you check in code)
   - **Display Name:** Premium Access (or Subscriber Access)
   - **Description:** Access to premium content and features
   - Click **Save**

3. **Attach Products to Entitlement**
   - Click on the entitlement you just created
   - Go to **Products** tab
   - Click **Attach Product**
   - Select both `monthly_subscription` and `yearly_subscription`
   - Both products should now be attached to the entitlement

**Note:** The entitlement identifier (`premium` or `subscriber`) is what you'll check in your code to determine if a user has active access. Make sure it matches what you use in:
- `app/api/payments/revenuecat-sync/route.ts`
- `app/api/webhooks/revenuecat/route.ts`
- Any entitlement checking logic

## Step 5: Create Offering

1. **Navigate to Offerings**
   - Go to **Offerings** → **Add Offering**

2. **Create Default Offering**
   - **Identifier:** `default` (or leave as default)
   - **Display Name:** Default Offering
   - **Description:** Main subscription offering
   - Click **Save**

3. **Add Packages to Offering**
   - Click on the offering you just created
   - Go to **Packages** tab
   - Click **Add Package**

4. **Create Monthly Package**
   - **Identifier:** `$rc_monthly` (or `monthly` - must match code)
   - **Display Name:** Monthly Plan
   - **Product:** Select `monthly_subscription`
   - **Package Type:** Custom (or Monthly)
   - Click **Save**

5. **Create Yearly Package**
   - **Identifier:** `$rc_annual` (or `yearly` - must match code)
   - **Display Name:** Yearly Plan
   - **Product:** Select `yearly_subscription`
   - **Package Type:** Custom (or Annual)
   - Click **Save**

**Critical:** The package identifiers (`$rc_monthly`, `$rc_annual`) MUST match what you use in your code:
- `app/signup/payment/page.tsx` - Line 68: `const packageIdentifier = selectedPlan === "monthly" ? "$rc_monthly" : "$rc_annual";`

If you use different identifiers, update the code accordingly.

6. **Set as Current Offering**
   - Make sure this offering is set as the **Current Offering**
   - This is the offering that will be returned by `getOfferings()` by default

## Step 6: Configure Webhook

1. **Navigate to Webhooks**
   - Go to **Project Settings** → **Webhooks**
   - Click **Add Webhook**

2. **Configure Webhook Endpoint**
   - **URL:** `https://www.harmony.watch/api/webhooks/revenuecat`
     - Replace with your production domain
     - For local testing: Use a tool like ngrok or RevenueCat's webhook testing
   - **Events:** Select all subscription events:
     - `INITIAL_PURCHASE`
     - `RENEWAL`
     - `CANCELLATION`
     - `EXPIRATION`
     - `BILLING_ISSUE`
     - `UNCANCELLATION`
   - Click **Save**

3. **Copy Webhook Authorization Secret**
   - RevenueCat will show you an authorization secret
   - **Copy this value** - you'll need to add it to your environment variables
   - This is the value for `REVENUECAT_WEBHOOK_SECRET`

4. **Test Webhook (Optional)**
   - RevenueCat provides a test webhook feature
   - Use this to verify your endpoint is working
   - Check your server logs to ensure webhooks are being received

## Step 7: Configure App User ID Mapping

1. **Navigate to Project Settings**
   - Go to **Project Settings** → **General**

2. **App User ID Format**
   - RevenueCat uses `app_user_id` to identify users
   - In your code, you're passing Supabase `user.id` as the `appUserID`
   - This is correct - RevenueCat will use Supabase user IDs to identify users

3. **Verify Mapping**
   - When a user makes a purchase, RevenueCat will store:
     - `app_user_id` = Supabase `user.id`
     - Stripe `customer_id` = Automatically linked
   - This allows RevenueCat to sync subscription status with your database

## Step 8: Environment Variables

Add these to your Vercel environment variables (or your deployment platform):

1. **NEXT_PUBLIC_REVENUECAT_WEB_API_KEY** (Required for Web)
   - **Value:** Your RevenueCat Web Billing Public API Key
   - **Location:** RevenueCat Dashboard → "Harmony (Web Billing)" app → API Keys → Public API Key
   - **Scope:** Available to browser (NEXT_PUBLIC_ prefix)
   - **Note:** This is the API key for Web Billing platform

2. **NEXT_PUBLIC_REVENUECAT_IOS_API_KEY** (Required for iOS)
   - **Value:** Your RevenueCat iOS Public API Key
   - **Location:** RevenueCat Dashboard → "Harmony: Orthodox Content" app → API Keys → Public API Key
   - **Scope:** Available to browser (NEXT_PUBLIC_ prefix)
   - **Note:** This is the API key for iOS App Store platform

3. **REVENUECAT_WEBHOOK_SECRET** (Required)
   - **Value:** The authorization secret from Step 6
   - **Location:** RevenueCat Dashboard → Integrations → Webhooks → Authorization Header
   - **Scope:** Server-only (no NEXT_PUBLIC_ prefix)

4. **Sandbox API Keys (For Testing)**
   - **NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY** - Web Billing Sandbox API key for testing
   - **NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY** - iOS Sandbox API key for testing
   - **NEXT_PUBLIC_REVENUECAT_USE_SANDBOX** - Set to `'true'` to force Sandbox mode (optional, defaults to development mode)
   - **Location:** RevenueCat Dashboard → Project Settings → API Keys → Sandbox
   - **Note:** Sandbox mode is automatically enabled in development (`NODE_ENV=development`)
   - **Scope:** Available to browser (NEXT_PUBLIC_ prefix)

5. **Legacy Support (Optional)**
   - **NEXT_PUBLIC_REVENUECAT_API_KEY** - Can be kept for backward compatibility
   - If set, will be used as fallback if platform-specific keys are not available
   - **Recommendation:** Use platform-specific keys instead

6. **Verify Existing Variables**
   - `NEXT_PUBLIC_SUPABASE_URL` - Should already be set
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Should already be set
   - `SUPABASE_SERVICE_ROLE_KEY` - Should already be set

### How to Find Your API Keys

**Web Billing API Key:**
1. Go to RevenueCat Dashboard → Apps & Providers (or Integrations)
2. Click on "Harmony (Web Billing)" app configuration
3. Look for "Public API Key" or "API Key" section
4. Copy the key (starts with `appl_` or similar)

**iOS API Key:**
1. Go to RevenueCat Dashboard → Apps & Providers (or Integrations)
2. Click on "Harmony: Orthodox Content" app configuration
3. Look for "Public API Key" or "API Key" section
4. Copy the key (starts with `appl_` or similar)

**Sandbox API Keys (For Testing):**
1. Go to RevenueCat Dashboard → Project Settings → API Keys
2. Look for the "Sandbox" section
3. Find the Sandbox API keys for:
   - **Web Billing:** Copy the Sandbox key for "Harmony (Web Billing)"
   - **iOS:** Copy the Sandbox key for "Harmony: Orthodox Content"
4. These keys are used automatically in development mode (`NODE_ENV=development`)
5. To use Sandbox in production, set `NEXT_PUBLIC_REVENUECAT_USE_SANDBOX=true`

## Step 9: Configure Sandbox Mode for Testing

### Why Use Sandbox Mode?
- Test purchases without processing real payments
- Use Stripe test cards (e.g., `4242 4242 4242 4242`)
- Accelerated subscription renewals (monthly subscriptions renew every 5 minutes in Sandbox)
- Safe testing environment

### How to Enable Sandbox Mode

**Option 1: Automatic (Development Mode)**
- Sandbox mode is **automatically enabled** when `NODE_ENV=development`
- No additional configuration needed for local development
- Just add your Sandbox API keys to `.env.local`

**Option 2: Manual (Force Sandbox in Production)**
1. Add to Vercel environment variables:
   - `NEXT_PUBLIC_REVENUECAT_USE_SANDBOX` = `true`
2. This forces Sandbox mode even in production builds

### Setting Up Sandbox API Keys

1. **Get Sandbox API Keys:**
   - Go to RevenueCat Dashboard → Project Settings → API Keys
   - Find the "Sandbox" section
   - Copy the Sandbox keys for:
     - Web Billing: `NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY`
     - iOS: `NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY`

2. **Add to Environment Variables:**
   
   **For Local Development:**
   - Create or edit `.env.local` in your project root:
     ```env
     NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY=your_sandbox_web_key
     NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY=your_sandbox_ios_key
     ```
   - Restart your dev server after adding: `npm run dev`
   
   **For Vercel (Production/Preview):**
   1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
   2. Select your project (HarmonyWatchV1)
   3. Click on **Settings** (top navigation bar)
   4. Click on **Environment Variables** (left sidebar)
   5. Click **Add New** button
   6. For each variable:
      - **Key:** Enter the variable name (e.g., `NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY`)
      - **Value:** Paste your Sandbox API key
      - **Environment:** Select which environments to apply:
        - **Production** - For production deployments
        - **Preview** - For preview deployments (pull requests)
        - **Development** - For local development (optional, use `.env.local` instead)
      - Click **Save**
   7. Repeat for all Sandbox variables:
      - `NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY`
      - `NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY`
      - `NEXT_PUBLIC_REVENUECAT_USE_SANDBOX` (set value to `true` if you want to force Sandbox mode)
   8. **Important:** After adding variables, you need to **redeploy** your application:
      - Go to **Deployments** tab
      - Click the **⋯** (three dots) on your latest deployment
      - Click **Redeploy**
      - Or push a new commit to trigger a new deployment

3. **Verify Sandbox Mode:**
   - Check browser console for: `[useRevenueCat] Using Web API key: { mode: 'SANDBOX (Test Mode)', ... }`
   - You should see "SANDBOX (Test Mode)" in the logs

### Testing with Stripe Test Cards

When using Sandbox mode, you can use Stripe's test cards:
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **Requires Authentication:** `4000 0025 0000 3155`
- Use any future expiry date and any 3-digit CVC

## Step 10: Test Configuration

### Test 1: Verify Products Sync
1. Go to RevenueCat Dashboard → Products
2. Verify both monthly and yearly products are listed
3. Check that Stripe products are linked correctly

### Test 2: Verify Entitlement Setup
1. Go to RevenueCat Dashboard → Entitlements
2. Click on your entitlement
3. Verify both products are attached

### Test 3: Verify Offering Setup
1. Go to RevenueCat Dashboard → Offerings
2. Click on your offering
3. Verify both packages (`$rc_monthly`, `$rc_annual`) are present
4. Verify the offering is set as "Current"

### Test 4: Test Webhook Endpoint
1. Use RevenueCat's webhook testing feature
2. Or use a tool like ngrok for local testing:
   ```bash
   ngrok http 3000
   # Use the ngrok URL in RevenueCat webhook config
   ```
3. Trigger a test webhook and check your server logs

### Test 5: Test Purchase Flow (Sandbox/Test Mode)
1. Use Stripe test mode for initial testing
2. Create a test user in your app
3. Attempt to purchase a subscription
4. Verify:
   - RevenueCat receives the purchase
   - Webhook is triggered
   - Database is updated correctly
   - User profile shows correct subscription status

## Step 11: Production Checklist

Before going live:

- [ ] Stripe account is in **Live Mode** (not test mode)
- [ ] RevenueCat is connected to **Live Stripe** account
- [ ] Products are created in **Live Stripe** (not just test)
- [ ] Webhook URL points to production domain
- [ ] Environment variables are set in production (Vercel)
- [ ] `REVENUECAT_WEBHOOK_SECRET` is set correctly
- [ ] Test a real purchase in production (with real card)
- [ ] Verify webhook is received and processed
- [ ] Verify user subscription status updates correctly

## Troubleshooting

### Products Not Showing in RevenueCat
- **Issue:** Products created in Stripe don't appear in RevenueCat
- **Solution:** 
  - Ensure Stripe is connected in RevenueCat
  - Wait a few minutes for sync (RevenueCat syncs periodically)
  - Manually create products in RevenueCat and link to Stripe products

### Package Identifiers Don't Match
- **Issue:** Code can't find packages (`$rc_monthly`, `$rc_annual`)
- **Solution:**
  - Check package identifiers in RevenueCat dashboard
  - Update code to match, or update RevenueCat to match code
  - Verify offering is set as "Current"

### Webhook Not Received
- **Issue:** Webhooks not being received by your server
- **Solution:**
  - Check webhook URL is correct (no typos)
  - Verify `REVENUECAT_WEBHOOK_SECRET` matches RevenueCat dashboard
  - Check server logs for incoming requests
  - Use RevenueCat's webhook testing feature
  - Verify CORS/authentication isn't blocking requests

### Entitlement Not Active
- **Issue:** User purchased but entitlement shows inactive
- **Solution:**
  - Check entitlement identifier matches code (`premium` or `subscriber`)
  - Verify products are attached to entitlement
  - Check RevenueCat dashboard for purchase status
  - Verify webhook processed the purchase event

### Purchase Fails on Web
- **Issue:** `purchasePackage()` fails on web platform
- **Solution:**
  - Verify `NEXT_PUBLIC_REVENUECAT_WEB_API_KEY` is set correctly (for web)
  - Verify `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` is set correctly (for iOS)
  - Check browser console for which API key is being used
  - Check browser console for errors
  - Verify RevenueCat is initialized with correct user ID
  - Check that offerings are available (not null)
  - Verify package identifiers match

## Code References

After configuration, verify these code locations match your RevenueCat setup:

1. **Package Identifiers** (`app/signup/payment/page.tsx:68`)
   ```typescript
   const packageIdentifier = selectedPlan === "monthly" ? "$rc_monthly" : "$rc_annual";
   ```
   - Must match package identifiers in RevenueCat offering

2. **Entitlement Checking** (`app/api/payments/revenuecat-sync/route.ts:57`)
   ```typescript
   const entitlements = customerInfo.entitlements || {};
   const hasActiveEntitlement = Object.values(entitlements).some(
     (entitlement: any) => entitlement.is_active === true
   );
   ```
   - Checks for any active entitlement (works with `premium` or `subscriber`)

3. **Webhook Processing** (`app/api/webhooks/revenuecat/route.ts:116`)
   ```typescript
   const entitlements = event.entitlements || {};
   const hasActiveEntitlement = Object.values(entitlements).some(
     (entitlement: any) => entitlement.is_active === true
   );
   ```
   - Processes entitlement status from webhook events

## Additional Resources

- [RevenueCat Web Billing Documentation](https://www.revenuecat.com/docs/web)
- [RevenueCat Dashboard Guide](https://www.revenuecat.com/docs/dashboard)
- [RevenueCat Webhooks Guide](https://www.revenuecat.com/docs/webhooks)
- [RevenueCat Stripe Integration](https://www.revenuecat.com/docs/integrations/stripe)

## Support

If you encounter issues:
1. Check RevenueCat dashboard for error messages
2. Review server logs for webhook processing errors
3. Check browser console for client-side errors
4. Verify all environment variables are set correctly
5. Test with RevenueCat's sandbox/test mode first

