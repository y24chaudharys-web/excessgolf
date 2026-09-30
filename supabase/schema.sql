-- Review before applying to an existing Supabase project.
-- Listings are public; reservations are private and writable only by the service role.

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 80),
  brand text not null check (char_length(brand) between 1 and 48),
  category text not null check (category in ('Drivers', 'Irons', 'Wedges', 'Putters', 'Bags', 'Apparel', 'Accessories', 'Other')),
  condition text not null check (condition in ('Basic', 'Pro', 'Ultra')),
  price_cents integer not null check (price_cents between 100 and 1000000),
  quantity integer not null check (quantity between 0 and 20),
  image_url text check (image_url is null or (image_url like 'https://%' and char_length(image_url) <= 500)),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index listings_public_catalog_idx on public.listings (created_at desc)
  where is_active = true and quantity > 0;
create index listings_seller_idx on public.listings (seller_id, created_at desc);

alter table public.listings enable row level security;

create policy "Anyone can browse available gear"
  on public.listings for select
  using ((is_active = true and quantity > 0) or seller_id = (select auth.uid()));

create policy "Signed-in sellers can list their own gear"
  on public.listings for insert to authenticated
  with check (seller_id = (select auth.uid()) and is_active = true and quantity > 0);

create policy "Sellers can update their own listings"
  on public.listings for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  checkout_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'released')),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  expires_at timestamptz not null default now() + interval '70 minutes',
  created_at timestamptz not null default now()
);

create index inventory_reservations_expiry_idx on public.inventory_reservations (expires_at)
  where status = 'pending';

alter table public.inventory_reservations enable row level security;

create function public.reserve_inventory(p_user_id uuid, p_items jsonb)
returns table (reservation_id uuid, items jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_request record;
  v_listing public.listings%rowtype;
  v_items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'INVALID_BAG';
  end if;

  for v_request in
    select (value ->> 'id')::uuid as id, (value ->> 'quantity')::integer as quantity
    from jsonb_array_elements(p_items)
    order by 1
  loop
    if v_request.quantity is null or v_request.quantity not between 1 and 20 then
      raise exception 'INVALID_QUANTITY';
    end if;
    select * into v_listing from public.listings
    where id = v_request.id and is_active = true
    for update;
    if not found or v_listing.quantity < v_request.quantity then
      raise exception 'INSUFFICIENT_STOCK';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_listing.id,
      'title', v_listing.title,
      'brand', v_listing.brand,
      'quantity', v_request.quantity,
      'price_cents', v_listing.price_cents,
      'image_url', v_listing.image_url
    ));
    update public.listings
    set quantity = quantity - v_request.quantity
    where id = v_listing.id;
  end loop;

  insert into public.inventory_reservations (id, user_id, items)
  values (v_id, p_user_id, v_items);
  return query select v_id, v_items;
end;
$$;

create function public.attach_checkout_session(p_reservation_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.inventory_reservations
  set checkout_session_id = p_session_id
  where id = p_reservation_id and status = 'pending' and checkout_session_id is null;
  if not found then raise exception 'RESERVATION_UNAVAILABLE'; end if;
end;
$$;

create function public.complete_inventory_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.inventory_reservations
  set status = 'paid'
  where id = p_reservation_id and status = 'pending';
end;
$$;

create function public.release_inventory_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb;
  v_item jsonb;
begin
  update public.inventory_reservations
  set status = 'released'
  where id = p_reservation_id and status = 'pending'
  returning items into v_items;
  if v_items is null then return; end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    update public.listings
    set quantity = least(quantity + (v_item ->> 'quantity')::integer, 20)
    where id = (v_item ->> 'id')::uuid;
  end loop;
end;
$$;

create function public.release_expired_inventory_reservations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reservation record;
  v_count integer := 0;
begin
  for v_reservation in
    select id from public.inventory_reservations
    where status = 'pending' and expires_at < now()
    for update skip locked
  loop
    perform public.release_inventory_reservation(v_reservation.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on public.inventory_reservations from anon, authenticated;
revoke execute on function public.reserve_inventory(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.attach_checkout_session(uuid, text) from public, anon, authenticated;
revoke execute on function public.complete_inventory_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.release_inventory_reservation(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_inventory_reservations() from public, anon, authenticated;
grant execute on function public.reserve_inventory(uuid, jsonb) to service_role;
grant execute on function public.attach_checkout_session(uuid, text) to service_role;
grant execute on function public.complete_inventory_reservation(uuid) to service_role;
grant execute on function public.release_inventory_reservation(uuid) to service_role;
grant execute on function public.release_expired_inventory_reservations() to service_role;
