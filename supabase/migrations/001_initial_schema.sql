create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'Admin' check (role in ('Owner', 'Admin', 'Support')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  notes text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  device_id text not null unique,
  device_name text,
  os text,
  app_version text,
  last_seen_at timestamptz,
  last_ip text,
  status text not null default 'Active' check (status in ('Active', 'Suspended', 'Revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_id text unique not null,
  school_id uuid references public.schools(id) on delete cascade,
  device_id text not null,
  plan text not null check (plan in ('Trial', 'Monthly', 'Annual', 'Lifetime')),
  status text not null default 'Active' check (status in ('Active', 'Suspended', 'Expired', 'Revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  maintenance_until timestamptz,
  max_users integer not null default 10,
  features jsonb not null default '{}'::jsonb,
  license_key text,
  suspend_reason text,
  revoked_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_checkins (
  id uuid primary key default gen_random_uuid(),
  license_id text,
  device_id text,
  school_id uuid,
  status_returned text,
  app_version text,
  os text,
  ip_address text,
  checked_at timestamptz not null default now(),
  notes text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  license_id text,
  amount integer,
  payment_date date,
  due_date date,
  payment_mode text,
  status text not null default 'Pending' check (status in ('Pending', 'Paid', 'Overdue', 'Cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists schools_status_idx on public.schools(status);
create index if not exists devices_school_id_idx on public.devices(school_id);
create index if not exists devices_status_idx on public.devices(status);
create index if not exists licenses_school_id_idx on public.licenses(school_id);
create index if not exists licenses_device_id_idx on public.licenses(device_id);
create index if not exists licenses_status_idx on public.licenses(status);
create index if not exists licenses_expires_at_idx on public.licenses(expires_at);
create index if not exists license_checkins_license_id_idx on public.license_checkins(license_id);
create index if not exists license_checkins_checked_at_idx on public.license_checkins(checked_at);
create index if not exists payments_school_id_idx on public.payments(school_id);
create index if not exists payments_status_idx on public.payments(status);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_users_updated_at on public.admin_users;
create trigger set_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

drop trigger if exists set_schools_updated_at on public.schools;
create trigger set_schools_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists set_licenses_updated_at on public.licenses;
create trigger set_licenses_updated_at
before update on public.licenses
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.schools enable row level security;
alter table public.devices enable row level security;
alter table public.licenses enable row level security;
alter table public.license_checkins enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and status = 'Active'
  );
$$;

drop policy if exists "Admins can read own admin row" on public.admin_users;
create policy "Admins can read own admin row"
on public.admin_users for select
using (auth.uid() = user_id);

drop policy if exists "Active admins can read schools" on public.schools;
create policy "Active admins can read schools"
on public.schools for select
using (public.is_active_admin());

drop policy if exists "Active admins can write schools" on public.schools;
create policy "Active admins can write schools"
on public.schools for all
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Active admins can read devices" on public.devices;
create policy "Active admins can read devices"
on public.devices for select
using (public.is_active_admin());

drop policy if exists "Active admins can write devices" on public.devices;
create policy "Active admins can write devices"
on public.devices for all
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Active admins can read licenses" on public.licenses;
create policy "Active admins can read licenses"
on public.licenses for select
using (public.is_active_admin());

drop policy if exists "Active admins can write licenses" on public.licenses;
create policy "Active admins can write licenses"
on public.licenses for all
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Active admins can read checkins" on public.license_checkins;
create policy "Active admins can read checkins"
on public.license_checkins for select
using (public.is_active_admin());

drop policy if exists "Active admins can read payments" on public.payments;
create policy "Active admins can read payments"
on public.payments for select
using (public.is_active_admin());

drop policy if exists "Active admins can write payments" on public.payments;
create policy "Active admins can write payments"
on public.payments for all
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Active admins can read audit logs" on public.audit_logs;
create policy "Active admins can read audit logs"
on public.audit_logs for select
using (public.is_active_admin());
