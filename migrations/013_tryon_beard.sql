-- The AI mirror tries beards too: a look is now "cut[:colour[:beard]]", where the cut can
-- be "keep" (his own hair) and the colour empty (his own), e.g. "keep::full_beard" or
-- "crop::stubble". Still only catalogue ids, never a picture.
alter table bookings drop constraint if exists bookings_look_check;
alter table bookings add constraint bookings_look_check
  check (look is null or look ~ '^[a-z_]{2,24}(:[a-z_]{0,24}(:[a-z_]{2,24})?)?$');
