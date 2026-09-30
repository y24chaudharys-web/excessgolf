# Second Shot Club

A white-and-green golf resale marketplace for browsing used equipment, managing a shopping bag, listing gear, and paying securely through Stripe Checkout.

## Public preview

The static storefront is published at [https://y24chaudharys-web.github.io/excessgolf/](https://y24chaudharys-web.github.io/excessgolf/). Changes pushed to `main` are automatically built and deployed by GitHub Actions. This Pages version is a preview only; account, listing, and payment features require separately deployed Supabase and Stripe-backed API services.

## Run locally

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set the service credentials below.
3. Apply `supabase/schema.sql` in the Supabase SQL editor.
4. Run `npm run dev` and open the Vite URL printed in the terminal (usually `http://localhost:5173`).

With no credentials, the app displays sample listings in **preview mode**. Preview mode never accepts passwords, publishes listings, or charges cards.

## Connect Supabase and Stripe

- Create a Supabase project. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. The anon key may be exposed to the browser; the service-role key must remain server-side and must never be committed or sent to clients. Supabase email/password authentication handles accounts.
- Create a Stripe account and set `STRIPE_SECRET_KEY` and the webhook signing secret in `STRIPE_WEBHOOK_SECRET`. Configure a webhook at `https://YOUR_HOST/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.expired`.
- Set `PUBLIC_APP_URL` to the exact public origin; production deployments must use HTTPS. Run `npm run build` and then `npm start` to serve the built application and API.
- Schedule `public.release_expired_inventory_reservations()` to run every 10 minutes using a trusted Supabase scheduler. This restores quantities if checkout sessions expire or a webhook cannot be delivered.
- Configure Supabase email confirmation, password policy, and production URL/redirect allowlists before launch.

Checkout prices and stock are re-read and atomically reserved on the server. Stripe hosts the card form; a signature-verified webhook records paid orders and releases expired reservations. The marketplace account receives payments: seller onboarding and payouts, shipping/fulfilment, sales tax, refunds, and related legal/compliance work are not implemented. Address those operational requirements before accepting live payments. Start with Stripe test keys and a test webhook.
