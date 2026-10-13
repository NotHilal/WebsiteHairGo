-- =========================================================================
-- HairGo — fixes from the 2026-10-13 review
--
-- Run once in Supabase → SQL Editor AFTER full-schema.sql and
-- security-hardening.sql. Safe to re-run.
--
-- Deploy together with the updated edge functions (create-payment-intent,
-- book-in-store, process-refund, send-appointment-confirmation,
-- stripe-webhook) and the new frontend build. After this runs the browser
-- can no longer insert appointments directly; bookings go through the
-- book-in-store / create-payment-intent functions.
-- =========================================================================

create extension if not exists btree_gist;


-- ── 0. System bypass for server-side triggers ──────────────────────────────
-- Functions below set `hairgo.system = on` for the current transaction when
-- they legitimately change protected columns (e.g. loyalty points).

create or replace function protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or auth_user_role() = 'admin'
     or current_setting('hairgo.system', true) = 'on' then
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

-- Keep the phone number given at signup (it was dropped when email
-- confirmation is on, because the browser can't write the profile yet)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, nullif(new.raw_user_meta_data->>'phone', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ── 1. Appointments: real prices, durations and no overlapping bookings ────

alter table appointments add column if not exists duration_minutes int;
alter table appointments add column if not exists final_price      numeric(10,2);
alter table appointments add column if not exists discount_amount  numeric(10,2);
alter table appointments add column if not exists coupon_id        uuid references coupons(id) on delete set null;
alter table appointments add column if not exists points_awarded   boolean not null default false;

-- Already-completed visits have had their point
update appointments set points_awarded = true where status = 'completed' and not points_awarded;

-- Snapshot the service length on the booking so later service edits can't
-- create overlaps after the fact
create or replace function set_appointment_duration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.duration_minutes is null
     or (tg_op = 'UPDATE' and new.service_id is distinct from old.service_id) then
    select coalesce(duration, 60) into new.duration_minutes from services where id = new.service_id;
    new.duration_minutes := coalesce(new.duration_minutes, 60);
  end if;
  return new;
end;
$$;

drop trigger if exists set_appointment_duration on appointments;
create trigger set_appointment_duration
  before insert or update on appointments
  for each row execute function set_appointment_duration();

update appointments a
set duration_minutes = coalesce(s.duration, 60)
from services s
where s.id = a.service_id and a.duration_minutes is null;
update appointments set duration_minutes = 60 where duration_minutes is null;
alter table appointments alter column duration_minutes set not null;

-- One stylist can't be booked twice for overlapping times. Existing
-- overlaps only produce a warning — clean them up and re-run to enforce.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table appointments add constraint appointments_no_overlap
      exclude using gist (
        stylist_id with =,
        tsrange(date + time, date + time + make_interval(mins => duration_minutes), '[)') with &&
      ) where (status <> 'cancelled' and stylist_id is not null);
  end if;
exception when exclusion_violation then
  raise warning 'appointments_no_overlap not created: overlapping bookings exist. Find them with: select a.id, b.id, a.stylist_id, a.date, a.time, b.time from appointments a join appointments b on a.stylist_id = b.stylist_id and a.date = b.date and a.id < b.id and a.status <> ''cancelled'' and b.status <> ''cancelled'' and tsrange(a.date + a.time, a.date + a.time + make_interval(mins => a.duration_minutes)) && tsrange(b.date + b.time, b.date + b.time + make_interval(mins => b.duration_minutes))';
end;
$$;

-- Busy times for the public booking calendar (no names or contact details)
create or replace function get_busy_slots(p_stylist_id uuid, p_date date)
returns table (start_time time, duration_minutes int)
language sql
stable
security definer
set search_path = public
as $$
  select a.time, coalesce(a.duration_minutes, 60)
  from appointments a
  where a.stylist_id = p_stylist_id and a.date = p_date and a.status <> 'cancelled'
$$;

revoke all on function get_busy_slots(uuid, date) from public;
grant execute on function get_busy_slots(uuid, date) to anon, authenticated;

-- Customers no longer insert bookings from the browser — the book-in-store
-- and create-payment-intent functions do it with the price worked out on
-- the server. Staff keep their own insert policies (reschedules).
drop policy if exists "Users can create appointments" on appointments;
drop policy if exists "Guest appointments allowed" on appointments;

-- Artists see and update the bookings of their own stylist profile
drop policy if exists "Artists read own appointments" on appointments;
create policy "Artists read own appointments" on appointments for select using (
  auth_user_role() = 'artist'
  and stylist_id in (select id from stylists where profile_id = auth.uid())
);
drop policy if exists "Artists update own appointments" on appointments;
create policy "Artists update own appointments" on appointments for update
  using (
    auth_user_role() = 'artist'
    and stylist_id in (select id from stylists where profile_id = auth.uid())
  )
  with check (
    auth_user_role() = 'artist'
    and stylist_id in (select id from stylists where profile_id = auth.uid())
  );

-- Artists may only change the status of a booking (not price, payment, stylist…)
create or replace function protect_appointment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or auth_user_role() in ('admin', 'manager')
     or current_setting('hairgo.system', true) = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'points_awarded') is distinct from (to_jsonb(old) - 'status' - 'points_awarded') then
    raise exception 'Only the appointment status can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_appointment_columns on appointments;
