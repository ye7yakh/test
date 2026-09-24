-- Payment screenshots: the customer uploads the CliQ receipt, the owner reviews it
-- and confirms or rejects. Kept apart from `media` on purpose: media is served
-- publicly to the salon page, these hold bank details and are shown only to the
-- salon's owner and to the customer's own booking link. Deleted a week after the
-- booking is decided (see purgeProofs).
create table if not exists booking_proofs (
  booking_id    bigint primary key references bookings(id) on delete cascade,
  content_type  text not null,
  bytes         bytea not null,
  width         int not null,
  height        int not null,
  created_at    timestamptz not null default now()
);

-- Set when the owner rejects a sent payment, so the customer is told why the
-- booking was cancelled rather than just that it was.
alter table bookings add column if not exists payment_rejected boolean not null default false;
