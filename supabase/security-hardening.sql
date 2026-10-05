-- =========================================================================
-- HairGo — security hardening (2026-10-05)
--
-- Run once in Supabase → SQL Editor on the live project. Safe to re-run.
-- Deploy the updated edge functions and frontend at the same time: after
-- this runs, the browser can no longer write paid bookings/orders, stock or
-- coupon usage directly — those now go through the edge functions.
-- =========================================================================


-- ── 1. Profiles: users can't change their own role, points or email ─────────

create or replace function protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / SQL editor (no signed-in user) and admins may change anything
  if auth.uid() is null or auth_user_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role   := 'user';
    new.points := 0;
    return new;
  end if;

  if new.id     is distinct from old.id
  or new.role   is distinct from old.role
  or new.points is distinct from old.points
  or new.email  is distinct from old.email then
    raise exception 'Not allowed to change role, points or email' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on profiles;
create trigger protect_profile_columns
  before insert or update on profiles
  for each row execute function protect_profile_columns();

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Pin search_path on the signup trigger (security definer best practice)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ── 2. Coupons: no public listing, claiming and spending go through the server ─

-- Personal coupons (loyalty rewards, store credit) can't be claimed by code
alter table coupons add column if not exists is_public boolean not null default true;
update coupons set is_public = false where code like 'REWARD%' or code like 'CREDIT%';

drop policy if exists "Public read active coupons" on coupons;
drop policy if exists "Users read own assigned coupons" on coupons;
create policy "Users read own assigned coupons" on coupons for select using (
  exists (select 1 from user_coupons uc where uc.coupon_id = coupons.id and uc.user_id = auth.uid())
);

drop policy if exists "Users can claim promo coupons" on user_coupons;
drop policy if exists "Users mark own coupons used" on user_coupons;

