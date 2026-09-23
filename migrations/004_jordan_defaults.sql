-- The platform launches in Jordan: new brands default to +962, Amman time and
-- Jordanian dinars (3 decimal places, fils).
alter table tenants alter column default_calling_code set default '962';
alter table tenants alter column default_timezone set default 'Asia/Amman';
alter table tenants alter column default_currency set default 'JOD';
