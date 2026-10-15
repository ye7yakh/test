-- The AI mirror: customers try a haircut (and a colour) on their own photo before
-- they book. Off until the owner chooses which styles to offer (the platform must
-- also have an AI image provider configured). The photos are never stored.
alter table salons add column if not exists tryon text not null default 'off'
  check (tryon in ('off', 'men', 'women', 'all'));

-- The look a customer tried on and then booked ("skin_fade" or "bob:honey"), so the
-- barber knows what they came for. Only the catalogue ids, never a picture.
alter table bookings add column if not exists look text
  check (look is null or look ~ '^[a-z_]{2,24}(:[a-z_]{2,24})?$');
