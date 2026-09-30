import { createClient } from '@supabase/supabase-js';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const photo = (id, width = 760) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=82`;
const examples = [
  { id: 'preview-1', brand: 'TaylorMade', title: 'Stealth 2 Plus Driver', category: 'Drivers', condition: 'Ultra', price_cents: 32900, quantity: 1, image_url: photo('photo-1593113598332-cd288d649433'), created_at: '2026-08-01T10:00:00Z' },
  { id: 'preview-2', brand: 'Titleist', title: 'T200 Forged Iron Set', category: 'Irons', condition: 'Pro', price_cents: 68500, quantity: 1, image_url: photo('photo-1535131749006-b7f58c99034b'), created_at: '2026-08-02T10:00:00Z' },
  { id: 'preview-3', brand: 'Callaway', title: 'Jaws Raw Chrome Wedge', category: 'Wedges', condition: 'Ultra', price_cents: 10900, quantity: 2, image_url: photo('photo-1593113598332-cd288d649433'), created_at: '2026-08-03T10:00:00Z' },
  { id: 'preview-4', brand: 'PING', title: 'Hoofer Stand Bag', category: 'Bags', condition: 'Pro', price_cents: 15900, quantity: 1, image_url: photo('photo-1587174486073-ae5e5cff23aa'), created_at: '2026-08-04T10:00:00Z' },
  { id: 'preview-5', brand: 'Odyssey', title: 'White Hot OG Putter', category: 'Putters', condition: 'Basic', price_cents: 9500, quantity: 1, image_url: photo('photo-1592919505780-303950717480'), created_at: '2026-08-05T10:00:00Z' },
  { id: 'preview-6', brand: 'Cobra', title: 'AEROJET LS Fairway Wood', category: 'Drivers', condition: 'Pro', price_cents: 18900, quantity: 1, image_url: photo('photo-1535131749006-b7f58c99034b'), created_at: '2026-08-06T10:00:00Z' },
  { id: 'preview-7', brand: 'FootJoy', title: 'Premiere Series Golf Shoes', category: 'Apparel', condition: 'Basic', price_cents: 7800, quantity: 1, image_url: photo('photo-1592919505780-303950717480'), created_at: '2026-08-07T10:00:00Z' },
  { id: 'preview-8', brand: 'Mizuno', title: 'JPX 923 Tour Iron Set', category: 'Irons', condition: 'Ultra', price_cents: 74900, quantity: 1, image_url: photo('photo-1535131749006-b7f58c99034b'), created_at: '2026-08-08T10:00:00Z' },
];

const state = { client: null, user: null, products: [], demo: true, stripe: false, condition: 'All', category: '', query: '', sort: 'featured', cart: readCart(), pendingIntent: null };
const $ = (selector) => document.querySelector(selector);
const grid = $('#product-grid');
const cartPanel = $('#cart-panel');
const authDialog = $('#auth-dialog');
const listingDialog = $('#listing-dialog');
let toastTimer;

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem('ssc-cart') || '[]');
    return Array.isArray(items) ? items.filter((item) => typeof item.id === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0).slice(0, 10) : [];
  } catch { return []; }
}

function saveCart() {
  localStorage.setItem('ssc-cart', JSON.stringify(state.cart));
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3300);
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function productImage(product) {
  return safeImageUrl(product.image_url) || photo('photo-1593113598332-cd288d649433', 600);
}

function syncPreviewBanner() {
  const banner = $('#preview-banner');
  if (state.demo) {
    banner.hidden = false;
    banner.textContent = '';
    const marker = document.createElement('span');
    marker.className = 'preview-mark';
    marker.textContent = 'i';
    const copy = document.createElement('span');
    const heading = document.createElement('strong');
    heading.textContent = 'Preview collection. ';
    copy.append(heading, document.createTextNode('Example listings are for display. Connect Supabase and Stripe to sell items and take payments.'));
    banner.append(marker, copy);
  } else if (!state.stripe) {
    banner.hidden = false;
    banner.textContent = '';
    const marker = document.createElement('span');
    marker.className = 'preview-mark';
    marker.textContent = 'i';
    const copy = document.createElement('span');
    const heading = document.createElement('strong');
    heading.textContent = 'Checkout is in preview. ';
    copy.append(heading, document.createTextNode('Connect Stripe to accept payments for live listings.'));
    banner.append(marker, copy);
  } else {
    banner.hidden = true;
  }
}

function makeProductCard(product, index) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.style.animationDelay = `${Math.min(index, 8) * 35}ms`;

  const imageWrap = document.createElement('div');
  imageWrap.className = 'product-image-wrap';
  const image = document.createElement('img');
  image.className = 'product-image';
  image.src = productImage(product);
  image.alt = `${product.brand} ${product.title}`;
  image.loading = index < 4 ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => { image.src = photo('photo-1535131749006-b7f58c99034b', 500); }, { once: true });

  const badge = document.createElement('span');
  badge.className = 'condition-badge';
  badge.textContent = product.condition || 'Pro';
  imageWrap.append(image, badge);
  if (product.quantity > 1) {
    const stock = document.createElement('span');
    stock.className = 'stock-note';
    stock.textContent = `${product.quantity} available`;
    imageWrap.append(stock);
  }
  const add = document.createElement('button');
  add.className = 'quick-add';
  add.type = 'button';
  add.setAttribute('aria-label', `Add ${product.title} to your bag`);
  add.title = 'Add to bag';
  add.textContent = '+';
  add.addEventListener('click', () => addToCart(product));
  imageWrap.append(add);

  const details = document.createElement('div');
  details.className = 'product-details';
  const meta = document.createElement('div');
  meta.className = 'product-meta';
  const brand = document.createElement('span');
  brand.textContent = product.brand;
  const rating = document.createElement('span');
  rating.className = 'product-rating';
  rating.textContent = `✳  ${product.category}`;
  meta.append(brand, rating);
  const name = document.createElement('h3');
  name.className = 'product-name';
  name.textContent = product.title;
  const priceRow = document.createElement('div');
  priceRow.className = 'product-bottom';
  const price = document.createElement('span');
  price.className = 'product-price';
  price.textContent = money.format(product.price_cents / 100);
  priceRow.append(price);
  details.append(meta, name, priceRow);
  card.append(imageWrap, details);
  return card;
}

function filteredProducts() {
  let products = [...state.products];
  if (state.condition !== 'All') products = products.filter((product) => product.condition === state.condition);
  if (state.category) products = products.filter((product) => product.category === state.category);
  if (state.query) {
    const search = state.query.toLocaleLowerCase();
    products = products.filter((product) => `${product.title} ${product.brand} ${product.category}`.toLocaleLowerCase().includes(search));
  }
  if (state.sort === 'price-low') products.sort((a, b) => a.price_cents - b.price_cents);
  if (state.sort === 'price-high') products.sort((a, b) => b.price_cents - a.price_cents);
  if (state.sort === 'newest') products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return products;
}

function renderProducts() {
  const products = filteredProducts();
  grid.replaceChildren(...products.map(makeProductCard));
  grid.hidden = products.length === 0;
  $('#empty-results').hidden = products.length > 0;
  $('#result-count').textContent = `${products.length} ${products.length === 1 ? 'piece' : 'pieces'} of good gear`;
  const filters = $('#active-filters');
  filters.replaceChildren();
  const active = [...(state.category ? [{ key: 'category', text: state.category }] : []), ...(state.condition !== 'All' ? [{ key: 'condition', text: state.condition }] : [])];
  for (const filter of active) {
    const chip = document.createElement('button');
    chip.className = 'active-filter';
    chip.type = 'button';
    chip.textContent = `${filter.text}  ×`;
    chip.addEventListener('click', () => {
      if (filter.key === 'category') state.category = '';
      else { state.condition = 'All'; document.querySelector('[data-condition="All"]').classList.add('is-selected'); document.querySelectorAll('[data-condition]:not([data-condition="All"])').forEach((el) => el.classList.remove('is-selected')); }
      renderProducts();
    });
    filters.append(chip);
  }
}

function cartProduct(id) {
  return state.products.find((product) => product.id === id);
}

function renderCart() {
  state.cart = state.cart.filter((item) => cartProduct(item.id));
  const count = state.cart.reduce((total, item) => total + item.quantity, 0);
  $('#cart-count').textContent = String(count);
  $('#cart-button').setAttribute('aria-label', `Shopping bag, ${count} ${count === 1 ? 'item' : 'items'}`);
  const contents = $('#cart-items');
  contents.replaceChildren();
  let subtotal = 0;
  if (!state.cart.length) {
    const empty = document.createElement('p');
    empty.className = 'cart-empty';
    const heading = document.createElement('strong');
    heading.textContent = 'Room for the next great find.';
    empty.append(heading, document.createTextNode('Your bag is waiting for a little golf magic.'));
    contents.append(empty);
  }
  for (const item of state.cart) {
    const product = cartProduct(item.id);
    subtotal += product.price_cents * item.quantity;
    const line = document.createElement('div');
    line.className = 'cart-line';
    const image = document.createElement('img');
    image.src = productImage(product);
    image.alt = '';
    image.loading = 'lazy';
    const info = document.createElement('div');
    info.className = 'cart-line-info';
    const brand = document.createElement('span');
    brand.className = 'cart-line-brand';
    brand.textContent = product.brand;
    const name = document.createElement('span');
    name.className = 'cart-line-name';
    name.textContent = product.title;
    const price = document.createElement('span');
    price.className = 'cart-line-price';
    price.textContent = money.format(product.price_cents / 100);
    const quantity = document.createElement('div');
    quantity.className = 'quantity-control';
    const decrease = document.createElement('button');
    decrease.type = 'button';
    decrease.setAttribute('aria-label', `Remove one ${product.title}`);
    decrease.textContent = '−';
    decrease.addEventListener('click', () => changeQuantity(product.id, -1));
    const number = document.createElement('span');
    number.textContent = String(item.quantity);
    const increase = document.createElement('button');
    increase.type = 'button';
    increase.setAttribute('aria-label', `Add one ${product.title}`);
    increase.textContent = '+';
    increase.disabled = item.quantity >= product.quantity;
    increase.addEventListener('click', () => changeQuantity(product.id, 1));
    quantity.append(decrease, number, increase);
    info.append(brand, name, price, quantity);
    const remove = document.createElement('button');
    remove.className = 'remove-line';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${product.title} from bag`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeFromCart(product.id));
    line.append(image, info, remove);
    contents.append(line);
  }
  $('#cart-total').textContent = money.format(subtotal / 100);
  $('#checkout-button').disabled = count === 0;
  saveCart();
}

