# Safe live checks of the hosted project (and the site) after a rollout. Visitor level only (the public key): nothing is written, no password is used.
import json, re, sys, urllib.request, urllib.error
SITE = 'https://imndllnuri.github.io/aen-bina-yon/'
API = 'https://dogcevoorjlgbmykaqdy.supabase.co'
import os
env = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env.local')).read()
PUB = re.search(r'VITE_SUPABASE_ANON_KEY=(\S+)', env).group(1)   # the PUBLIC key (it is in the site bundle anyway)
ok = fail = 0
def check(name, cond, detail=''):
    global ok, fail
    if cond: ok += 1; print('  ok   ', name)
    else: fail += 1; print('  FAIL ', name, detail)
def get(url, headers=None, method='GET', body=None):
    req = urllib.request.Request(url, method=method, headers=headers or {}, data=body)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)
H = {'apikey': PUB, 'authorization': f'Bearer {PUB}', 'content-type': 'application/json'}
rpc = lambda fn, args: get(f'{API}/rest/v1/rpc/{fn}', H, 'POST', json.dumps(args).encode())
refused = lambda st, body: st in (401, 403) or 'permission denied' in body.lower() or '42501' in body

print('1. THE SITE')
status, html, _ = get(SITE)
check('the site answers 200', status == 200)
scripts = re.findall(r'src="([^"]+\.js)"', html.decode())
check('the page loads a script bundle', len(scripts) >= 1, str(scripts))
text = ''
for s in scripts:
    u = 'https://imndllnuri.github.io' + s if s.startswith('/') else s
    st, b, _ = get(u); text += b.decode('utf-8', 'ignore')
for a in set(re.findall(r'assets/[A-Za-z0-9_.-]+\.js', text)):
    st, b, _ = get(SITE + a); text += b.decode('utf-8', 'ignore')
check('the slice 7 pages are in the live bundle', all(x in text for x in ['Havale Onayları', 'Elle ödeme gir', 'Bildirimi gönder', 'dekontlar']))
check('the slice 8 pages are in the live bundle', all(x in text for x in ['Son duyurular', 'Okuma raporu', 'Bildirimler', 'Okumayanlara tekrar gönder', 'Yeni duyuru']))
check('the slice 9 pages are in the live bundle', all(x in text for x in ['Yeni talep', 'Telefonla talep aç', 'sakin görmez', 'talep-fotolari', 'Çözümü değerlendirin']))
check('the slice 10 pages are in the live bundle (Tabloyu göster, İşlem Geçmişi, Hazirun cetveli, Yazdır / PDF, Excel’e aktar, Borç türleri, Hatırlatma Gönder)', all(x in text for x in ['Tabloyu göster', 'İşlem Geçmişi', 'Hazirun cetveli', 'Yazdır / PDF', 'Excel’e aktar', 'Borç türleri', 'Hatırlatma Gönder']))
check('the slice 11 page is in the live bundle (Profilim, E-posta bildirimleri, Şifreyi değiştir, Diğer cihazlardaki oturumları kapat)', all(x in text for x in ['Profilim', 'E-posta bildirimleri', 'Şifreyi değiştir', 'Diğer cihazlardaki oturumları kapat']))
check('the slice 12 pages are in the live bundle (Bize yazın, Haritada aç, Çerez Politikası, Mesafeli Satış Sözleşmesi, Sıkça Sorulan Sorular, Neler dahil?)', all(x in text for x in ['Bize yazın', 'Haritada aç', 'Çerez Politikası', 'Mesafeli Satış Sözleşmesi', 'Sıkça Sorulan Sorular', 'Neler dahil?', 'İletişim Mesajları']))
check('the slice 13 page is in the live bundle (Yönetici davet et, Yöneticiliği kaldır, Davet bekliyor)', all(x in text for x in ['Yönetici davet et', 'Yöneticiliği kaldır', 'Davet bekliyor']))
check('NO secret key in the live bundle', not re.search(r'sb_secret_[A-Za-z0-9_-]{16,}', text))
check('no service_role key in the live bundle', 'service_role' not in text)

UUID = '00000000-0000-0000-0000-000000000000'
def rpc_group(title, calls):
    print(title)
    for fn, args in calls.items():
        st, b, _ = rpc(fn, args); body = b.decode('utf-8', 'ignore')
        check(f'{fn}: refused for a visitor (HTTP {st})', refused(st, body), body[:160])
def table_group(tables):
    for t in tables:
        st, b, _ = get(f'{API}/rest/v1/{t}?select=*', H)
        check(f'{t} cannot be read by a visitor (HTTP {st})', st in (401, 403) or b'permission denied' in b.lower(), b[:120])

