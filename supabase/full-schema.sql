-- =========================================================================
-- HairGo — Consolidated Schema (rebuilt for the new "hairgo" Sydney project)
--
-- This replaces supabase-schema.sql + all the loose migration files in this
-- folder. It was reconstructed from the application source code because the
-- live database (wrong-region "HairGo" project) had several tables created
-- directly via the Supabase dashboard that were never saved to a .sql file:
-- tickets, ticket_messages, blocked_hours, salon_settings, timesheets, pay_runs.
--
-- Run this ONCE, top to bottom, in the SQL Editor of the new Supabase project.
-- Then run security-hardening.sql — it replaces several policies below.
-- =========================================================================

create extension if not exists pgcrypto;

-- =========================================================================
-- TABLES
-- =========================================================================

-- Profiles (extends auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  email       text,
  role        text default 'user' check (role in ('user', 'admin', 'artist', 'manager')),
  points      integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Stylists
create table if not exists stylists (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  title                 text,
  bio                   text,
  photo_url             text,
  specialties           text[],
  instagram             text,
  display_order         integer default 0,
  featured              boolean default false,
  profile_id            uuid references profiles(id) on delete set null,
  quota_days_override   integer,
  quota_hours_override  integer,
  hourly_rate           decimal(10,2),
  created_at            timestamptz default now()
);

-- Services
create table if not exists services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       decimal(10,2),
  duration    integer default 60,
  category    text,
  active      boolean default true,
  featured    boolean default false,
  image_url   text,
  gender      text not null default 'mixed' check (gender in ('man', 'woman', 'mixed')),
  created_at  timestamptz default now()
);

-- Gallery categories
create table if not exists gallery_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#C9A84C',
  created_at timestamptz default now()
);

-- Product categories
create table if not exists product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#C9A84C',
  created_at timestamptz default now()
);

-- Gallery
create table if not exists gallery (
  id             uuid primary key default gen_random_uuid(),
  image_url      text not null,
  title          text,
  category       text,
  stylist_id     uuid references stylists(id) on delete set null,
  display_order  integer default 0,
  visible        boolean default true,
  featured       boolean default false,
  created_at     timestamptz default now()
);

-- Products
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       decimal(10,2) not null default 0,
  image_url   text,
  category    text,
  tags        text[],
  stock       integer default 0,
  available   boolean default true,
  created_at  timestamptz default now()
);

-- Appointments
create table if not exists appointments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references profiles(id) on delete set null,
  stylist_id         uuid references stylists(id) on delete set null,
  service_id         uuid references services(id) on delete set null,
  date               date not null,
  time               time not null,
  status             text default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  notes              text,
  guest_name         text,
  guest_phone        text,
  guest_email        text,
  payment_status     text default 'unpaid',
  payment_intent_id  text,
  created_at         timestamptz default now()
);

create index if not exists idx_appointments_payment_intent on appointments(payment_intent_id);

-- Cart items (10-minute hold)
create table if not exists cart_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  product_id  uuid references products(id) on delete cascade not null,
  quantity    int not null default 1,
  added_at    timestamptz default now() not null,
  expires_at  timestamptz default (now() + interval '10 minutes') not null,
  unique(user_id, product_id)
);

-- Preorders / in-store reservations
create table if not exists preorders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references profiles(id) on delete set null,
  product_id         uuid references products(id) on delete set null,
  quantity           integer default 1,
  status             text default 'active' check (status in ('active', 'retrieved', 'expired', 'cancelled')),
  expires_at         timestamptz,
  payment_status     text default 'paid',
  payment_intent_id  text,
  coupon_code        text,
  discount_amount    decimal(10,2),
  order_group_id     uuid,
  created_at         timestamptz default now()
);

create index if not exists idx_preorders_payment_intent on preorders(payment_intent_id);

-- Coupons
create table if not exists coupons (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique not null,
  discount_type         text not null check (discount_type in ('percentage', 'fixed')),
  discount_value        decimal(10,2) not null default 0,
  min_points_required   integer default 0,
  expiry_date           date,
  max_uses              integer,
  current_uses          integer default 0,
  active                boolean default true,
  created_at            timestamptz default now()
);