function addToCart(product) {
  const existing = state.cart.find((item) => item.id === product.id);
  if (existing) {
    if (existing.quantity >= product.quantity) return showToast('That’s the full available quantity for this listing.');
    existing.quantity += 1;
  } else {
    state.cart.push({ id: product.id, quantity: 1 });
  }
  renderCart();
  showToast(`${product.brand} added to your bag.`);
}

function changeQuantity(id, amount) {
  const item = state.cart.find((entry) => entry.id === id);
  const product = cartProduct(id);
  if (!item || !product) return;
  item.quantity += amount;
  if (item.quantity < 1) state.cart = state.cart.filter((entry) => entry.id !== id);
  else if (item.quantity > product.quantity) item.quantity = product.quantity;
  renderCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((item) => item.id !== id);
  renderCart();
}

function setAuthMode(mode) {
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.mode === mode));
  $('#auth-title').textContent = mode === 'signup' ? 'Join the club.' : 'Welcome back.';
  $('#auth-submit').firstChild.textContent = mode === 'signup' ? 'Create account ' : 'Sign in ';
  $('#auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#auth-form').dataset.mode = mode;
  setMessage($('#auth-message'), '');
}

function openAuth(intent = null) {
  state.pendingIntent = intent;
  setAuthMode('signin');
  if (!state.client) {
    showToast('Accounts are in preview. Connect Supabase to sign in securely.');
    return;
  }
  if (!authDialog.open) authDialog.showModal();
  $('#auth-email').focus();
}

