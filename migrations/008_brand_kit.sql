-- The salon's brand kit: how its two apps (customers' and the owner's) look.

-- A wide photo of the salon across the top of the customer page.
alter table salons add column if not exists cover_media_id uuid;
-- A square app icon of its own, for logos that are wide words rather than a mark.
alter table salons add column if not exists icon_media_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'salons_cover_media_fk') then
    alter table salons add constraint salons_cover_media_fk
      foreign key (id, cover_media_id) references media (salon_id, id) on delete set null (cover_media_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'salons_icon_media_fk') then
    alter table salons add constraint salons_icon_media_fk
      foreign key (id, icon_media_id) references media (salon_id, id) on delete set null (icon_media_id);
  end if;
end $$;

-- Behind the logo on the app icon: auto (white behind a logo, the main colour
-- behind the default mark), white, the main colour, or the dark night.
alter table salons add column if not exists icon_bg text not null default 'auto'
  check (icon_bg in ('auto', 'white', 'primary', 'night'));
-- The customer page at night (dark, lit by the accent) or by day (light).
alter table salons add column if not exists page_theme text not null default 'night'
  check (page_theme in ('night', 'day'));
-- The owner's dashboard in the platform's violet and blue, or in the salon's colours.
alter table salons add column if not exists studio_theme text not null default 'studio'
  check (studio_theme in ('studio', 'brand'));
