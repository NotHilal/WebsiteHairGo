# Stripe Payment Setup

## 1. Create a Stripe account
Go to https://stripe.com and sign up. You'll need to add your business details to accept real payments.
For testing, you can use test mode immediately (no business verification needed).

## 2. Get your keys
In the Stripe dashboard → Developers → API keys:
- **Publishable key** (starts with `pk_`) → goes in your `.env` file (frontend, safe to expose)
- **Secret key** (starts with `sk_`) → goes in Supabase secrets ONLY, never in the frontend

## 3. Add environment variables to `.env`
Create a `.env` file in `hairgo/` (copy from `.env.example` if it exists):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...   ← add this
```

## 4. Run the SQL schema
Payment columns are already included in `supabase/full-schema.sql` — see SETUP.md.

## 5. Deploy the Edge Functions
Install the Supabase CLI if you haven't: https://supabase.com/docs/guides/cli

```bash
# Login to Supabase CLI
npx supabase login

# Link your project (find your project ref in Supabase dashboard → Settings)
npx supabase link --project-ref YOUR_PROJECT_REF

# Set the Stripe secret key as a secret (never commit this to git)
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...

# Deploy the payment functions
npx supabase functions deploy create-payment-intent
npx supabase functions deploy book-in-store
npx supabase functions deploy stripe-webhook
```

## 6. Set up the Stripe webhook (for payment confirmation backup)
In Stripe Dashboard → Developers → Webhooks → Add endpoint:
- **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
- **Events to listen**: `payment_intent.succeeded`, `payment_intent.payment_failed`

After creating it, copy the **Webhook signing secret** (starts with `whsec_`) and add it:
```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

## 7. Test with Stripe test cards
In test mode, use these card numbers:
- **Success**: `4242 4242 4242 4242` — any future expiry, any CVC
- **3D Secure**: `4000 0025 0000 3155`
- **Decline**: `4000 0000 0000 9995`

## 8. Go live
When ready to accept real payments:
1. Complete Stripe's business verification
2. Switch to live mode in Stripe dashboard
3. Replace your keys with the live versions (`pk_live_...`, `sk_live_...`)
4. Update the webhook endpoint to use live mode
5. Re-run `supabase secrets set` with the live secret key and webhook secret

---

## Architecture summary
```
User clicks Pay
  → Frontend calls Supabase Edge Function (create-payment-intent)
  → Edge Function calls Stripe API with secret key
  → Returns client_secret to frontend
  → Stripe Elements payment form appears (card number, etc.)
  → User completes payment
  → On success: appointment/preorder inserted to DB with payment_intent_id
  → Stripe webhook fires → updates payment_status to 'paid' (backup confirmation)
```
