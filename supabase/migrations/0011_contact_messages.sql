-- 0011_contact_messages.sql: the public contact form (slice 12)
--
-- A visitor (no login) can leave a message on the İletişim page. Same safety model as the "Teklif Al" form
-- (quote_requests, 0001):
--   * a visitor can only INSERT, and only four columns (name, phone, email, message). They get no SELECT, so
--     `insert ... returning` is refused: the form must not ask for the row back.
--   * status and the admin's note are set by the database / the admin, never by the visitor.
--   * only admins read, change the status or the note, and delete. (Like quote_requests, any admin may read them:
--     the public site belongs to the management company. Split by company when there is more than one.)
--
-- The database cannot tell a bot from a person. The form has a hidden "honeypot" field and length limits; there is no
-- rate limit and no captcha yet (named in the README).
--
-- Same rules as before: RLS on, explicit grants, short constraints that the form mirrors with Turkish messages.

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  phone       text check (phone is null or char_length(phone) between 7 and 30),
  email       text check (email is null or (char_length(email) <= 200 and email like '%_@_%')),
  message     text not null check (char_length(btrim(message)) between 5 and 2000),
  status      text not null default 'new' check (status in ('new', 'read', 'answered')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  check (phone is not null or email is not null)
);

create index contact_messages_status_created_idx on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;

-- anyone (even logged out) may INSERT those four columns; nothing else
grant insert (name, phone, email, message) on public.contact_messages to anon, authenticated;
create policy "contact_messages: anyone inserts" on public.contact_messages for insert to anon, authenticated
  with check (status = 'new' and admin_note is null);

-- admins read, answer (status + note) and delete
grant select, delete on public.contact_messages to authenticated;
grant update (status, admin_note) on public.contact_messages to authenticated;
create policy "contact_messages: admin read" on public.contact_messages for select to authenticated
  using (private.is_any_admin());
create policy "contact_messages: admin update" on public.contact_messages for update to authenticated
  using (private.is_any_admin())
  with check (private.is_any_admin());
create policy "contact_messages: admin delete" on public.contact_messages for delete to authenticated
  using (private.is_any_admin());