-- User coupons
create table if not exists user_coupons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  coupon_id   uuid references coupons(id) on delete cascade,
  used        boolean default false,
  granted_by  text default 'system',
  created_at  timestamptz default now(),
  unique(user_id, coupon_id)
);

-- Tickets (support / direct-message threads)
create table if not exists tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles(id) on delete cascade,
  title           text not null,
  status          text not null default 'open' check (status in ('open', 'closed')),
  recipient_id    uuid references profiles(id) on delete set null,
  appointment_id  uuid references appointments(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists tickets_appointment_id_idx on tickets(appointment_id);

-- Ticket messages
create table if not exists ticket_messages (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid references tickets(id) on delete cascade not null,
  sender_id      uuid references profiles(id) on delete set null,
  content        text not null,
  is_from_admin  boolean default false,
  read           boolean default false,
  created_at     timestamptz default now()
);

-- Legacy / broadcast messages (still used for studio dashboard unread count)
create table if not exists messages (
  id                   uuid primary key default gen_random_uuid(),
  sender_id            uuid references profiles(id) on delete set null,
  recipient_id         uuid references profiles(id) on delete set null,
  content              text not null,
  read                 boolean default false,
  is_admin_broadcast   boolean default false,
  created_at           timestamptz default now()
);

-- Blocked dates (salon-wide closures + stylist day-off requests)
create table if not exists blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  reason      text,
  stylist_id  uuid references stylists(id) on delete cascade,
  status      text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

-- Blocked hours (salon-wide or per-stylist slot blocks)
create table if not exists blocked_hours (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  hour        text not null,
  stylist_id  uuid references stylists(id) on delete cascade,
  created_at  timestamptz default now()
);

-- Salon-wide key/value settings (e.g. monthly day-off / hour-off caps)
create table if not exists salon_settings (
  key    text primary key,
  value  text
);

-- Timesheets (clock in/out)
create table if not exists timesheets (
  id              uuid primary key default gen_random_uuid(),
  stylist_id      uuid references stylists(id) on delete cascade not null,
  clock_in        timestamptz not null,
  clock_out       timestamptz,
  break_minutes   integer default 0,
  paid_at         timestamptz,
  created_at      timestamptz default now()
);

-- Pay runs (tips / commissions / other extras per stylist)
create table if not exists pay_runs (
  id            uuid primary key default gen_random_uuid(),
  stylist_id    uuid references stylists(id) on delete cascade not null,
  tips          decimal(10,2) default 0,
  commissions   decimal(10,2) default 0,
  other         decimal(10,2) default 0,
  period_start  date,
  period_end    date,
  earnings      decimal(10,2) default 0,
  created_at    timestamptz default now()
);

-- Activity logs (admin audit trail)
create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text not null default 'Unknown',
  actor_role  text not null default 'user',
  action      text not null,
  entity_type text,
  entity_id   text,
  details     jsonb not null default '{}',
  created_at  timestamptz default now()
);

create index if not exists activity_logs_created_at_idx on activity_logs (created_at desc);
create index if not exists activity_logs_actor_id_idx   on activity_logs (actor_id);

-- =========================================================================
-- HELPER FUNCTIONS
-- =========================================================================