create trigger protect_appointment_columns
  before update on appointments
  for each row execute function protect_appointment_columns();


-- ── 2. Loyalty: +1 visit and every 5th visit a 30% reward, on the server ──

create or replace function award_visit_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pts         int;
  v_coupon_id uuid;
  reward      text;
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.user_id is not null
     and not coalesce(old.points_awarded, false) then
    perform set_config('hairgo.system', 'on', true);

    update profiles set points = coalesce(points, 0) + 1
    where id = new.user_id
    returning points into pts;

    if pts is not null and pts % 5 = 0 then
      reward := 'REWARD' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      insert into coupons (code, discount_type, discount_value, min_points_required, expiry_date, max_uses, active, is_public)
      values (reward, 'percentage', 30, 0, (current_date + interval '3 months')::date, 1, true, false)
      returning id into v_coupon_id;
      insert into user_coupons (user_id, coupon_id, used, granted_by)
      values (new.user_id, v_coupon_id, false, 'system');
    end if;

    perform set_config('hairgo.system', 'off', true);
    new.points_awarded := true;
  end if;
  return new;
end;
$$;

drop trigger if exists award_visit_points on appointments;
create trigger award_visit_points
  before update on appointments
  for each row execute function award_visit_points();


-- ── 3. Rate limiting for bookings made through book-in-store ───────────────

create table if not exists booking_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index if not exists booking_attempts_ip_time_idx on booking_attempts (ip, created_at desc);
alter table booking_attempts enable row level security;  -- no policies: service role only


-- ── 4. Timesheets: artists clock in/out only, time comes from the server ───

drop policy if exists "Artists manage own timesheets" on timesheets;
drop policy if exists "Artists read own timesheets" on timesheets;
create policy "Artists read own timesheets" on timesheets for select using (
  stylist_id in (select id from stylists where profile_id = auth.uid())
);

