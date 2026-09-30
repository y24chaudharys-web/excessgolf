import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 4242;
const root = dirname(fileURLToPath(import.meta.url));
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const checkoutAttempts = new Map();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'", 'https:'],
      formAction: ["'self'", 'https://checkout.stripe.com'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
}));

function requireCheckoutProviders(req, res, next) {
  if (!supabaseAdmin || !stripe || !stripeWebhookSecret) {
    return res.status(503).json({ error: 'Checkout is not configured yet. Add Supabase and Stripe server credentials.' });
  }
  next();
}

function checkoutRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const attempt = checkoutAttempts.get(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 12) {
    return res.status(429).json({ error: 'Too many checkout attempts. Please try again shortly.' });
  }
  checkoutAttempts.set(key, attempt && attempt.resetAt > now
    ? { count: attempt.count + 1, resetAt: attempt.resetAt }
    : { count: 1, resetAt: now + 60_000 });
  if (checkoutAttempts.size > 3000) {
    for (const [address, value] of checkoutAttempts) {
      if (value.resetAt <= now) checkoutAttempts.delete(address);
    }
  }
  next();
}

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    supabaseUrl: supabaseUrl || '',
    supabaseAnonKey: supabaseAnonKey || '',
    stripeConfigured: Boolean(stripe && stripeWebhookSecret),
  });
});

app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (!stripe || !stripeWebhookSecret || !supabaseAdmin) {
    return res.status(503).send('Payment webhooks are not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], stripeWebhookSecret);
  } catch {
    return res.status(400).send('Invalid webhook signature.');
  }

  try {
    const session = event.data.object;
    const reservationId = session.metadata?.reservation_id;
    if (reservationId && event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
      const { error } = await supabaseAdmin.rpc('complete_inventory_reservation', { p_reservation_id: reservationId });
      if (error) throw error;
    } else if (reservationId && event.type === 'checkout.session.expired') {
      const { error } = await supabaseAdmin.rpc('release_inventory_reservation', { p_reservation_id: reservationId });
      if (error) throw error;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook could not update the order.', error.message);
    res.status(500).json({ error: 'Order update failed. Stripe will retry the event.' });
  }
});

app.use(express.json({ limit: '12kb', strict: true }));

app.post('/api/checkout-session', requireCheckoutProviders, checkoutRateLimit, async (req, res) => {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([\w.-]+)$/i);
  if (!match) return res.status(401).json({ error: 'Sign in before checking out.' });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(match[1]);
  if (authError || !authData?.user) return res.status(401).json({ error: 'Your session expired. Sign in again.' });

  const items = req.body?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
    return res.status(400).json({ error: 'Add between 1 and 10 items to your bag.' });
  }

  const normalizedItems = [];
  const seenIds = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || seenIds.has(item.id)) {
      return res.status(400).json({ error: 'Your bag contains an invalid item or quantity.' });
    }
    seenIds.add(item.id);
    normalizedItems.push({ id: item.id, quantity: item.quantity });
  }

  const { data: reservations, error: reserveError } = await supabaseAdmin.rpc('reserve_inventory', {
    p_user_id: authData.user.id,
    p_items: normalizedItems,
  });
  if (reserveError || !reservations?.[0]?.reservation_id || !Array.isArray(reservations[0].items)) {
    return res.status(409).json({ error: reserveError?.message?.includes('INSUFFICIENT_STOCK')
      ? 'That item no longer has enough stock. Refresh the collection and try again.'
      : 'We could not reserve those items. Refresh the collection and try again.' });
  }

  const reservationId = reservations[0].reservation_id;
  let session;
  try {
    const appUrl = process.env.PUBLIC_APP_URL;
    if (!appUrl) throw new Error('PUBLIC_APP_URL is required.');
    const origin = new URL(appUrl);
    if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') throw new Error('PUBLIC_APP_URL must use HTTPS.');

    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: reservations[0].items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: item.price_cents,
          product_data: {
            name: `${item.brand} ${item.title}`.slice(0, 240),
            ...(item.image_url ? { images: [item.image_url] } : {}),
          },
        },
      })),
      metadata: { reservation_id: reservationId, user_id: authData.user.id },
      payment_intent_data: { metadata: { reservation_id: reservationId } },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      success_url: `${origin.origin}/?checkout=success`,
      cancel_url: `${origin.origin}/?checkout=cancelled`,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');

    const { error: attachError } = await supabaseAdmin.rpc('attach_checkout_session', {
      p_reservation_id: reservationId,
      p_session_id: session.id,
    });
    if (attachError) throw attachError;
    res.json({ url: session.url });
  } catch (error) {
    await supabaseAdmin.rpc('release_inventory_reservation', { p_reservation_id: reservationId });
    console.error('Could not start Stripe Checkout.', error.message);
    res.status(502).json({ error: 'Secure checkout could not start. Your bag is unchanged; please try again.' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const distDirectory = join(root, 'dist');
  app.use(express.static(distDirectory, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res, next) => {
    if (req.accepts('html')) {
      res.set('Cache-Control', 'no-store');
      return res.sendFile(join(distDirectory, 'index.html'));
    }
    next();
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Second Shot Club API listening on http://localhost:${port}`);
});
