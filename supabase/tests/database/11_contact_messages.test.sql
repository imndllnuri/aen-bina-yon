-- Database tests for 0011_contact_messages.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (the demo site of seed.sql):
--   AD admin of the demo site     R1 owner of A Blok 1 (a resident)     S stranger (no unit, no admin role)

begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;
create function pg_temp.act_as_visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end; $$;

create schema tt;
grant usage on schema tt to anon, authenticated;
create function tt.u(p text) returns uuid language sql as $$
  select case p
    when 'AD' then 'a1000000-0000-0000-0000-000000000001' when 'R1' then 'b1000000-0000-0000-0000-000000000001'
    when 'S'  then 'c1000000-0000-0000-0000-000000000001' end::uuid
$$;
-- how many messages with this name exist, WITHOUT row security
create function tt.n(p_name text) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.contact_messages where name = p_name
$$;
grant execute on function tt.n(text) to anon, authenticated;
create function tt.one(p_name text, p_col text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I::text from public.contact_messages where name = $1 limit 1', p_col) into v using p_name;
  return v;
end; $$;
grant execute on function tt.one(text, text) to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (tt.u('AD'), 'admin@test.local', '{"full_name":"Admin A"}'),
  (tt.u('R1'), 'r1@test.local', '{"full_name":"Mehmet Malik"}'),
  (tt.u('S'),  's@test.local',  '{"full_name":"Yabancı"}');
insert into public.site_members (profile_id, site_id, role) values (tt.u('AD'), '00000000-0000-0000-0000-000000000010', 'admin');
insert into public.unit_residents (unit_id, profile_id, relation, start_date)
select (select u.id from public.units u where u.block_id = '00000000-0000-0000-0000-000000000101' and u.door_no = '1'), tt.u('R1'), 'owner', current_date - 30;

-- ---------------------------------------------------------------------------
-- 1. structure and rights
-- ---------------------------------------------------------------------------
select has_table('public', 'contact_messages', 'the table exists');
select is((select relrowsecurity from pg_class where oid = 'public.contact_messages'::regclass), true, 'row level security is on');
select is(has_column_privilege('anon', 'public.contact_messages', 'name', 'insert'), true, 'a visitor may write the name');
select is(has_column_privilege('anon', 'public.contact_messages', 'phone', 'insert'), true, '...the phone');
select is(has_column_privilege('anon', 'public.contact_messages', 'email', 'insert'), true, '...the e-mail');
select is(has_column_privilege('anon', 'public.contact_messages', 'message', 'insert'), true, '...and the message');
select is(has_column_privilege('anon', 'public.contact_messages', 'status', 'insert'), false, 'but not the status');
select is(has_column_privilege('anon', 'public.contact_messages', 'admin_note', 'insert'), false, '...not the admin note');
select is(has_column_privilege('anon', 'public.contact_messages', 'id', 'insert'), false, '...not the id');
select is(has_column_privilege('anon', 'public.contact_messages', 'created_at', 'insert'), false, '...not the time');
select is(has_any_column_privilege('anon', 'public.contact_messages', 'select'), false, 'a visitor cannot read any column');
select is(has_any_column_privilege('anon', 'public.contact_messages', 'update'), false, '...change any column');
select is(has_table_privilege('anon', 'public.contact_messages', 'delete'), false, '...or delete');
select is(has_table_privilege('authenticated', 'public.contact_messages', 'select'), true, 'a logged-in person may ask (row security decides what they get)');
select is(has_column_privilege('authenticated', 'public.contact_messages', 'status', 'update'), true, 'the status can be changed');
select is(has_column_privilege('authenticated', 'public.contact_messages', 'admin_note', 'update'), true, '...and the note');
select is(has_column_privilege('authenticated', 'public.contact_messages', 'message', 'update'), false, 'but never what the visitor wrote (message)');
select is(has_column_privilege('authenticated', 'public.contact_messages', 'name', 'update'), false, '...(name)');
select is(has_column_privilege('authenticated', 'public.contact_messages', 'email', 'update'), false, '...(e-mail)');

-- ---------------------------------------------------------------------------
-- 2. a visitor sends messages
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select lives_ok($$insert into public.contact_messages (name, phone, message) values ('T-phone', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.')$$, 'a message with a phone only');
select lives_ok($$insert into public.contact_messages (name, email, message) values ('T-mail', 'ali@ornek.com', 'Merhaba, bilgi almak istiyorum.')$$, 'a message with an e-mail only');
select lives_ok($$insert into public.contact_messages (name, phone, email, message) values ('T-both', '05320000000', 'ali@ornek.com', 'Merhaba, bilgi almak istiyorum.')$$, 'a message with both');
select lives_ok($$insert into public.contact_messages (name, phone, message) values ('T-edge', '1234567', 'Tamam.' || repeat('x', 1994))$$, 'the longest message (2000) and the shortest phone (7) are fine');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('T-ret', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.') returning id$$, '42501', null, 'a visitor cannot ask for the row back (no select)');
select throws_ok($$select id from public.contact_messages$$, '42501', null, 'a visitor cannot even ask for the ids');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.n('T-phone'), 1, 'the first message was saved');
select is(tt.one('T-phone', 'status'), 'new', '...with the status "new"');
select is(tt.one('T-phone', 'admin_note'), null, '...and no note');
select is(tt.n('T-ret'), 0, 'the refused insert saved nothing');

select pg_temp.act_as_visitor();
select throws_ok($$insert into public.contact_messages (name, message) values ('T-nocontact', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'neither phone nor e-mail is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('A', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'a one-letter name is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('  A ', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, '...and a name that is only one letter between spaces');
select throws_ok($$insert into public.contact_messages (name, phone, message) values (repeat('a', 121), '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'a name over 120 characters is refused');
select throws_ok($$insert into public.contact_messages (phone, message) values ('0532 000 00 00', 'Merhaba, bilgi almak istiyorum.')$$, '23502', null, 'a missing name is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('T-bad', '123456', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'a phone of 6 characters is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('T-bad', repeat('1', 31), 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'a phone of 31 characters is refused');
select throws_ok($$insert into public.contact_messages (name, email, message) values ('T-bad', 'not-an-address', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'an e-mail without @ is refused');
select throws_ok($$insert into public.contact_messages (name, email, message) values ('T-bad', repeat('a', 200) || '@b.com', 'Merhaba, bilgi almak istiyorum.')$$, '23514', null, 'an e-mail over 200 characters is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('T-bad', '0532 000 00 00', 'Kısa')$$, '23514', null, 'a message of 4 characters is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('T-bad', '0532 000 00 00', '    abc    ')$$, '23514', null, '...and one that is only 3 letters between spaces');
select throws_ok($$insert into public.contact_messages (name, phone, message) values ('T-bad', '0532 000 00 00', repeat('x', 2001))$$, '23514', null, 'a message of 2001 characters is refused');
select throws_ok($$insert into public.contact_messages (name, phone) values ('T-bad', '0532 000 00 00')$$, '23502', null, 'a missing message is refused');
select throws_ok($$insert into public.contact_messages (name, phone, message, status) values ('T-bad', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.', 'answered')$$, '42501', null, 'a visitor cannot choose the status');
select throws_ok($$insert into public.contact_messages (name, phone, message, admin_note) values ('T-bad', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.', 'not')$$, '42501', null, '...nor write an admin note');
select throws_ok($$insert into public.contact_messages (name, phone, message, created_at) values ('T-bad', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.', '2000-01-01')$$, '42501', null, '...nor the time');
select throws_ok($$select * from public.contact_messages$$, '42501', null, 'reading is refused for a visitor');
select throws_ok($$update public.contact_messages set status = 'read'$$, '42501', null, '...changing too');
select throws_ok($$delete from public.contact_messages$$, '42501', null, '...and deleting');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.n('T-bad') + tt.n('T-nocontact'), 0, 'none of the refused messages was saved');

-- ---------------------------------------------------------------------------
-- 3. a resident and a stranger cannot read or change anything
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('R1'));
select lives_ok($$insert into public.contact_messages (name, phone, message) values ('T-resident', '0532 000 00 00', 'Merhaba, bilgi almak istiyorum.')$$, 'a logged-in resident may also send a message');
select is((select count(*)::integer from public.contact_messages), 0, 'a resident sees no message (not even their own)');
select is_empty($$update public.contact_messages set status = 'read' where name = 'T-phone' returning 1$$, 'a resident finds no row to change');
select is_empty($$delete from public.contact_messages where name = 'T-phone' returning 1$$, '...or delete');
-- without a filter the select rule does not help: the update and delete rules themselves must refuse
select lives_ok($$update public.contact_messages set status = 'answered'$$, 'a resident''s update with no filter runs but changes no row');
select lives_ok($$delete from public.contact_messages$$, '...and so does a delete with no filter');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('S'));
select is((select count(*)::integer from public.contact_messages), 0, 'a stranger sees no message');
select is_empty($$update public.contact_messages set admin_note = 'x' where name = 'T-phone' returning 1$$, '...and changes none');
select is_empty($$delete from public.contact_messages where name = 'T-phone' returning 1$$, '...and deletes none');
select lives_ok($$update public.contact_messages set status = 'answered'$$, 'a stranger''s update with no filter runs but changes no row');
select lives_ok($$delete from public.contact_messages$$, '...and so does a delete with no filter');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.n('T-phone'), 1, 'the message is still there');
select is(tt.one('T-phone', 'status'), 'new', '...unchanged');

-- ---------------------------------------------------------------------------
-- 4. an admin reads and answers
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AD'));
select is((select count(*)::integer from public.contact_messages where name like 'T-%'), 5, 'the admin sees all messages (5)');
select isnt_empty($$update public.contact_messages set status = 'read' where name = 'T-phone' returning 1$$, 'the admin marks one as read');
select isnt_empty($$update public.contact_messages set status = 'answered', admin_note = 'Arandı, yarın dönecek.' where name = 'T-mail' returning 1$$, '...answers one with a note');
select throws_ok($$update public.contact_messages set status = 'closed' where name = 'T-phone'$$, '23514', null, 'a status we do not know is refused');
select throws_ok($$update public.contact_messages set admin_note = repeat('x', 1001) where name = 'T-phone'$$, '23514', null, 'a note over 1000 characters is refused');
select lives_ok($$update public.contact_messages set admin_note = repeat('x', 1000) where name = 'T-phone'$$, '...1000 is fine');
select throws_ok($$update public.contact_messages set message = 'Değişti değişti' where name = 'T-phone'$$, '42501', null, 'the admin cannot rewrite what the visitor wrote');
select throws_ok($$update public.contact_messages set name = 'Başka' where name = 'T-phone'$$, '42501', null, '...nor the name');
select throws_ok($$update public.contact_messages set email = 'x@y.com' where name = 'T-phone'$$, '42501', null, '...nor the e-mail');
select isnt_empty($$delete from public.contact_messages where name = 'T-both' returning 1$$, 'the admin deletes one');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.one('T-phone', 'status'), 'read', 'the status change was saved');
select is(tt.one('T-mail', 'admin_note'), 'Arandı, yarın dönecek.', '...and the note');
select is(tt.one('T-phone', 'message'), 'Merhaba, bilgi almak istiyorum.', 'the visitor''s message is unchanged');
select is(tt.n('T-both'), 0, 'the deleted message is gone');

select * from finish();
rollback;