-- Returns the current user's role without triggering recursive RLS
create or replace function auth_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid()
$$;

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic stock decrement (prevents overselling on concurrent checkouts)
create or replace function decrement_product_stock(p_product_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products
  set stock = stock - p_quantity
  where id = p_product_id and stock >= p_quantity;

  if not found then
    raise exception 'Insufficient stock for product %', p_product_id;
  end if;
end;
$$;

grant execute on function decrement_product_stock to authenticated;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table profiles            enable row level security;
alter table stylists             enable row level security;
alter table services             enable row level security;
alter table gallery_categories   enable row level security;
alter table product_categories   enable row level security;
alter table gallery              enable row level security;
alter table products             enable row level security;
alter table appointments         enable row level security;
alter table cart_items           enable row level security;
alter table preorders            enable row level security;
alter table coupons              enable row level security;
alter table user_coupons         enable row level security;
alter table tickets              enable row level security;
alter table ticket_messages      enable row level security;
alter table messages             enable row level security;
alter table blocked_dates        enable row level security;
alter table blocked_hours        enable row level security;
alter table salon_settings       enable row level security;
alter table timesheets           enable row level security;
alter table pay_runs             enable row level security;
alter table activity_logs        enable row level security;

-- ── Profiles ──
create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Staff read all profiles" on profiles for select using (auth_user_role() in ('admin', 'artist', 'manager'));
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins can manage profiles" on profiles for all using (auth_user_role() = 'admin');

-- ── Stylists / Services / Gallery / Categories (public read) ──
create policy "Public read stylists" on stylists for select using (true);
create policy "Admin manage stylists" on stylists for all using (auth_user_role() = 'admin');
create policy "Managers update stylists" on stylists for update using (auth_user_role() = 'manager');

create policy "Public read services" on services for select using (true);
create policy "Admin manage services" on services for all using (auth_user_role() = 'admin');
create policy "Managers insert services" on services for insert with check (auth_user_role() = 'manager');
create policy "Managers update services" on services for update using (auth_user_role() = 'manager');

create policy "Public read gallery categories" on gallery_categories for select using (true);
create policy "Admin manage gallery categories" on gallery_categories for all using (auth_user_role() = 'admin');
create policy "Managers insert gallery categories" on gallery_categories for insert with check (auth_user_role() = 'manager');
create policy "Managers update gallery categories" on gallery_categories for update using (auth_user_role() = 'manager');

create policy "Public read product categories" on product_categories for select using (true);
create policy "Admin manage product categories" on product_categories for all using (auth_user_role() = 'admin');
create policy "Managers insert product categories" on product_categories for insert with check (auth_user_role() = 'manager');
create policy "Managers update product categories" on product_categories for update using (auth_user_role() = 'manager');

create policy "Public read gallery" on gallery for select using (true);
create policy "Admin manage gallery" on gallery for all using (auth_user_role() = 'admin');
create policy "Managers insert gallery" on gallery for insert with check (auth_user_role() = 'manager');
create policy "Managers update gallery" on gallery for update using (auth_user_role() = 'manager');

-- ── Products ──
create policy "Public read available products" on products for select using (available = true);
create policy "Staff read all products" on products for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admin manage products" on products for all using (auth_user_role() = 'admin');
create policy "Managers insert products" on products for insert with check (auth_user_role() = 'manager');
create policy "Managers update products" on products for update using (auth_user_role() = 'manager');

-- ── Appointments ──
create policy "Users can read own appointments" on appointments for select using (user_id = auth.uid());
create policy "Users can create appointments" on appointments for insert with check (user_id = auth.uid());
create policy "Guest appointments allowed" on appointments for insert with check (user_id is null and guest_email is not null);
create policy "Staff read all appointments" on appointments for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admins can manage appointments" on appointments for all using (auth_user_role() = 'admin');
create policy "Managers insert appointments" on appointments for insert with check (auth_user_role() = 'manager');
create policy "Managers update appointments" on appointments for update using (auth_user_role() = 'manager');

-- ── Cart items ──
create policy "Users manage own cart" on cart_items for all using (auth.uid() = user_id);

-- ── Preorders ──
create policy "Users can read own preorders" on preorders for select using (user_id = auth.uid());
create policy "Users can create preorders" on preorders for insert with check (user_id = auth.uid());
create policy "Users can update own preorders" on preorders for update using (user_id = auth.uid());
create policy "Staff read all preorders" on preorders for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admins manage preorders" on preorders for all using (auth_user_role() = 'admin');
create policy "Managers update preorders" on preorders for update using (auth_user_role() = 'manager');

-- ── Coupons ──
create policy "Public read active coupons" on coupons for select using (active = true);
create policy "Staff read all coupons" on coupons for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admins manage coupons" on coupons for all using (auth_user_role() = 'admin');
create policy "Managers insert coupons" on coupons for insert with check (auth_user_role() = 'manager');
create policy "Managers update coupons" on coupons for update using (auth_user_role() = 'manager');

-- ── User coupons ──
create policy "Users read own coupons" on user_coupons for select using (user_id = auth.uid());
create policy "Users can claim promo coupons" on user_coupons for insert with check (user_id = auth.uid() and used = false);
create policy "Users mark own coupons used" on user_coupons for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Staff read all user coupons" on user_coupons for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admins manage user coupons" on user_coupons for all using (auth_user_role() = 'admin');
create policy "Managers insert user coupons" on user_coupons for insert with check (auth_user_role() = 'manager');
create policy "Managers update user coupons" on user_coupons for update using (auth_user_role() = 'manager');

-- ── Tickets ──
create policy "Users manage own tickets" on tickets for select using (user_id = auth.uid());
create policy "Users create own tickets" on tickets for insert with check (user_id = auth.uid());
create policy "Users update own tickets" on tickets for update using (user_id = auth.uid());
create policy "Admins manage tickets" on tickets for all using (auth_user_role() = 'admin');
create policy "Staff see store and direct tickets" on tickets for select using (
  auth_user_role() in ('artist', 'manager') and (recipient_id is null or recipient_id = auth.uid())
);
create policy "Staff update store and direct tickets" on tickets for update using (
  auth_user_role() in ('artist', 'manager') and (recipient_id is null or recipient_id = auth.uid())
);
create policy "Staff insert tickets" on tickets for insert with check (auth_user_role() in ('admin', 'artist', 'manager'));

-- ── Ticket messages ──
create policy "Users read own ticket messages" on ticket_messages for select using (
  exists (select 1 from tickets t where t.id = ticket_id and t.user_id = auth.uid())
);
create policy "Users send own ticket messages" on ticket_messages for insert with check (
  sender_id = auth.uid() and exists (select 1 from tickets t where t.id = ticket_id and t.user_id = auth.uid())
);
create policy "Admins manage ticket messages" on ticket_messages for all using (auth_user_role() = 'admin');
create policy "Staff read direct ticket messages" on ticket_messages for select using (
  exists (
    select 1 from tickets t where t.id = ticket_id
    and auth_user_role() in ('artist', 'manager')
    and (t.recipient_id is null or t.recipient_id = auth.uid())
  )
);
create policy "Staff insert direct ticket messages" on ticket_messages for insert with check (
  exists (
    select 1 from tickets t where t.id = ticket_id
    and auth_user_role() in ('artist', 'manager')
    and (t.recipient_id is null or t.recipient_id = auth.uid())
  )
);
create policy "Staff update ticket messages" on ticket_messages for update using (auth_user_role() in ('admin', 'artist', 'manager'));

-- ── Messages (legacy/broadcast) ──
create policy "Users can read own messages" on messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid() or is_admin_broadcast = true);
create policy "Users can send messages" on messages for insert with check (sender_id = auth.uid());
create policy "Staff read all messages" on messages for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admins send messages" on messages for insert with check (auth_user_role() = 'admin');
create policy "Admins update messages" on messages for update using (auth_user_role() = 'admin');

