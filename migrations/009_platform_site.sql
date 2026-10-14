-- The platform's own front door (its landing page on the bare domain): the brand's
-- name in Arabic beside the Latin one, and the WhatsApp number salon owners reach it on.
alter table tenants add column if not exists name_ar text not null default '';
alter table tenants add column if not exists contact_phone text not null default ''
  check (contact_phone = '' or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
