# HairGo

Website and staff studio for HairGo, a hair salon in Auckland.

- **Customers:** book appointments (pay online or in store, guests welcome),
  buy products for pickup, loyalty rewards, messages with the team.
- **Studio (`/studio`):** schedule, appointments, days off, timesheets and pay
  runs, sales, store orders, coupons, gallery and site content. Roles: admin,
  manager, artist.

Built with React + Vite + Tailwind, Supabase (database, auth, edge functions),
Stripe and Resend.

```bash
npm install
npm run dev     # local development
npm run build   # production build in dist/
npm run lint
```

Setup, deployment and how the main features work: see [SETUP.md](SETUP.md).
Stripe: see [STRIPE_SETUP.md](STRIPE_SETUP.md).
