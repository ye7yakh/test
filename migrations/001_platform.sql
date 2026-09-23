-- Tenancy, users and sessions.
-- A tenant is a brand domain (brand.com); each salon lives on a subdomain of it
-- (salonname.brand.com). The bare domain and admin./www. are the platform host.

create table if not exists tenants (
  id                    bigint generated always as identity primary key,
  domain                text not null unique check (domain = lower(domain)),
  name                  text not null,
  default_calling_code  text not null default '966' check (default_calling_code ~ '^[1-9][0-9]{0,3}$'),
  default_timezone      text not null default 'Asia/Riyadh',
  default_currency      text not null default 'SAR' check (default_currency ~ '^[A-Z]{3}$'),
  created_at            timestamptz not null default now()
);

create table if not exists users (
  id              bigint generated always as identity primary key,
  tenant_id       bigint not null references tenants(id),
  phone           text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  name            text not null default '',
  password_hash   text not null,
  is_super_admin  boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table if not exists salons (
  id              bigint generated always as identity primary key,
  tenant_id       bigint not null references tenants(id),
  subdomain       text not null check (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$'),
  name_ar         text not null,
  name_en         text not null default '',
  about_ar        text not null default '',
  about_en        text not null default '',
  phone           text not null default '',
  address         text not null default '',
  timezone        text not null,
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  color_primary   text not null default '#1f2a37' check (color_primary ~ '^#[0-9a-f]{6}$'),
  color_accent    text not null default '#c8a15a' check (color_accent ~ '^#[0-9a-f]{6}$'),
  photo_style     text not null default 'natural' check (photo_style in ('natural', 'warm', 'mono', 'brand')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, subdomain)
);

create table if not exists salon_members (
  salon_id    bigint not null references salons(id) on delete cascade,
  user_id     bigint not null references users(id) on delete cascade,
  role        text not null check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (salon_id, user_id)
);
create index if not exists salon_members_user_idx on salon_members (user_id);

-- The cookie holds a random token; only its SHA-256 is stored. A session is bound
-- to the host it was created on: salon_id null means the platform host.
create table if not exists sessions (
  token_hash  bytea primary key,
  user_id     bigint not null references users(id) on delete cascade,
  tenant_id   bigint not null references tenants(id),
  salon_id    bigint references salons(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);
