# Breaks of supabase/migrations/0012_admins.sql (slice 13)
MIGRATION = 'supabase/migrations/0012_admins.sql'
CHECK_ADD = "  if (select auth.uid()) is null or p_site is null or p_profile is null or not private.is_site_admin(p_site) then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n\n  -- one change per site at a time\n  select s.company_id"
CHECK_REMOVE = "  if (select auth.uid()) is null or p_site is null or p_profile is null or not private.is_site_admin(p_site) then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n\n  -- one change per site at a time (two admins"
CHECK_LIST = "  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n  return query"
BREAKS = [
 ('A01', 'an admin can delete a site_members row directly', "revoke insert, update, delete on public.site_members from authenticated;", "revoke insert, update on public.site_members from authenticated;"),
 ('A02', 'an admin can insert a member directly (column grant stays)', "revoke insert (profile_id, site_id, role) on public.site_members from authenticated;\n", ""),
 ('A03', 'an admin can change a role directly', "revoke update (role) on public.site_members from authenticated;\n", ""),
 ('L01', 'anybody can list the admins of a site', CHECK_LIST, "  if false then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n  return query"),
 ('L02', 'the list also shows staff and auditors', "     and m.role = 'admin'\n   order by", "   order by"),
 ('L03', 'the list never says who the caller is', "(m.profile_id = (select auth.uid()))\n    from", "false\n    from"),
 ('L04', 'the list shows the newest first', "order by m.created_at, p.full_name nulls last, m.profile_id;", "order by m.created_at desc, p.full_name nulls last, m.profile_id;"),
 ('L05', 'the list shows the admins of every site', "   where m.site_id = p_site\n     and m.role = 'admin'\n   order by", "   where m.role = 'admin'\n   order by"),
 ('D01', 'anybody can add an admin', CHECK_ADD, "  if false then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n\n  -- one change per site at a time\n  select s.company_id"),
 ('D02', 'a deactivated person can be made admin', "  if not exists (select 1 from public.profiles p where p.id = p_profile and p.is_active)\n     or not (", "  if false\n     or not ("),
 ('D03', 'a person of ANOTHER company can be made admin', "       or not (\n         exists (select 1 from public.unit_residents r where r.profile_id = p_profile)\n         or exists (select 1 from public.site_members m where m.profile_id = p_profile))\n     ) then", "       or true\n     ) then"),
 ('D04', 'a brand-new account cannot be made admin', "       or not (\n         exists (select 1 from public.unit_residents r where r.profile_id = p_profile)\n         or exists (select 1 from public.site_members m where m.profile_id = p_profile))\n     ) then", "       or false\n     ) then"),
 ('D05', 'a resident of this company cannot be made admin', "          where r.profile_id = p_profile and s.company_id = v_company)", "          where r.profile_id = p_profile and s.company_id <> v_company)"),
 ('D06', 'a member of another site of this company cannot be made admin', "          where m.profile_id = p_profile and s.company_id = v_company)", "          where m.profile_id = p_profile and s.company_id <> v_company)"),
 ('D07', 'adding the same admin twice is not noticed', "  if exists (select 1 from public.site_members m where m.site_id = p_site and m.profile_id = p_profile) then\n    raise exception 'already_member';\n  end if;\n", ""),
 ('D08', 'the new member gets the role staff', "values (p_profile, p_site, 'admin');", "values (p_profile, p_site, 'staff');"),
 ('D09', 'the new admin goes to the wrong site (the first site of the company)', "insert into public.site_members (profile_id, site_id, role) values (p_profile, p_site, 'admin');", "insert into public.site_members (profile_id, site_id, role) select p_profile, s.id, 'admin' from public.sites s where s.company_id = v_company order by s.created_at limit 1;"),
 ('R01', 'anybody can remove an admin', CHECK_REMOVE, "  if false then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n\n  -- one change per site at a time (two admins"),
 ('R02', 'an admin can remove themselves', "  if p_profile = (select auth.uid()) then\n    raise exception 'cannot_remove_self';\n  end if;\n", ""),
 ('R03', 'removing a person who is no admin is not noticed', "  if not exists (select 1 from public.site_members m where m.site_id = p_site and m.profile_id = p_profile and m.role = 'admin') then\n    raise exception 'not_admin';\n  end if;\n", ""),
 ('R04', 'a removal takes the person out of every site', "delete from public.site_members m where m.site_id = p_site and m.profile_id = p_profile and m.role = 'admin';", "delete from public.site_members m where m.profile_id = p_profile and m.role = 'admin';"),
 ('R05', 'a removal also removes staff rows of the person in the site', "delete from public.site_members m where m.site_id = p_site and m.profile_id = p_profile and m.role = 'admin';", "delete from public.site_members m where m.site_id = p_site and m.profile_id = p_profile;"),
 ('T01', 'the audit log never names the person', "create trigger audit_log_name_person before insert on public.audit_log\n  for each row execute function private.audit_log_name_person();", "-- no trigger"),
 ('T02', 'the name has no e-mail fallback', "coalesce(nullif(btrim(p.full_name), ''), p.email)", "p.full_name"),
 ('T03', 'a removed person is not named (old data)', "      if new.old_data is not null then new.old_data := new.old_data || jsonb_build_object('person', v_name); end if;\n", ""),
 ('T04', 'an added person is not named (new data)', "      if new.new_data is not null then new.new_data := new.new_data || jsonb_build_object('person', v_name); end if;\n", ""),
]
