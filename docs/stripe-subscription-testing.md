# Stripe Subscription Flow – Test & Monitoring Checklist

Use this playbook any time you ship changes to the billing flow.

## 1. Prerequisites
- Install the [Stripe CLI](https://stripe.com/docs/stripe-cli).
- Export the same test keys configured in `.env.local`:
  ```bash
  export STRIPE_SECRET_KEY=sk_test_xxx
  export STRIPE_WEBHOOK_SECRET=whsec_xxx
  ```
- In another terminal tab, run the webhook forwarder:
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```

## 2. Happy-path checkout
1. Start the app locally: `npm run dev`.
2. Visit `http://localhost:3000/signup/plans`, pick the monthly plan.
3. Complete the payment with any Stripe test card (e.g. `4242 4242 4242 4242`).
4. Confirm:
   - `/api/payments/create-subscription` returns a `clientSecret`.
   - The Payment Element finishes without errors.
   - `stripe_subscriptions` row is created, `user_profiles.user_type` becomes `subscriber`.
   - `stripe_webhook_events` logs `customer.subscription.created`, `invoice.payment_succeeded`.

## 3. Failing payment
1. From the same webhook listener session run:
   ```bash
   stripe trigger invoice.payment_failed
   ```
2. Verify the user is redirected back to `/signup/plans` on next page load and
   `stripe_webhook_events.status = 'processed'` with `invoice.payment_failed`.

## 4. Cancellation
1. Open the billing portal via `Settings → Manage payment method`.
2. Cancel the subscription inside Stripe’s portal (pick “end of period”).
3. Confirm `customer.subscription.updated` is logged and `stripe_subscriptions.status`
   transitions to `canceled`.

## 5. Regression guard (automated smoke)
Run the built-in Stripe CLI triggers. They will exercise the webhook handler without
touching the UI, and populate `stripe_webhook_events` for audit:
```bash
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```
Check Supabase for the matching rows:
```sql
select event_type, status, processed_at
from stripe_webhook_events
order by processed_at desc
limit 10;
```

## 6. Monitoring tips
- Hook Supabase alerts (or a cron job) to monitor `stripe_webhook_events` for
  `status = 'failed'`.
- Grafana / Metabase dashboards can source from `stripe_subscriptions` &
  `stripe_webhook_events` to track active subscribers, churn, and recent failures.

Document results (pass/fail, Stripe CLI output) in your release ticket before pushing to production.