create or replace function can_act_for_stylist(p_stylist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_user_role() in ('admin', 'manager')
      or exists (select 1 from stylists where id = p_stylist_id and profile_id = auth.uid())
$$;

create or replace function clock_in(p_stylist_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not can_act_for_stylist(p_stylist_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from timesheets where stylist_id = p_stylist_id and clock_out is null) then
    raise exception 'Already clocked in';
  end if;
  insert into timesheets (stylist_id, clock_in) values (p_stylist_id, now())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function clock_out(p_stylist_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_act_for_stylist(p_stylist_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update timesheets set clock_out = now()
  where stylist_id = p_stylist_id and clock_out is null;
  if not found then
    raise exception 'Not clocked in';
  end if;
end;
$$;

revoke all on function can_act_for_stylist(uuid) from public;
revoke all on function clock_in(uuid)  from public;
revoke all on function clock_out(uuid) from public;
grant execute on function can_act_for_stylist(uuid) to authenticated;
grant execute on function clock_in(uuid)  to authenticated;
grant execute on function clock_out(uuid) to authenticated;


-- ── 5. Payroll: private hourly rates, extras history, keep history on delete

create table if not exists stylist_rates (
  stylist_id  uuid primary key references stylists(id) on delete cascade,
  hourly_rate numeric(10,2),
  updated_at  timestamptz default now()
);
alter table stylist_rates enable row level security;

drop policy if exists "Admins manage stylist rates" on stylist_rates;
create policy "Admins manage stylist rates" on stylist_rates for all using (auth_user_role() = 'admin');
drop policy if exists "Artists read own rate" on stylist_rates;
create policy "Artists read own rate" on stylist_rates for select using (
  stylist_id in (select id from stylists where profile_id = auth.uid())
);

-- Move rates out of the publicly readable stylists table
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'stylists' and column_name = 'hourly_rate') then
    insert into stylist_rates (stylist_id, hourly_rate)
    select id, hourly_rate from stylists where hourly_rate is not null
    on conflict (stylist_id) do update set hourly_rate = excluded.hourly_rate;
    alter table stylists drop column hourly_rate;
  end if;
end;
$$;

-- Tips/commissions are kept as dated records; paid ones stay as history
alter table pay_runs add column if not exists paid_at timestamptz;

-- Removing a team member must not delete their timesheets or pay history
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.stylists'::regclass
      and c.conrelid in ('public.timesheets'::regclass, 'public.pay_runs'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;
alter table timesheets add constraint timesheets_stylist_id_fkey
  foreign key (stylist_id) references stylists(id) on delete restrict;
alter table pay_runs add constraint pay_runs_stylist_id_fkey
  foreign key (stylist_id) references stylists(id) on delete restrict;


-- ── 6. Days off: artists request, managers/admins approve ──────────────────

drop policy if exists "Artists manage own blocked dates" on blocked_dates;
drop policy if exists "Artists request days off" on blocked_dates;
create policy "Artists request days off" on blocked_dates for insert with check (
  auth_user_role() = 'artist'
  and status = 'pending'
  and stylist_id in (select id from stylists where profile_id = auth.uid())
);
drop policy if exists "Artists cancel pending days off" on blocked_dates;
create policy "Artists cancel pending days off" on blocked_dates for delete using (
  auth_user_role() = 'artist'
  and status = 'pending'
  and stylist_id in (select id from stylists where profile_id = auth.uid())
);

-- Managers can already create/edit closures and hours; let them remove them too
drop policy if exists "Managers delete blocked dates" on blocked_dates;
create policy "Managers delete blocked dates" on blocked_dates for delete using (auth_user_role() = 'manager');
drop policy if exists "Managers delete blocked hours" on blocked_hours;
create policy "Managers delete blocked hours" on blocked_hours for delete using (auth_user_role() = 'manager');


-- ── 7. Messages: read receipts work, nobody can rewrite a message ──────────

drop policy if exists "Staff update ticket messages" on ticket_messages;
drop policy if exists "Staff update visible ticket messages" on ticket_messages;
create policy "Staff update visible ticket messages" on ticket_messages for update using (
  exists (
    select 1 from tickets t where t.id = ticket_id
    and auth_user_role() in ('artist', 'manager')
    and (t.recipient_id is null or t.recipient_id = auth.uid())
  )
);
drop policy if exists "Users mark own ticket messages read" on ticket_messages;
create policy "Users mark own ticket messages read" on ticket_messages for update
  using (exists (select 1 from tickets t where t.id = ticket_id and t.user_id = auth.uid()))
  with check (exists (select 1 from tickets t where t.id = ticket_id and t.user_id = auth.uid()));

create or replace function protect_ticket_message_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth_user_role() = 'admin' then
    return new;
  end if;
  if (to_jsonb(new) - 'read') is distinct from (to_jsonb(old) - 'read') then
    raise exception 'Only the read flag can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_ticket_message_columns on ticket_messages;
create trigger protect_ticket_message_columns
  before update on ticket_messages
  for each row execute function protect_ticket_message_columns();

-- Staff names for the customer chat (customers can't read staff profiles)
create or replace function staff_directory()
returns table (id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role from profiles p where p.role in ('admin', 'artist', 'manager')
$$;

revoke all on function staff_directory() from public;
grant execute on function staff_directory() to authenticated;


-- ── 8. Store: atomic stock changes, price at time of sale ──────────────────

alter table preorders add column if not exists unit_price numeric(10,2);

create or replace function increment_product_stock(p_product_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  update products set stock = coalesce(stock, 0) + p_quantity where id = p_product_id;
end;
$$;

revoke all on function increment_product_stock(uuid, int) from public, anon, authenticated;
grant execute on function increment_product_stock(uuid, int) to service_role;

-- Staff +/- buttons: apply the change to the current stock, not a stale copy
create or replace function adjust_product_stock(p_product_id uuid, p_delta int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_stock int;
begin
  if auth_user_role() not in ('admin', 'manager') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update products set stock = greatest(0, coalesce(stock, 0) + p_delta)
  where id = p_product_id
  returning stock into new_stock;
  return new_stock;
end;
$$;

revoke all on function adjust_product_stock(uuid, int) from public, anon;
grant execute on function adjust_product_stock(uuid, int) to authenticated;

-- Nightly expiry: add up quantities per product before restocking
-- (UPDATE … FROM only applies one row per product)
do $$
begin
  perform cron.unschedule('expire-in-store-reservations');
exception when others then null;
end;
$$;

select cron.schedule(
  'expire-in-store-reservations',
  '0 * * * *',
  $$
    with expired as (
      update preorders
      set status = 'expired'
      where status = 'active'
        and payment_status = 'pay_in_store'
        and expires_at < now()
      returning product_id, quantity
    ), totals as (
      select product_id, sum(quantity)::int as qty
      from expired where product_id is not null
      group by product_id
    )
    update products p
    set stock = coalesce(p.stock, 0) + t.qty
    from totals t
    where p.id = t.product_id;
  $$
);