function openCart() {
  cartPanel.classList.add('is-open');
  cartPanel.setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#close-cart').focus();
}

function closeCart() {
  cartPanel.classList.remove('is-open');
  cartPanel.setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
  document.body.style.overflow = '';
  $('#cart-button').focus();
}

async function checkout() {
  if (!state.cart.length) return;
  if (!state.client || !state.stripe) {
    closeCart();
    showToast(state.demo ? 'Preview only. Connect Supabase and Stripe to enable live checkout.' : 'Connect Stripe to enable secure checkout.');
    return;
  }
  if (!state.user) {
    closeCart();
    return openAuth('checkout');
  }
  const button = $('#checkout-button');
  button.disabled = true;
  button.firstChild.textContent = 'Securing your items… ';
  try {
    const { data: { session }, error: sessionError } = await state.client.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error('Sign in again to continue to checkout.');
    const response = await fetch('/api/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ items: state.cart.map(({ id, quantity }) => ({ id, quantity })) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Secure checkout could not start.');
    window.location.assign(result.url);
  } catch (error) {
    showToast(error.message || 'Secure checkout could not start.');
    button.disabled = false;
    button.firstChild.textContent = 'Head to checkout ';
  }
}

async function createListing(form) {
  if (!state.client || !state.user) return;
  const fields = new FormData(form);
  const imageValue = String(fields.get('imageUrl') || '').trim();
  if (imageValue && !safeImageUrl(imageValue)) throw new Error('Please use a secure HTTPS URL for your photo.');
  const price = Math.round(Number(fields.get('price')) * 100);
  const quantity = Number(fields.get('quantity'));
  if (!Number.isSafeInteger(price) || price < 100 || price > 1_000_000) throw new Error('Enter a price between $1 and $10,000.');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Enter a quantity from 1 to 20.');
  const listing = {
    seller_id: state.user.id,
    title: String(fields.get('title')).trim(),
    brand: String(fields.get('brand')).trim(),
    category: fields.get('category'),
    condition: fields.get('condition'),
    quantity,
    price_cents: price,
    image_url: imageValue || null,
  };
  const { error } = await state.client.from('listings').insert(listing);
  if (error) throw new Error('Your listing could not be published. Check the details and try again.');
  listingDialog.close();
  form.reset();
  showToast('Your listing is live. Nice one.');
  await loadListings();
  renderProducts();
}

