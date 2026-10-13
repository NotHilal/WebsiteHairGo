# HairGo — Setup Guide

## 1. Supabase database

In **Supabase → SQL Editor**, run these files in order (each is safe to re-run):

1. `supabase/full-schema.sql` — tables, base policies, storage, cron jobs
2. `supabase/security-hardening.sql` — locks down roles, coupons, stock and payments
3. `supabase/fix-2026-10-13.sql` — server-side bookings, loyalty points, payroll, overlap protection

Before step 3 on an existing database, check for overlapping bookings (the file
prints a query to find them if any exist). The overlap rule is only switched on
once there are none.

Enable **Database → Extensions → pg_cron** before step 1.

## 2. Environment variables (`.env`)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

These are baked into the build, so rebuild after changing them.

## 3. Edge function secrets

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase secrets set RESEND_FROM_EMAIL="HairGo <bookings@yourdomain>"
npx supabase secrets set STUDIO_TOTP_SECRET=BASE32SECRET       # studio login code
npx supabase secrets set ALLOWED_ORIGIN=https://yourdomain      # CORS for the functions
```

Deploy all functions:

```bash
npx supabase functions deploy create-payment-intent
npx supabase functions deploy book-in-store
npx supabase functions deploy stripe-webhook
npx supabase functions deploy process-refund
npx supabase functions deploy send-appointment-confirmation
npx supabase functions deploy update-user-role
npx supabase functions deploy verify-studio-otp
```

See `STRIPE_SETUP.md` for the Stripe webhook.

## 4. Supabase Auth URLs

In **Authentication → URL Configuration** set the Site URL to your domain and
add `https://yourdomain/reset-password` to the redirect URLs.

## 5. Build and host (o2switch)

```bash
npm install
npm run build
```

Upload the contents of `dist/` to the site folder, including the hidden
`.htaccess` file (it sends every page URL to `index.html` and forces HTTPS).

## 6. First admin account

1. Register at `/register`
2. In Supabase → Table Editor → `profiles`, set your `role` to `admin`
3. Add the `STUDIO_TOTP_SECRET` to an authenticator app
4. Sign in at `/studio` with your email, password and the 6-digit code

## 7. How things work

- **Bookings:** customers and guests book through the `book-in-store` and
  `create-payment-intent` functions. The server checks opening hours
  (every day 9:00–18:00), days off, blocked hours and
  overlapping bookings, and works out the price and coupon. Opening hours are
  defined in `src/lib/hours.js` and `supabase/functions/_shared/booking.ts`.
- **Loyalty:** each completed visit adds 1 point (done by the database); every
  5th visit creates a personal 30% coupon. Admins can adjust visits in `/studio/users`.
- **Coupons:** tick "Public promo code" for codes anyone can use; leave it
  unticked for coupons you assign to specific clients.
- **Store:** customers pay online or reserve to pay in store within 7 days.
  Unpaid reservations expire hourly and their stock is returned.
- **Payroll:** hours are clock-in to clock-out minus a 30-minute break on shifts
  of 6 hours or more (`src/lib/pay.js`). Hourly rates are private
  (`stylist_rates` table). Tips/commissions are kept as history once paid.
- **Days off:** artists request them; admins/managers approve. Approval is
  refused while the stylist still has bookings that day.
