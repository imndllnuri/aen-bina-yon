# Breaks of supabase/migrations/0013_late_fees.sql (slice 14, the late-fee engine)
# Not listed on purpose (equivalent mutants): the site-row lock in apply_late_fees (two admins at the same moment cannot be tested
# from one session), the second "no fee on a fee line" guard (the type rule covers it), the explicit column revoke (no grant exists),
# and the `authenticated` word in the revokes of the private functions (the schema gives that role no right by default, so the word changes nothing).
MIGRATION = 'supabase/migrations/0013_late_fees.sql'
RATE = "coalesce(case when jsonb_typeof(c.settings #> '{rules,late_fee_rate}') = 'number' then (c.settings #>> '{rules,late_fee_rate}')::numeric end, 5)"
GRACE = "coalesce(case when jsonb_typeof(c.settings #> '{rules,grace_days}') = 'number' then (c.settings #>> '{rules,grace_days}')::numeric::integer end, 0)"
APPLY_CHECK = "  if v_uid is null or p_site is null or not private.is_site_admin(p_site) then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n  if p_request_id is null or"
PREVIEW_CHECK = "  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n  select s.company_id into v_company from public.sites s where s.id = p_site;"
BREAKS = [
 # ---- columns and the batch kind
 ('A01', 'the two late-fee columns need not go together', "  add constraint charges_late_fee_pair check ((late_fee_source_id is null) = (late_fee_through is null)),\n", ""),
 ('A02', 'a fee line can belong to itself', ",\n  add constraint charges_late_fee_not_self check (late_fee_source_id is distinct from id);", ";"),
 ('A03', 'deleting a debt deletes its fee lines', "references public.charges (id) on delete restrict,", "references public.charges (id) on delete cascade,"),
 ('A04', 'late_fee is not an allowed kind of batch', "check (split_method in ('equal', 'land_share', 'gross_m2', 'per_unit', 'late_fee'));", "check (split_method in ('equal', 'land_share', 'gross_m2', 'per_unit'));"),
 # ---- the rules
 ('R01', 'the default rate is 6', RATE + ", 0), 10)", "coalesce(case when jsonb_typeof(c.settings #> '{rules,late_fee_rate}') = 'number' then (c.settings #>> '{rules,late_fee_rate}')::numeric end, 6), 0), 10)"),
 ('R02', 'the default method is monthly', "case when c.settings #>> '{rules,late_fee_method}' = 'monthly' then 'monthly' else 'daily' end", "case when c.settings #>> '{rules,late_fee_method}' = 'daily' then 'daily' else 'monthly' end"),
 ('R03', 'a saved rate above 10 is not capped', "least(greatest(" + RATE + ", 0), 10)", "greatest(" + RATE + ", 0)"),
 ('R04', 'a negative saved rate is not raised to 0', "least(greatest(" + RATE + ", 0), 10)", "least(" + RATE + ", 10)"),
 ('R05', 'a saved grace above 60 is not capped', "least(greatest(" + GRACE + ", 0), 60)", "greatest(" + GRACE + ", 0)"),
 ('R06', 'a negative saved grace is not raised to 0', "least(greatest(" + GRACE + ", 0), 60)", "least(" + GRACE + ", 60)"),
 ('R07', 'a saved rate that is text is cast (and fails)', "case when jsonb_typeof(c.settings #> '{rules,late_fee_rate}') = 'number' then (c.settings #>> '{rules,late_fee_rate}')::numeric end", "(c.settings #>> '{rules,late_fee_rate}')::numeric"),
 # ---- the formula
 ('F01', 'the first late day is the grace end itself (off by one)', "v_start := p_due + p_grace + 1;", "v_start := p_due + p_grace;"),
 ('F02', 'the last late day is not counted', "v_days := p_as_of - v_start + 1;", "v_days := p_as_of - v_start;"),
 ('F03', 'a month has 36 days in the daily method', "v_fee := v_sum * p_rate / 3000;", "v_fee := v_sum * p_rate / 3600;"),
 ('F04', 'a payment on the last grace day does not count for the first late day', "greatest(p_pay_dates[i], v_start - 1)", "greatest(p_pay_dates[i], v_start)"),
 ('F05', 'a payment dated after the as-of day makes the fee bigger', "v_sum := v_sum - p_pay_amounts[i] * greatest(0, p_as_of - greatest(p_pay_dates[i], v_start - 1));", "v_sum := v_sum - p_pay_amounts[i] * (p_as_of - greatest(p_pay_dates[i], v_start - 1));"),
 ('F06', 'the monthly method does not count the started month', "v_blocks := (p_as_of - v_start) / 30 + 1;", "v_blocks := (p_as_of - v_start) / 30;"),
 ('F07', 'a block has 31 days when a payment is placed in it', "(p_pay_dates[i] - v_start) / 30 end);", "(p_pay_dates[i] - v_start) / 31 end);"),
 ('F08', 'a payment before the first late day helps no block', "case when p_pay_dates[i] < v_start then -1 else", "case when p_pay_dates[i] < v_start then 0 else"),
 ('F09', 'the fee is cut, not rounded', "return round(greatest(v_fee, 0), 2);", "return trunc(greatest(v_fee, 0), 2);"),
 ('F10', 'the first late day gives no fee', "  if p_as_of < v_start then\n    return 0;", "  if p_as_of <= v_start then\n    return 0;"),
 ('F11', 'an over-paid debt gives a negative fee', "return round(greatest(v_fee, 0), 2);", "return round(v_fee, 2);"),
 ('F12', 'an unknown method is accepted', "if p_method is null or p_method not in ('daily', 'monthly') then", "if p_method is null then"),
 ('F13', 'a payment makes the fee bigger', "v_sum := v_sum - p_pay_amounts[i] * greatest(0, p_as_of", "v_sum := v_sum + p_pay_amounts[i] * greatest(0, p_as_of"),
 ('F14', 'the monthly rate is divided by 1000', "v_fee := v_sum * p_rate / 100;", "v_fee := v_sum * p_rate / 1000;"),
 ('F15', 'payment dates and amounts need not pair up', "\n     or v_n <> coalesce(array_length(p_pay_amounts, 1), 0) then", " then"),
 # ---- which debts, how much is already billed
 ('W01', 'a cancelled debt earns a fee', "       and c.voided_at is null\n       and c.late_fee_source_id is null", "       and c.late_fee_source_id is null"),
 ('W02', 'a hand-written fee line earns a fee', "t.code not in ('gecikme_tazminati', 'devir')", "t.code not in ('devir')"),
 ('W03', 'old carried debt (Devir) earns a fee', "t.code not in ('gecikme_tazminati', 'devir')", "t.code not in ('gecikme_tazminati')"),
 ('W04', 'the debts of EVERY site are listed', "     where b.site_id = p_site\n       and c.voided_at is null", "     where c.voided_at is null"),
 ('W05', 'a cancelled payment still counts', "where a.charge_id = c.id and p.status = 'approved'\n      ) pay", "where a.charge_id = c.id\n      ) pay"),
 ('W06', 'a cancelled (forgiven) fee line is no longer counted as billed', "select sum(x.amount) as billed from public.charges x where x.late_fee_source_id = s.id   -- cancelled lines count: forgiven", "select sum(x.amount) as billed from public.charges x where x.late_fee_source_id = s.id and x.voided_at is null"),
 ('W07', 'what is already billed is not taken off', "f.fee, coalesce(bl.billed, 0), (f.fee - coalesce(bl.billed, 0))", "f.fee, coalesce(bl.billed, 0), f.fee"),
 ('W08', 'fees billed too high are not shown', "   where abs(f.fee - coalesce(bl.billed, 0)) >= 0.01", "   where (f.fee - coalesce(bl.billed, 0)) >= 0.01"),
 ('W09', 'the unpaid amount shown is the whole debt', "s.amount, (s.amount - s.paid), (p_as_of - (s.due_date + s.grace_days)),", "s.amount, s.amount, (p_as_of - (s.due_date + s.grace_days)),"),
 ('W10', 'the late days shown ignore the grace', "(p_as_of - (s.due_date + s.grace_days)),", "(p_as_of - s.due_date),"),
 ('W11', 'the payment day is the UTC day, not the Istanbul day', "(p.paid_at at time zone 'Europe/Istanbul')::date order by p.paid_at", "(p.paid_at at time zone 'UTC')::date order by p.paid_at"),
 # ---- preview
 ('P01', 'anybody can look at the preview', PREVIEW_CHECK, "  select s.company_id into v_company from public.sites s where s.id = p_site;"),
 ('P02', 'the preview always says the fee type is ready', "'type_ready', exists (select 1 from public.charge_types t where t.company_id = v_company and t.code = 'gecikme_tazminati' and t.active),", "'type_ready', true,"),
 ('P03', 'the preview shows the whole fee, not the new part', "'amount_kurus', round(x.due_fee * 100)::bigint", "'amount_kurus', round(x.fee_total * 100)::bigint"),
 ('P04', 'the preview always says rate 5', "'rate', v_rules.rate,", "'rate', 5,"),
 ('P05', 'the preview says every debt is visible to tenants', "'tenant_visible', x.tenant_visible,", "'tenant_visible', true,"),
 # ---- apply
 ('X01', 'anybody can apply', APPLY_CHECK, "  if p_request_id is null or"),
 ('X02', 'a request id is not needed', "if p_request_id is null or p_as_of is null or p_expected_count is null or p_expected_kurus is null then", "if p_as_of is null or p_expected_count is null or p_expected_kurus is null then"),
 ('X03', 'the numbers the admin saw are not needed', "p_as_of is null or p_expected_count is null or p_expected_kurus is null then", "p_as_of is null then"),
 ('X04', 'the same request id does not return the first batch', "  select b.id into v_batch from public.charge_batches b where b.request_id = p_request_id and b.site_id = p_site;\n  if v_batch is not null then\n    return v_batch;\n  end if;\n  if exists", "  if exists"),
 ('X05', 'a request id of another site is not refused', "  if exists (select 1 from public.charge_batches b where b.request_id = p_request_id) then\n    raise exception 'request_id_used';\n  end if;\n", ""),
 ('X06', 'an old preview (another day) can be applied', "  if p_as_of <> v_today then\n    raise exception 'preview_outdated';\n  end if;\n", ""),
 ('X07', 'a missing fee type is not noticed', "  if v_type is null then\n    raise exception 'late_fee_type_missing';\n  end if;\n", ""),
 ('X08', 'the ticked list is ignored: everything is billed', "     and (p_charge_ids is null or x.charge_id = any (p_charge_ids));", "     and true;"),
 ('X09', 'a fee that is too high is billed as a negative line', "   where x.due_fee >= 0.01\n     and (p_charge_ids", "   where x.due_fee <> 0\n     and (p_charge_ids"),
 ('X10', 'an empty list is not "nothing to charge"', "  if v_count = 0 then\n    raise exception 'nothing_to_charge';\n  end if;\n", ""),
 ('X11', 'the numbers the admin saw are not compared', "  if v_count <> p_expected_count or v_kurus <> p_expected_kurus then\n    raise exception 'preview_outdated';\n  end if;\n", ""),
 ('X12', 'a run above 10 million is not refused', "  if v_kurus > 999999999 then\n    raise exception 'amount_too_large';\n  end if;\n", ""),
 ('X13', 'the batch counts one line too many', "'late_fee', v_kurus::numeric / 100, v_count, v_kurus::numeric / 100,", "'late_fee', v_kurus::numeric / 100, v_count + 1, v_kurus::numeric / 100,"),
 ('X14', 'a fee line gets today as its due date', "(e ->> 'due_date')::date, (e ->> 'visible')::boolean, v_uid,", "v_today, (e ->> 'visible')::boolean, v_uid,"),
 ('X15', 'a fee line is shown to tenants even for an owner-only debt', "(e ->> 'due_date')::date, (e ->> 'visible')::boolean, v_uid,", "(e ->> 'due_date')::date, true, v_uid,"),
 ('X16', 'a fee line forgets the month of its debt', "select (e ->> 'unit_id')::uuid, v_type, v_batch, nullif(e ->> 'period', '')::date,", "select (e ->> 'unit_id')::uuid, v_type, v_batch, null,"),
 ('X17', 'a fee line says it was calculated up to yesterday', "(e ->> 'charge_id')::uuid, v_today\n    from jsonb_array_elements(v_rows) e;", "(e ->> 'charge_id')::uuid, v_today - 1\n    from jsonb_array_elements(v_rows) e;"),
 ('X18', 'a fee line has no author', "(e ->> 'visible')::boolean, null,\n         (e ->> 'charge_id')::uuid".replace("null", "v_uid"), "(e ->> 'visible')::boolean, null,\n         (e ->> 'charge_id')::uuid"),
 ('X19', 'the batch always says "shown to tenants"', "not exists (select 1 from jsonb_array_elements(v_rows) e where not (e ->> 'visible')::boolean), v_uid", "true, v_uid"),
 ('X20', 'the batch has no author', "where not (e ->> 'visible')::boolean), v_uid\n  )\n  returning id into v_batch;", "where not (e ->> 'visible')::boolean), null\n  )\n  returning id into v_batch;"),
 ('X21', 'the description forgets the day', "|| ' · ' || to_char(v_today, 'DD.MM.YYYY') || ' itibarıyla', 200),", "|| ' itibarıyla', 200),"),
 ('X22', 'the lines are written with the whole fee, not the new part', "'visible', x.tenant_visible, 'kurus', round(x.due_fee * 100)::bigint)", "'visible', x.tenant_visible, 'kurus', round(x.fee_total * 100)::bigint)"),
 # ---- a debt that has fee lines
 ('G01', 'a debt with live fee lines can be cancelled', "  if exists (select 1 from public.charges f where f.late_fee_source_id = p_charge and f.voided_at is null) then\n    raise exception 'has_late_fees';   -- cancel its late-fee lines first\n  end if;\n", ""),
 ('G02', 'a batch of debts with live fee lines can be cancelled', "  if exists (select 1 from public.charges c join public.charges f on f.late_fee_source_id = c.id\n              where c.batch_id = p_batch and c.voided_at is null and f.voided_at is null) then\n    raise exception 'has_late_fees';\n  end if;\n", ""),
 ('G03', 'such a batch can be deleted (and meets the raw foreign key)', "  if exists (select 1 from public.charges c join public.charges f on f.late_fee_source_id = c.id where c.batch_id = p_batch) then\n    raise exception 'batch_has_late_fees';\n  end if;\n", ""),
 ('G04', 'a debt cannot be cancelled even when its fee lines were forgiven', "where f.late_fee_source_id = p_charge and f.voided_at is null) then", "where f.late_fee_source_id = p_charge) then"),
 ('G05', 'a batch with only forgiven fee lines can be deleted', "join public.charges f on f.late_fee_source_id = c.id where c.batch_id = p_batch) then\n    raise exception 'batch_has_late_fees'", "join public.charges f on f.late_fee_source_id = c.id where c.batch_id = p_batch and f.voided_at is null) then\n    raise exception 'batch_has_late_fees'"),
 ('G06', 'a batch with only forgiven fee lines cannot be cancelled', "where c.batch_id = p_batch and c.voided_at is null and f.voided_at is null) then", "where c.batch_id = p_batch and c.voided_at is null) then"),
 # ---- the bell
 ('N01', 'the bell of a fee line looks like the one of a normal debt', "left(case when n.late_fee_source_id is not null\n                     then coalesce(n.description, 'Gecikme tazminatı') || ': ' || private.format_try(n.amount)\n                     else", "left(case when false\n                     then ''\n                     else"),
 ('N02', 'the bell of a normal debt lost its "son ödeme"', "|| ': ' || private.format_try(n.amount) || ' · son ödeme ' || to_char(n.due_date, 'DD.MM.YYYY') end, 500),", "|| ': ' || private.format_try(n.amount) end, 500),"),
 # ---- grants
 ('S01', 'a visitor can run the preview', "grant execute on function public.preview_late_fees(uuid) to authenticated;", "grant execute on function public.preview_late_fees(uuid) to authenticated, anon;"),
 ('S02', 'a visitor can apply', "grant execute on function public.apply_late_fees(uuid, uuid, date, uuid[], integer, bigint) to authenticated;", "grant execute on function public.apply_late_fees(uuid, uuid, date, uuid[], integer, bigint) to authenticated, anon;"),
]