-- ── Blocked dates / hours (public read — needed for the public booking calendar) ──
create policy "Public read blocked dates" on blocked_dates for select using (true);
create policy "Admins manage blocked dates" on blocked_dates for all using (auth_user_role() = 'admin');
create policy "Managers insert blocked dates" on blocked_dates for insert with check (auth_user_role() = 'manager');
create policy "Managers update blocked dates" on blocked_dates for update using (auth_user_role() = 'manager');
create policy "Artists manage own blocked dates" on blocked_dates for all using (
  auth_user_role() = 'artist' and stylist_id in (select id from stylists where profile_id = auth.uid())
);

create policy "Public read blocked hours" on blocked_hours for select using (true);
create policy "Admins manage blocked hours" on blocked_hours for all using (auth_user_role() = 'admin');
create policy "Managers insert blocked hours" on blocked_hours for insert with check (auth_user_role() = 'manager');
create policy "Managers update blocked hours" on blocked_hours for update using (auth_user_role() = 'manager');
create policy "Artists manage own blocked hours" on blocked_hours for all using (
  auth_user_role() = 'artist' and stylist_id in (select id from stylists where profile_id = auth.uid())
);

-- ── Salon settings (staff only) ──
create policy "Staff read salon settings" on salon_settings for select using (auth_user_role() in ('admin', 'manager', 'artist'));
create policy "Admins manage salon settings" on salon_settings for all using (auth_user_role() = 'admin');
create policy "Managers update salon settings" on salon_settings for update using (auth_user_role() = 'manager');
create policy "Managers insert salon settings" on salon_settings for insert with check (auth_user_role() = 'manager');

