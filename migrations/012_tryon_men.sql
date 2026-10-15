-- The AI mirror is for men's cuts only, and which cuts a customer sees now comes from
-- his own photo (the AI reads his hair), so the owner's choice is simply on or off.
-- Salons that offered men's cuts keep the mirror on; one that offered only women's
-- cuts is switched off rather than shown a men's mirror. Looks booked from women's
-- cuts (never in production) are no longer described.
alter table salons drop constraint if exists salons_tryon_check;
update salons set tryon = case when tryon in ('men', 'all', 'on') then 'on' else 'off' end;
alter table salons alter column tryon set default 'off';
alter table salons add constraint salons_tryon_check check (tryon in ('off', 'on'));
