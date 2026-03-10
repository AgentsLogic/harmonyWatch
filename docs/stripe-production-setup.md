# Stripe Production Setup Guide

## Prerequisites

Before switching to production Stripe keys, ensure you have:
- A Stripe account with live mode enabled
- Production API keys from your Stripe Dashboard
- Production price IDs (not product IDs) for monthly and yearly plans
- A production webhook endpoint URL

## Step 1: Get Production API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **API keys**
2. Make sure you're in **Live mode** (toggle in top right)
3. Copy your **Publishable key** (starts with `pk_live_`)
4. Copy your **Secret key** (starts with `sk_live_`)

## Step 2: Get Production Price IDs

1. In Stripe Dashboard → **Products**
2. Find your Monthly and Yearly products
3. Click on each product to see its prices
4. Copy the **Price ID** (starts with `price_`) for each plan
   - **Note**: You need the Price ID, not the Product ID (`prod_`)

## Step 3: Set Up Production Webhook Endpoint

1. In Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your production URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.created`
5. Click **Add endpoint**
6. Click **Reveal signing secret** and copy the `whsec_...` value

## Step 4: Update Environment Variables

Update your `.env.local` (for local testing) and production environment variables:

```bash
# Production Stripe Keys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Production Price IDs (get from Stripe Dashboard)
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_YEARLY_PRICE_ID=price_...

# Production Webhook Secret (from webhook endpoint)
STRIPE_WEBHOOK_SECRET=whsec_...

# Production App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

## Step 5: Important Notes

### ⚠️ Testing
- **Stripe CLI only works with test keys** - you cannot use `stripe listen` with production keys
- Test thoroughly in test mode before switching to production
- Consider using Stripe's test cards in test mode first

### 🔒 Security
- **Never commit production keys to git**
- Use environment variables or secure secret management
- Rotate keys if they're ever exposed

### 📊 Monitoring
- Monitor webhook deliveries in Stripe Dashboard
- Set up alerts for failed webhook deliveries
- Check your application logs for webhook processing errors

### 🔄 Rollback Plan
- Keep test keys available for quick rollback
- Document the exact steps to switch back if needed

## Step 6: Verify Production Setup

1. **Test a small transaction** first (if possible, use a real card you control)
2. **Check webhook deliveries** in Stripe Dashboard → Webhooks
3. **Verify database records** - check that `stripe_customers` and `stripe_subscriptions` tables are being populated
4. **Monitor logs** for any errors during subscription creation

## Troubleshooting

### Webhooks not arriving
- Verify webhook endpoint URL is correct and accessible
- Check that webhook secret matches the endpoint
- Ensure your server is running and accessible from the internet

### "No such price" errors
- Verify you're using Price IDs (`price_...`) not Product IDs (`prod_...`)
- Ensure price IDs are from live mode, not test mode
- Check that prices are active in Stripe Dashboard

### Client secret not returned
- Check server logs for subscription creation errors
- Verify Stripe secret key has correct permissions
- Ensure payment behavior is set correctly in subscription creation

