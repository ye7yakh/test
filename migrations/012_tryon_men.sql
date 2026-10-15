-- The AI mirror is for men's cuts only, and which cuts a customer sees now comes from
-- his own photo (the AI reads his hair), so the owner's choice is simply on or off.
alter table salons drop constraint if exists salons_tryon_check;
update salons set tryon = case when tryon = 'off' then 'off' else 'on' end;
alter table salons alter column tryon set default 'off';
alter table salons add constraint salons_tryon_check check (tryon in ('off', 'on'));