-- ── Timesheets ──
create policy "Staff read all timesheets" on timesheets for select using (auth_user_role() in ('admin', 'manager'));
create policy "Admins manage timesheets" on timesheets for all using (auth_user_role() = 'admin');
create policy "Managers insert timesheets" on timesheets for insert with check (auth_user_role() = 'manager');
create policy "Managers update timesheets" on timesheets for update using (auth_user_role() = 'manager');
create policy "Artists manage own timesheets" on timesheets for all using (
  stylist_id in (select id from stylists where profile_id = auth.uid())
);

-- ── Pay runs (admin/manager only) ──
create policy "Staff manage pay runs" on pay_runs for all using (auth_user_role() in ('admin', 'manager'));

-- ── Activity logs ──
create policy "Admins read logs" on activity_logs for select using (auth_user_role() in ('admin', 'manager'));
create policy "Authenticated insert logs" on activity_logs for insert with check (auth.uid() is not null and actor_id = auth.uid());

-- =========================================================================
-- REALTIME
-- =========================================================================

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table preorders;
alter publication supabase_realtime add table tickets;
alter publication supabase_realtime add table ticket_messages;
alter publication supabase_realtime add table timesheets;

-- =========================================================================
-- CRON JOBS (requires: Database → Extensions → pg_cron enabled)
-- =========================================================================

create extension if not exists pg_cron;

-- Daily at 2am UTC: expire in-store holds older than their expiry, restore stock
select cron.schedule(
  'expire-in-store-reservations',
  '0 2 * * *',
  $$
    with expired as (
      update preorders
      set status = 'expired'
      where status = 'active'
        and payment_status = 'pay_in_store'
        and expires_at < now()
      returning id, product_id, quantity
    )
    update products p
    set stock = p.stock + e.quantity
    from expired e
    where p.id = e.product_id;
  $$
);

-- Auto clock-out at 22:00 NZ time (fires at both 09:00 and 10:00 UTC to cover NZST/NZDT)
select cron.schedule(
  'auto-clock-out-nz',
  '0 9,10 * * *',
  $$
    update timesheets
    set clock_out = (
      (clock_in at time zone 'Pacific/Auckland')::date + interval '22 hours'
    ) at time zone 'Pacific/Auckland'
    where clock_out is null
      and (now() at time zone 'Pacific/Auckland')::time >= time '22:00:00';
  $$
);

-- =========================================================================
-- STORAGE POLICIES
--
-- A bucket's "public" flag only affects anonymous GET (the public CDN URL
-- bypasses RLS for reads). Every INSERT/UPDATE/DELETE into storage.objects
-- is still gated by RLS regardless of the bucket's public flag. All upload
-- call sites in the app (StudioGallery, StudioProducts, StudioServices →
-- 'gallery'/'products'; StudioStylists, StudioUsers → 'stylists') run as
-- admin/manager, so write access is scoped to those two roles.
--
-- Run this AFTER creating the 3 buckets (gallery, products, stylists) as
-- public buckets in Storage → New bucket.
-- =========================================================================

create policy "Staff write gallery bucket" on storage.objects for insert
  with check (bucket_id = 'gallery' and auth_user_role() in ('admin', 'manager'));
create policy "Staff update gallery bucket" on storage.objects for update
  using (bucket_id = 'gallery' and auth_user_role() in ('admin', 'manager'));
create policy "Staff delete gallery bucket" on storage.objects for delete
  using (bucket_id = 'gallery' and auth_user_role() in ('admin', 'manager'));

create policy "Staff write products bucket" on storage.objects for insert
  with check (bucket_id = 'products' and auth_user_role() in ('admin', 'manager'));
create policy "Staff update products bucket" on storage.objects for update
  using (bucket_id = 'products' and auth_user_role() in ('admin', 'manager'));
create policy "Staff delete products bucket" on storage.objects for delete
  using (bucket_id = 'products' and auth_user_role() in ('admin', 'manager'));

create policy "Staff write stylists bucket" on storage.objects for insert
  with check (bucket_id = 'stylists' and auth_user_role() in ('admin', 'manager'));
create policy "Staff update stylists bucket" on storage.objects for update
  using (bucket_id = 'stylists' and auth_user_role() in ('admin', 'manager'));
create policy "Staff delete stylists bucket" on storage.objects for delete
  using (bucket_id = 'stylists' and auth_user_role() in ('admin', 'manager'));
