-- The name each booking was made under. Customers are known by phone number only,
-- so a booking made with a number someone already used (a husband booking with his
-- wife's phone, or anyone who knows it) must not rename that person on all their
-- other bookings. Read as coalesce(b.customer_name, c.name), so rows from before
-- this column, and any written by an older server during a deploy, still show a name.
alter table bookings add column if not exists customer_name text
  check (customer_name is null or length(customer_name) between 1 and 60);

update bookings b set customer_name = c.name
  from customers c
 where c.id = b.customer_id and b.customer_name is null;
