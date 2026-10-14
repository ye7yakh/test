-- Platform admin tools.

-- A salon's earlier links keep working after the admin changes its subdomain: the
-- old one redirects to the new one (shared links, booking links, QR codes). An old
-- link stays reserved for its salon and is not handed to another salon.
create table if not exists salon_aliases (
  tenant_id   bigint not null references tenants(id),
  subdomain   text not null check (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$'),
  salon_id    bigint not null references salons(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, subdomain)
);
create index if not exists salon_aliases_salon_idx on salon_aliases (salon_id);

-- Passwords the admin sets (new owners, resets) are temporary: the owner is asked to
-- choose their own, and the admin can see who has not yet.
alter table users add column if not exists must_change_password boolean not null default false;

-- When an owner last used their studio, so the admin can spot salons that went quiet.
alter table salon_members add column if not exists last_seen_at timestamptz;
