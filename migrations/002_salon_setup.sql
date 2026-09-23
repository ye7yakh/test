-- What a salon owner sets up: logo, services, team (with photos), opening hours.
-- Child tables carry salon_id and use composite foreign keys so a row can never
-- point at another salon's staff or service, whatever the application does.

-- Images live in Postgres: they are small (re-encoded WebP), covered by RDS
-- backups, and need no extra bucket or volume on the single host.
create table if not exists media (
  id            uuid primary key default gen_random_uuid(),
  salon_id      bigint not null references salons(id) on delete cascade,
  content_type  text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  width         int not null,
  height        int not null,
  bytes         bytea not null,
  created_at    timestamptz not null default now(),
  unique (salon_id, id)
);

alter table salons add column if not exists logo_media_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'salons_logo_media_fk') then
    alter table salons add constraint salons_logo_media_fk
      foreign key (id, logo_media_id) references media (salon_id, id) on delete set null (logo_media_id);
  end if;
end $$;

create table if not exists services (
  id              bigint generated always as identity primary key,
  salon_id        bigint not null references salons(id) on delete cascade,
  name_ar         text not null check (length(name_ar) between 1 and 80),
  name_en         text not null default '' check (length(name_en) <= 80),
  description_ar  text not null default '' check (length(description_ar) <= 300),
  description_en  text not null default '' check (length(description_en) <= 300),
  duration_min    int not null check (duration_min between 5 and 600),
  price           numeric(12, 3) not null check (price >= 0),
  price_is_from   boolean not null default false,
  active          boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (salon_id, id)
);
create index if not exists services_salon_idx on services (salon_id, sort_order, id);

create table if not exists staff (
  id                 bigint generated always as identity primary key,
  salon_id           bigint not null references salons(id) on delete cascade,
  name_ar            text not null check (length(name_ar) between 1 and 60),
  name_en            text not null default '' check (length(name_en) <= 60),
  title_ar           text not null default '' check (length(title_ar) <= 60),
  title_en           text not null default '' check (length(title_en) <= 60),
  -- The owner's upload (normalised) and the version rendered in the salon's photo style.
  photo_original_id  uuid,
  photo_id           uuid,
  custom_hours       boolean not null default false,
  active             boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, photo_original_id) references media (salon_id, id) on delete set null (photo_original_id),
  foreign key (salon_id, photo_id) references media (salon_id, id) on delete set null (photo_id)
);
create index if not exists staff_salon_idx on staff (salon_id, sort_order, id);

create table if not exists staff_services (
  salon_id    bigint not null,
  staff_id    bigint not null,
  service_id  bigint not null,
  primary key (staff_id, service_id),
  foreign key (salon_id, staff_id) references staff (salon_id, id) on delete cascade,
  foreign key (salon_id, service_id) references services (salon_id, id) on delete cascade
);
create index if not exists staff_services_service_idx on staff_services (service_id);

-- Weekly hours as minutes from midnight in the salon's timezone. weekday 0 = Sunday.
-- close_min above 1440 means the range runs past midnight (e.g. 16:00 to 02:00).
-- A day with no rows is closed; several rows make a split shift.
create table if not exists salon_hours (
  salon_id   bigint not null references salons(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  open_min   smallint not null check (open_min between 0 and 1439),
  close_min  smallint not null check (close_min > open_min and close_min - open_min <= 1440),
  primary key (salon_id, weekday, open_min)
);

-- Used only when staff.custom_hours is true; otherwise the staff member follows salon_hours.
create table if not exists staff_hours (
  salon_id   bigint not null,
  staff_id   bigint not null,
  weekday    smallint not null check (weekday between 0 and 6),
  open_min   smallint not null check (open_min between 0 and 1439),
  close_min  smallint not null check (close_min > open_min and close_min - open_min <= 1440),
  primary key (staff_id, weekday, open_min),
  foreign key (salon_id, staff_id) references staff (salon_id, id) on delete cascade
);