async function loadListings() {
  if (!state.client) {
    state.products = examples;
    state.demo = true;
    syncPreviewBanner();
    renderProducts();
    renderCart();
    return;
  }
  const { data, error } = await state.client.from('listings')
    .select('id,title,brand,category,condition,price_cents,quantity,image_url,created_at')
    .eq('is_active', true).gt('quantity', 0).order('created_at', { ascending: false }).limit(48);
  if (error) {
    state.products = examples;
    state.demo = true;
    showToast('Live listings could not load. Showing the preview collection.');
  } else {
    state.products = data || [];
    state.demo = false;
  }
  syncPreviewBanner();
  renderProducts();
  renderCart();
}

function runPendingIntent() {
  const intent = state.pendingIntent;
  state.pendingIntent = null;
  if (intent === 'sell') listingDialog.showModal();
  if (intent === 'checkout') openCart();
}

async function initialize() {
  const banner = $('#preview-banner');
  grid.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    if (config.supabaseUrl && config.supabaseAnonKey) {
      state.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      });
      state.stripe = config.stripeConfigured === true;
      state.client.auth.onAuthStateChange((event, session) => {
        state.user = session?.user || null;
        $('#account-button').querySelector('span').textContent = state.user ? 'Sign out' : 'Sign in';
        if (state.user && ['SIGNED_IN', 'INITIAL_SESSION'].includes(event) && state.pendingIntent) {
          authDialog.close();
          runPendingIntent();
        }
      });
      const { data } = await state.client.auth.getSession();
      state.user = data.session?.user || null;
      $('#account-button').querySelector('span').textContent = state.user ? 'Sign out' : 'Sign in';
      state.stripe = config.stripeConfigured === true;
    }
  } catch {
    state.client = null;
  }

  await loadListings();
  grid.setAttribute('aria-busy', 'false');
  if (banner.hidden && !state.stripe) syncPreviewBanner();
  const checkoutStatus = new URLSearchParams(location.search).get('checkout');
  if (checkoutStatus === 'success') showToast('Payment received. Your Stripe receipt is on its way.');
  else if (checkoutStatus === 'cancelled') showToast('Checkout cancelled. Your bag is still here.');
  if (checkoutStatus) history.replaceState({}, '', location.pathname + location.hash);
}