rpc_group('2. SLICE 7: A VISITOR CANNOT CALL THE HAVALE FUNCTIONS', {
  'submit_transfer_notice': {'p_request_id': UUID, 'p_unit': UUID, 'p_amount_kurus': 10000, 'p_sent_on': '2026-11-20', 'p_sender_name': 'Test Kişi', 'p_note': None, 'p_file_path': 'x/y.pdf'},
  'cancel_transfer_notice': {'p_notice': UUID}, 'approve_transfer_notice': {'p_notice': UUID, 'p_charge_ids': None}, 'reject_transfer_notice': {'p_notice': UUID, 'p_reason': 'deneme'},
  'preview_allocation': {'p_unit': UUID, 'p_payer': None, 'p_amount_kurus': 100, 'p_charge_ids': None},
  'record_manual_payment': {'p_request_id': UUID, 'p_unit': UUID, 'p_payer': None, 'p_payer_name': 'Test Kişi', 'p_method': 'cash', 'p_amount_kurus': 100, 'p_paid_on': '2026-11-20', 'p_charge_ids': None, 'p_note': None},
  'get_bank_accounts': {}, 'save_bank_accounts': {'p_company': UUID, 'p_accounts': []}, 'get_receipt': {'p_payment': UUID}})
rpc_group('3. SLICE 8: ANNOUNCEMENTS AND THE BELL', {
  'preview_announcement_audience': {'p_site': UUID, 'p_target': {'scope': 'site', 'audience': 'all'}},
  'save_announcement': {'p_id': None, 'p_site': UUID, 'p_title': 'Deneme', 'p_body': 'x', 'p_type': 'genel', 'p_pinned': False, 'p_target': {'scope': 'site', 'audience': 'all'}, 'p_publish_at': None, 'p_expire_at': None},
  'publish_announcement': {'p_id': UUID}, 'unpublish_announcement': {'p_id': UUID}, 'delete_announcement': {'p_id': UUID}, 'resend_announcement_unread': {'p_id': UUID},
  'list_announcements': {'p_site': UUID}, 'announcement_target': {'p_id': UUID}, 'announcement_report': {'p_id': UUID}, 'mark_announcement_read': {'p_announcement': UUID}})
table_group(['transfer_notices', 'notifications', 'announcements', 'announcement_reads', 'announcement_recipients'])
rpc_group('4. SLICE 9: REQUESTS', {
  'create_request': {'p_token': UUID, 'p_unit': UUID, 'p_category': 'asansor', 'p_title': 'Deneme', 'p_description': 'x', 'p_priority': 'normal', 'p_location': None, 'p_photos': [], 'p_requester': None},
  'update_request': {'p_id': UUID, 'p_category': 'asansor', 'p_title': 'Deneme', 'p_description': 'x', 'p_priority': 'normal', 'p_location': None},
  'cancel_request': {'p_id': UUID}, 'set_request_status': {'p_id': UUID, 'p_status': 'kapandi'}, 'set_request_triage': {'p_id': UUID, 'p_category': 'asansor', 'p_priority': 'acil'},
  'add_request_comment': {'p_request': UUID, 'p_body': 'x', 'p_internal': True}, 'rate_request': {'p_id': UUID, 'p_rating': 5}})
table_group(['requests', 'request_events', 'request_comments', 'request_photos'])
for bucket in ['dekontlar', 'talep-fotolari']:
    st, b, _ = get(f'{API}/storage/v1/object/public/{bucket}/{UUID}/{UUID}.pdf')
    check(f'the {bucket} bucket has no public files (HTTP {st})', st != 200)
    st, b, _ = get(f'{API}/storage/v1/object/list/{bucket}', H, 'POST', json.dumps({'prefix': '', 'limit': 10}).encode())
    check(f'a visitor sees no file in {bucket} (HTTP {st})', st in (400, 401, 403) or b.strip() == b'[]', b[:120])
    st, b, _ = get(f'{API}/storage/v1/object/{bucket}/{UUID}/{UUID}.jpg', {'apikey': PUB, 'authorization': f'Bearer {PUB}', 'content-type': 'image/jpeg'}, 'POST', b'\xff\xd8\xff\xe0 test')
    check(f'a visitor cannot upload into {bucket} (HTTP {st})', st in (400, 401, 403), b[:120])

rpc_group('5. SLICE 10: A VISITOR CANNOT CALL THE REPORT AND SETTINGS FUNCTIONS', {
  'dashboard_kpis': {'p_site': UUID},
  'report_monthly': {'p_site': UUID, 'p_from': '2026-01-01', 'p_to': '2026-11-01'},
  'report_debts': {'p_site': UUID, 'p_limit': 10},
  'report_collections': {'p_site': UUID, 'p_from': '2026-01-01', 'p_to': '2026-11-30', 'p_limit': 10},
  'report_collections_summary': {'p_site': UUID, 'p_from': '2026-01-01', 'p_to': '2026-11-30'},
  'report_residents': {'p_site': UUID}, 'report_attendance': {'p_site': UUID},
  'save_charge_type': {'p_company': UUID, 'p_id': None, 'p_name': 'Deneme', 'p_active': True, 'p_split': 'equal', 'p_tenant_visible': False, 'p_sort': 10},
  'delete_charge_type': {'p_id': UUID},
  'save_company_settings': {'p_company': UUID, 'p_ydo_rate': 10, 'p_commission_payer': 'resident', 'p_fee_pct': {}, 'p_due_day': 10, 'p_late_fee_rate': 5, 'p_late_fee_method': 'daily', 'p_grace_days': 0}})
