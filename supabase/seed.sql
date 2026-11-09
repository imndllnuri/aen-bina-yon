-- supabase/seed.sql
-- Demo data. It runs on `supabase db reset` (local only). For the hosted project it is run by hand
-- once (see README). Use DEMO data only: GitHub Pages is a demo host.
-- Fixed ids make the rows easy to find. This file can be run again safely.

insert into public.companies (id, name)
values ('00000000-0000-0000-0000-000000000001', '[FİRMA ADI]')
on conflict (id) do nothing;

insert into public.sites (id, company_id, name, address, il, ilce)
values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
        'Demo Sitesi', '[Mahalle, Cadde, No]', 'Kayseri', 'Melikgazi')
on conflict (id) do nothing;

insert into public.blocks (id, site_id, name)
values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'A Blok'),
       ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'B Blok')
on conflict (id) do nothing;

-- 8 units per block: 4 floors, 2 doors per floor. Door numbers 1-8 in A, 9-16 in B.
-- Sizes and arsa payı vary a little so that "by m2" and "by arsa payı" give different results.
insert into public.units (block_id, door_no, floor, type, gross_m2, land_share)
select b.id,
       (n + case when b.name = 'B Blok' then 8 else 0 end)::text,
       ((n - 1) / 2) + 1,
       'konut',
       case when n % 2 = 1 then 95.00 else 120.00 end,
       case when n % 2 = 1 then 100.0000 else 126.0000 end
from public.blocks b
cross join generate_series(1, 8) as n
where b.site_id = '00000000-0000-0000-0000-000000000010'
on conflict do nothing;

-- Charge types (Aidat, Yakıt, Demirbaş, Ek Toplama, Gecikme Tazminatı, Devir Bakiyesi) are NOT
-- seeded here: migration 0003 creates them for every company (a trigger covers new companies), so
-- the hosted project gets them too. Demo residents need real auth users and are created in the dashboard.
