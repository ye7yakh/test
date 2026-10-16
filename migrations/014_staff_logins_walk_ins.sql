-- Each barber can have his own sign-in (his phone number and a password the owner hands
-- him): a 'staff' member of the salon linked to his place on the team, who sees his own
-- schedule. The owner's membership has no team link.
alter table salon_members add column if not exists staff_id bigint;
alter table salon_members drop constraint if exists salon_members_staff_fk;
alter table salon_members add constraint salon_members_staff_fk
  foreign key (salon_id, staff_id) references staff (salon_id, id) on delete cascade;
create unique index if not exists salon_members_staff_idx on salon_members (salon_id, staff_id) where staff_id is not null;
alter table salon_members drop constraint if exists salon_members_staff_role;
alter table salon_members add constraint salon_members_staff_role check ((role = 'staff') = (staff_id is not null));

-- Walk-ins: a customer who comes in without a booking, recorded by whoever serves him,
-- with what he wants and what it costs. He may give no name or number, so a booking
-- no longer needs a customer.
alter table bookings drop constraint if exists bookings_source_check;
alter table bookings add constraint bookings_source_check check (source in ('online', 'owner', 'walk_in'));
alter table bookings alter column customer_id drop not null;
alter table bookings add column if not exists note text check (note is null or length(note) <= 200);

-- A walk-in is already in the chair, so it is never refused for overlapping a booking
-- (the barber squeezes him in, or the booked customer is late). It still holds the
-- chair for online booking: availability() counts it, and takes the same salon lock.
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap exclude using gist (staff_id with =, tstzrange(start_at, end_at) with &&)
  where (status in ('pending_payment', 'payment_sent', 'confirmed') and source <> 'walk_in');