print('6. SLICE 10: THE AUDIT LOG AND QUOTE REQUESTS')
st, b, _ = get(f'{API}/rest/v1/audit_log?select=id', H)
check(f'audit_log cannot be read by a visitor (HTTP {st})', st in (401, 403) or b'permission denied' in b.lower(), b[:120])
st, b, _ = get(f'{API}/rest/v1/audit_log', H, 'POST', json.dumps({'table_name': 'x', 'action': 'insert'}).encode())
check(f'a visitor cannot write into audit_log (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/audit_log?id=not.is.null', H, 'DELETE')
check(f'a visitor cannot delete from audit_log (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/audit_log?id=not.is.null', H, 'PATCH', json.dumps({'action': 'delete'}).encode())
check(f'a visitor cannot change audit_log (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/quote_requests?select=id', H)
check(f'quote_requests cannot be read by a visitor (HTTP {st})', st in (401, 403) or b'permission denied' in b.lower(), b[:120])
st, b, _ = get(f'{API}/rest/v1/quote_requests?id=eq.{UUID}', H, 'PATCH', json.dumps({'status': 'won'}).encode())
check(f'a visitor cannot change a quote request (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/quote_requests?id=not.is.null', H, 'DELETE')
check(f'a visitor cannot delete quote requests (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/charge_types', H, 'POST', json.dumps({'company_id': UUID, 'name': 'xxx', 'code': 'xxx'}).encode())
check(f'a visitor cannot insert a charge type directly (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/companies?id=eq.{UUID}', H, 'PATCH', json.dumps({'settings': {'payment_mode': 'mock'}}).encode())
check(f'a visitor cannot change company settings (HTTP {st})', st in (401, 403) or (st == 200 and b.strip() in (b'', b'[]')), b[:100])

print('7. SLICE 11: A VISITOR CANNOT TOUCH PROFILES OR THE E-MAIL CHOICES')
rpc_group('   (function)', {'save_my_notification_prefs': {'p_prefs': {'email_finance': False}}})
st, b, _ = get(f'{API}/rest/v1/profiles?select=id,notify_prefs', H)
check(f'profiles cannot be read by a visitor (HTTP {st})', st in (401, 403) or b'permission denied' in b.lower() or b.strip() == b'[]', b[:120])
st, b, _ = get(f'{API}/rest/v1/profiles?id=eq.{UUID}', H, 'PATCH', json.dumps({'notify_prefs': {}}).encode())
check(f'a visitor cannot write notify_prefs (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/profiles?id=eq.{UUID}', H, 'PATCH', json.dumps({'full_name': 'x'}).encode())
check(f'a visitor cannot change a name (HTTP {st})', st in (401, 403), b[:120])

print('8. SLICE 12: A VISITOR CAN ONLY SEND A MESSAGE')
st, b, _ = get(f'{API}/rest/v1/contact_messages?select=id', H)
check(f'contact_messages cannot be read by a visitor (HTTP {st})', st in (401, 403) or b'permission denied' in b.lower(), b[:120])
st, b, _ = get(f'{API}/rest/v1/contact_messages', H, 'POST', json.dumps({'name': 'Test Kişi', 'phone': '0532 000 00 00', 'message': 'Merhaba merhaba', 'status': 'answered'}).encode())
check(f'a visitor cannot choose the status (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/contact_messages?id=eq.{UUID}', H, 'PATCH', json.dumps({'status': 'read'}).encode())
check(f'a visitor cannot change a message (HTTP {st})', st in (401, 403), b[:120])
st, b, _ = get(f'{API}/rest/v1/contact_messages?id=not.is.null', H, 'DELETE')
check(f'a visitor cannot delete messages (HTTP {st})', st in (401, 403), b[:120])

print('9. SLICE 13: A VISITOR CANNOT TOUCH THE ADMINS')
rpc_group('   (functions)', {
  'list_site_admins': {'p_site': UUID},
  'add_site_admin': {'p_site': UUID, 'p_profile': UUID},
  'remove_site_admin': {'p_site': UUID, 'p_profile': UUID}})
for method, path, body in [('POST', 'site_members', {'profile_id': UUID, 'site_id': UUID, 'role': 'admin'}), ('DELETE', 'site_members?profile_id=not.is.null', None), ('PATCH', 'site_members?profile_id=not.is.null', {'role': 'staff'})]:
    st, b, _ = get(f'{API}/rest/v1/{path}', H, method, json.dumps(body).encode() if body else None)
    check(f'a visitor cannot {method} site_members (HTTP {st})', st in (401, 403), b[:120])
# the invite function wants a logged-in admin: with only the public key it must say 401 and create nothing
st, b, _ = get(f'{API}/functions/v1/invite-resident', {**H, 'origin': 'https://imndllnuri.github.io'}, 'POST', json.dumps({'action': 'invite-admin', 'email': 'nobody@example.invalid', 'fullName': 'Test Kişi', 'siteId': UUID}).encode())
check(f'the invite function refuses a call without a login (HTTP {st})', st in (401, 403), b[:120])

print(f'\nRESULT: {ok} passed, {fail} failed')
sys.exit(1 if fail else 0)