-- Look up one coupon by exact code (replaces reading the coupons table directly)
create or replace function lookup_coupon(p_code text)
returns table (
  id uuid, code text, discount_type text, discount_value numeric,
  expiry_date date, max_uses int, current_uses int, min_points_required int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code, c.discount_type, c.discount_value,
         c.expiry_date, c.max_uses, c.current_uses, c.min_points_required
  from coupons c
  where c.code = upper(trim(p_code))
    and c.active
    and (c.is_public or exists (
      select 1 from user_coupons uc where uc.coupon_id = c.id and uc.user_id = auth.uid()
    ))
$$;

revoke all on function lookup_coupon(text) from public;
grant execute on function lookup_coupon(text) to anon, authenticated;

-- Attach a public promo code to the signed-in user (returns the user_coupons id)
create or replace function claim_promo_coupon(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c     coupons%rowtype;
  uc_id uuid;
  pts   int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into c from coupons where code = upper(trim(p_code)) and active;
  if not found then raise exception 'Invalid coupon code'; end if;

  select id into uc_id from user_coupons where user_id = auth.uid() and coupon_id = c.id;
  if uc_id is not null then return uc_id; end if;

  if not c.is_public then raise exception 'Invalid coupon code'; end if;
  if c.expiry_date is not null and c.expiry_date < current_date then
    raise exception 'This coupon has expired';
  end if;
  if c.max_uses is not null and coalesce(c.current_uses, 0) >= c.max_uses then
    raise exception 'This coupon has been fully redeemed';
  end if;
  if coalesce(c.min_points_required, 0) > 0 then
    select points into pts from profiles where id = auth.uid();
    if coalesce(pts, 0) < c.min_points_required then
      raise exception 'Not enough visits for this coupon yet';
    end if;
  end if;

  insert into user_coupons (user_id, coupon_id, used, granted_by)
  values (auth.uid(), c.id, false, 'promo')
  returning id into uc_id;
  return uc_id;
end;
$$;

revoke all on function claim_promo_coupon(text) from public;
grant execute on function claim_promo_coupon(text) to authenticated;

-- Spend a coupon (edge functions only). Returns false if the user's copy was already used.
create or replace function consume_coupon(p_coupon_id uuid, p_user_coupon_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_coupon_id is not null then
    update user_coupons set used = true
    where id = p_user_coupon_id and coupon_id = p_coupon_id and not used;
    if not found then return false; end if;
  end if;

  update coupons
  set current_uses = coalesce(current_uses, 0) + 1,
      active = case
        when not is_public then false
        when max_uses is not null and coalesce(current_uses, 0) + 1 >= max_uses then false
        else active
      end
  where id = p_coupon_id;
  return true;
end;
$$;

revoke all on function consume_coupon(uuid, uuid) from public, anon, authenticated;
grant execute on function consume_coupon(uuid, uuid) to service_role;


-- ── 3. Stock: only the server can decrement it ──────────────────────────────

create or replace function decrement_product_stock(p_product_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  update products
  set stock = stock - p_quantity
  where id = p_product_id and stock >= p_quantity;

  if not found then
    raise exception 'Insufficient stock for product %', p_product_id;
  end if;
end;
$$;

revoke all on function decrement_product_stock(uuid, int) from public, anon, authenticated;
grant execute on function decrement_product_stock(uuid, int) to service_role;


-- ── 4. Orders: customers can no longer write preorders directly ─────────────

drop policy if exists "Users can create preorders" on preorders;
drop policy if exists "Users can update own preorders" on preorders;


-- ── 5. Appointments: browser can only create unpaid / pay-in-store bookings ─

drop policy if exists "Users can create appointments" on appointments;
create policy "Users can create appointments" on appointments for insert with check (
  user_id = auth.uid()
  and payment_status in ('unpaid', 'pay_in_store')
  and payment_intent_id is null
  and status in ('pending', 'confirmed')
  and date >= current_date
);

drop policy if exists "Guest appointments allowed" on appointments;
create policy "Guest appointments allowed" on appointments for insert with check (
  user_id is null
  and guest_email is not null
  and payment_status in ('unpaid', 'pay_in_store')
  and payment_intent_id is null
  and status in ('pending', 'confirmed')
  and date >= current_date
);

-- One email confirmation per booking
alter table appointments add column if not exists confirmation_sent_at timestamptz;

-- One active booking per stylist per time slot. If existing data already has a
-- clash this only warns — clean up the duplicates and re-run to enforce it.
do $$
begin
  create unique index if not exists appointments_unique_slot
    on appointments (stylist_id, date, time)
    where status <> 'cancelled';
exception when unique_violation then
  raise warning 'appointments_unique_slot not created: existing double bookings found. Find them with: select stylist_id, date, time, count(*) from appointments where status <> ''cancelled'' group by 1,2,3 having count(*) > 1';
end;
$$;

-- Each Stripe payment is turned into a booking/order exactly once
create table if not exists fulfilled_payments (
  payment_intent_id text primary key,
  kind              text not null,
  user_id           uuid,
  created_at        timestamptz default now()
);
alter table fulfilled_payments enable row level security;  -- no policies: service role only


-- ── 6. Messages / tickets: no impersonating staff ───────────────────────────

drop policy if exists "Users send own ticket messages" on ticket_messages;
create policy "Users send own ticket messages" on ticket_messages for insert with check (
  sender_id = auth.uid()
  and coalesce(is_from_admin, false) = false
  and exists (select 1 from tickets t where t.id = ticket_id and t.user_id = auth.uid())
);

drop policy if exists "Users create own tickets" on tickets;
create policy "Users create own tickets" on tickets for insert with check (
  user_id = auth.uid()
  and (appointment_id is null or exists (
    select 1 from appointments a where a.id = appointment_id and a.user_id = auth.uid()
  ))
);

drop policy if exists "Users update own tickets" on tickets;
create policy "Users update own tickets" on tickets for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (appointment_id is null or exists (
      select 1 from appointments a where a.id = appointment_id and a.user_id = auth.uid()
    ))
  );

drop policy if exists "Users can send messages" on messages;
create policy "Users can send messages" on messages for insert with check (
  sender_id = auth.uid() and coalesce(is_admin_broadcast, false) = false
);

drop policy if exists "Authenticated insert logs" on activity_logs;
create policy "Authenticated insert logs" on activity_logs for insert with check (
  auth.uid() is not null
  and actor_id = auth.uid()
  and actor_role = coalesce(auth_user_role(), 'user')
);


-- ── Check: list every policy so you can spot any extra ones added in the dashboard
-- select tablename, policyname, cmd, qual, with_check from pg_policies
-- where schemaname = 'public' order by tablename, policyname;
