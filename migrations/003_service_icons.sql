-- A small emoji per service, shown in the owner's list and the salon app.
alter table services add column if not exists icon text not null default '✂️' check (length(icon) between 1 and 16);