document.querySelectorAll('[data-condition]').forEach((button) => button.addEventListener('click', () => {
  state.condition = button.dataset.condition;
  document.querySelectorAll('[data-condition]').forEach((item) => item.classList.toggle('is-selected', item === button));
  renderProducts();
}));

document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => {
  state.category = state.category === button.dataset.category ? '' : button.dataset.category;
  renderProducts();
  location.hash = '#shop';
}));

$('#search-input').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderProducts(); });
$('#sort-select').addEventListener('change', (event) => { state.sort = event.target.value; renderProducts(); });
$('#reset-filters').addEventListener('click', () => {
  state.condition = 'All';
  state.category = '';
  state.query = '';
  $('#search-input').value = '';
  $('#sort-select').value = 'featured';
  document.querySelectorAll('[data-condition]').forEach((button) => button.classList.toggle('is-selected', button.dataset.condition === 'All'));
  renderProducts();
});
$('#clear-search').addEventListener('click', () => $('#reset-filters').click());
$('#cart-button').addEventListener('click', openCart);
$('#close-cart').addEventListener('click', closeCart);
$('#scrim').addEventListener('click', closeCart);
$('#checkout-button').addEventListener('click', checkout);
$('.search-toggle').addEventListener('click', () => { location.hash = '#shop'; setTimeout(() => $('#search-input').focus(), 80); });
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !authDialog.open && !listingDialog.open) {
    event.preventDefault(); location.hash = '#shop'; $('#search-input').focus();
  }
  if (event.key === 'Escape' && cartPanel.classList.contains('is-open')) closeCart();
});

$('#account-button').addEventListener('click', async () => {
  if (state.user && state.client) {
    const { error } = await state.client.auth.signOut();
    if (error) showToast('Sign out could not complete. Please try again.');
    else { state.user = null; $('#account-button').querySelector('span').textContent = 'Sign in'; showToast('You’ve signed out. See you next round.'); }
  } else openAuth();
});
$('#sell-button').addEventListener('click', () => {
  if (!state.client) return showToast('Listings are in preview. Connect Supabase to create a secure account and sell gear.');
  if (!state.user) return openAuth('sell');
  listingDialog.showModal();
});

document.querySelectorAll('.auth-tab').forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.mode)));
document.querySelectorAll('.app-dialog').forEach((dialog) => {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
});

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const button = $('#auth-submit');
  const message = $('#auth-message');
  button.disabled = true;
  setMessage(message, '');
  try {
    const result = form.dataset.mode === 'signup'
      ? await state.client.auth.signUp({ email, password })
      : await state.client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (form.dataset.mode === 'signup' && !result.data.session) {
      setMessage(message, 'Check your inbox to confirm your email, then sign in.');
      return;
    }
    state.user = result.data.user;
    $('#account-button').querySelector('span').textContent = 'Sign out';
    authDialog.close();
    showToast(form.dataset.mode === 'signup' ? 'Welcome to the club. Check your email to verify your account.' : 'You’re signed in. Good to see you.');
    runPendingIntent();
  } catch (error) {
    setMessage(message, error.message || 'We couldn’t sign you in. Try again.', true);
  } finally {
    button.disabled = false;
  }
});

$('#listing-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#listing-submit');
  const message = $('#listing-message');
  button.disabled = true;
  setMessage(message, '');
  try {
    await createListing(form);
  } catch (error) {
    setMessage(message, error.message || 'Your listing could not be published.', true);
  } finally {
    button.disabled = false;
  }
});

initialize();
