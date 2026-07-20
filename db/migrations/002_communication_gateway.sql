create table if not exists communication_device_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  license_id text references licenses(license_id),
  device_id text not null,
  token_hash text not null unique,
  token_prefix text,
  status text not null default 'Active' check (status in ('Active', 'Revoked', 'Expired')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_admin_id uuid references admin_users(id),
  created_at timestamptz default now(),
  revoked_at timestamptz,
  revoked_reason text
);

create table if not exists communication_integrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  channel text not null check (channel in ('WhatsApp', 'SMS')),
  provider text not null check (provider in ('MetaCloud', 'MSG91')),
  status text not null default 'Disabled' check (status in ('Disabled', 'Configured', 'Active', 'Error')),
  encrypted_config text not null,
  display_config jsonb default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists communication_integrations_active_idx
on communication_integrations(school_id, channel, provider)
where status in ('Configured', 'Active', 'Error');

create table if not exists communication_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  channel text not null check (channel in ('WhatsApp', 'SMS')),
  provider text not null check (provider in ('MetaCloud', 'MSG91')),
  internal_name text not null,
  category text,
  provider_template_id text,
  provider_template_name text,
  provider_language_code text,
  dlt_template_id text,
  msg91_flow_id text,
  sender_id text,
  body_preview text,
  variable_definitions jsonb default '[]'::jsonb,
  status text not null default 'Draft' check (status in ('Draft', 'Pending', 'Approved', 'Rejected', 'Disabled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists communication_templates_school_name_idx
on communication_templates(school_id, channel, internal_name);

create table if not exists communication_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  channel text not null check (channel in ('WhatsApp', 'SMS')),
  template_id uuid references communication_templates(id),
  title text,
  audience_type text,
  total_recipients integer default 0,
  queued_count integer default 0,
  submitted_count integer default 0,
  delivered_count integer default 0,
  read_count integer default 0,
  failed_count integer default 0,
  requested_by_user_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists communication_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  batch_id uuid references communication_batches(id),
  device_id text,
  channel text not null check (channel in ('WhatsApp', 'SMS')),
  provider text not null check (provider in ('MetaCloud', 'MSG91')),
  template_id uuid references communication_templates(id),
  idempotency_key text,
  recipient_type text check (recipient_type in ('Student', 'Guardian', 'Employee', 'User')),
  recipient_entity_id text,
  recipient_name text,
  recipient_phone_masked text,
  encrypted_recipient_phone text,
  variables jsonb default '{}'::jsonb,
  media_url text,
  requested_by_user_id text,
  requested_by_name text,
  requested_by_role text,
  status text not null default 'Queued' check (
    status in (
      'Queued',
      'Processing',
      'Submitted',
      'Sent',
      'Delivered',
      'Read',
      'Failed',
      'Rejected',
      'Cancelled'
    )
  ),
  provider_message_id text,
  provider_response_code text,
  error_code text,
  error_message text,
  attempt_count integer default 0,
  queued_at timestamptz default now(),
  submitted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists communication_jobs_idempotency_idx
on communication_jobs(school_id, idempotency_key)
where idempotency_key is not null;

create index if not exists communication_jobs_school_created_idx
on communication_jobs(school_id, created_at desc);

create index if not exists communication_jobs_provider_message_idx
on communication_jobs(provider_message_id)
where provider_message_id is not null;

create table if not exists communication_webhook_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  provider text not null,
  provider_event_id text,
  event_type text,
  provider_message_id text,
  payload_hash text,
  payload_json jsonb,
  processing_status text,
  error_message text,
  received_at timestamptz default now(),
  processed_at timestamptz
);

create unique index if not exists communication_webhook_events_provider_event_idx
on communication_webhook_events(provider, provider_event_id)
where provider_event_id is not null;

create unique index if not exists communication_webhook_events_payload_idx
on communication_webhook_events(provider, payload_hash)
where provider_event_id is null;

create table if not exists communication_contact_preferences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  entity_type text not null,
  entity_id text not null,
  phone_masked text,
  whatsapp_enabled boolean default true,
  sms_enabled boolean default true,
  transactional_allowed boolean default true,
  marketing_allowed boolean default false,
  opted_out_at timestamptz,
  opt_out_reason text,
  updated_at timestamptz default now()
);

create unique index if not exists communication_contact_preferences_entity_idx
on communication_contact_preferences(school_id, entity_type, entity_id);

create trigger set_communication_integrations_updated_at
before update on communication_integrations
for each row execute function set_updated_at();

create trigger set_communication_templates_updated_at
before update on communication_templates
for each row execute function set_updated_at();

create trigger set_communication_batches_updated_at
before update on communication_batches
for each row execute function set_updated_at();

create trigger set_communication_jobs_updated_at
before update on communication_jobs
for each row execute function set_updated_at();
