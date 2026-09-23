-- Bookings: customers book a service with a team member at a time. A salon can ask
-- for a CliQ deposit before a booking counts as confirmed.

-- Lets the no-overlap rule below combine "same staff member" with "times overlap".
create extension if not exists btree_gist;

alter table salons add column if not exists booking_enabled boolean not null default true;
-- CliQ: the owner's alias (or mobile number) and the account name customers will see.
alter table salons add column if not exists cliq_required boolean not null default false;
alter table salons add column if not exists cliq_alias text not null default '' check (length(cliq_alias) <= 60);
alter table salons add column if not exists cliq_name text not null default '' check (length(cliq_name) <= 80);
-- Deposit: a fixed amount (never more than the service price) or the full price.
alter table salons add column if not exists deposit_kind text not null default 'fixed' check (deposit_kind in ('fixed', 'full'));
alter table salons add column if not exists deposit_amount numeric(12, 3) not null default 2 check (deposit_amount >= 0);
-- Minutes a customer has to send the deposit before the held slot is released.
alter table salons add column if not exists payment_window_min int not null default 30 check (payment_window_min between 5 and 1440);

-- People who book, per salon. Identified by phone; no password yet.
create table if not exists customers (
  id          bigint generated always as identity primary key,
  salon_id    bigint not null references salons(id) on delete cascade,
  phone       text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  name        text not null check (length(name) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (salon_id, phone),
  unique (salon_id, id)
);

-- Statuses:
--   pending_payment  held for the deposit until expires_at
--   payment_sent     customer says the CliQ transfer is sent; owner to check
--   confirmed        on the schedule
--   completed / no_show / cancelled / expired
create table if not exists bookings (
  id             bigint generated always as identity primary key,
  salon_id       bigint not null references salons(id) on delete cascade,
  customer_id    bigint not null,
  staff_id       bigint not null,
  service_id     bigint not null,
  start_at       timestamptz not null,
  end_at         timestamptz not null check (end_at > start_at),
  status         text not null check (status in ('pending_payment', 'payment_sent', 'confirmed', 'completed', 'no_show', 'cancelled', 'expired')),
  price          numeric(12, 3) not null check (price >= 0),
  deposit        numeric(12, 3) not null default 0 check (deposit >= 0),
  expires_at     timestamptz,
  payment_note   text not null default '' check (length(payment_note) <= 120),
  source         text not null default 'online' check (source in ('online', 'owner')),
  -- The customer's link to this booking holds a random token; only its hash is kept.
  token_hash     bytea not null unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (salon_id, customer_id) references customers (salon_id, id),
  foreign key (salon_id, staff_id) references staff (salon_id, id),
  foreign key (salon_id, service_id) references services (salon_id, id),
  -- One person, one chair: bookings that hold time can never overlap for a staff member.
  constraint bookings_no_overlap exclude using gist (staff_id with =, tstzrange(start_at, end_at) with &&)
    where (status in ('pending_payment', 'payment_sent', 'confirmed'))
);
create index if not exists bookings_salon_start_idx on bookings (salon_id, start_at);
create index if not exists bookings_attention_idx on bookings (salon_id, status) where status in ('pending_payment', 'payment_sent');
create index if not exists bookings_customer_idx on bookings (customer_id);
