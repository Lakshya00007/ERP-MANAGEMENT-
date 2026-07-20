create extension if not exists "pgcrypto";

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text,
  role text not null default 'Owner' check (role in ('Owner', 'Admin', 'Support')),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  notes text,
  status text default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  device_id text unique not null,
  device_name text,
  os text,
  app_version text,
  last_seen_at timestamptz,
  last_ip text,
  status text default 'Active' check (status in ('Active', 'Suspended', 'Revoked')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  license_id text unique not null,
  school_id uuid references schools(id),
  device_id text not null,
  plan text not null check (plan in ('Trial', 'Monthly', 'Annual', 'Lifetime')),
  status text default 'Active' check (status in ('Active', 'Suspended', 'Expired', 'Revoked')),
  issued_at timestamptz,
  expires_at timestamptz,
  maintenance_until timestamptz,
  max_users integer default 10,
  features jsonb default '[]'::jsonb,
  license_key text,
  suspend_reason text,
  revoked_reason text,
  created_by uuid references admin_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists license_checkins (
  id uuid primary key default gen_random_uuid(),
  license_id text,
  device_id text,
  school_id uuid references schools(id),
  status_returned text,
  app_version text,
  os text,
  ip_address text,
  checked_at timestamptz default now(),
  notes text
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  license_id text,
  amount integer,
  payment_date date,
  due_date date,
  payment_mode text,
  status text default 'Pending' check (status in ('Pending', 'Paid', 'Overdue', 'Cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references admin_users(id),
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists licenses_license_id_idx on licenses(license_id);
create index if not exists licenses_device_id_idx on licenses(device_id);
create index if not exists licenses_status_idx on licenses(status);
create index if not exists devices_device_id_idx on devices(device_id);
create index if not exists devices_school_id_idx on devices(school_id);
create index if not exists license_checkins_checked_at_idx on license_checkins(checked_at desc);
create index if not exists payments_status_idx on payments(status);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_users_updated_at on admin_users;
create trigger set_admin_users_updated_at
before update on admin_users
for each row execute function set_updated_at();

drop trigger if exists set_schools_updated_at on schools;
create trigger set_schools_updated_at
before update on schools
for each row execute function set_updated_at();

drop trigger if exists set_devices_updated_at on devices;
create trigger set_devices_updated_at
before update on devices
for each row execute function set_updated_at();

drop trigger if exists set_licenses_updated_at on licenses;
create trigger set_licenses_updated_at
before update on licenses
for each row execute function set_updated_at();

drop trigger if exists set_payments_updated_at on payments;
create trigger set_payments_updated_at
before update on payments
for each row execute function set_updated_at();
