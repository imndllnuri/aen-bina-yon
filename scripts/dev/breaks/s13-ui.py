# Breaks of the slice 13 front end (Yöneticiler) and of the pure logic of the invite function
ADM = 'src/features/admins/'
PAGE = 'src/features/admin/AdminsPage.tsx'
DLG = 'src/features/admin/components/InviteAdminDialog.tsx'
LNK = 'src/features/admin/components/InviteLinkDialog.tsx'
FN = 'supabase/functions/invite-resident/logic.ts'
T_FN = 'supabase/functions/invite-resident/logic.test.ts'
T_API, T_MSG, T_SCH = ADM + 'api.test.ts', ADM + 'lib/messages.test.ts', ADM + 'lib/schemas.test.ts'
T_PAGE = 'src/features/admin/AdminsPage.test.tsx'
T_INV = 'src/features/admin/api.invite.test.ts'
T_LIB = 'src/features/admin/lib/lib.test.ts'
LAY, T_LAY = 'src/app/layouts/AdminLayout.tsx', 'src/app/layouts/layouts.test.tsx'
BREAKS = [
 # ---- the logic of the invite function ----
 ('F01', 'an admin-link request needs no site id', FN, "    if (!UUID.test(text('siteId'))) return { ok: false, message: 'siteId must be a uuid' }\n    if (!UUID.test(text('profileId')))", "    if (!UUID.test(text('profileId')))", T_FN),
 ('F02', 'the site id of an admin invite is not lower-cased', FN, "phone: phone === '' ? null : phone, siteId: text('siteId').toLowerCase() } }", "phone: phone === '' ? null : phone, siteId: text('siteId') } }", T_FN),
 ('F03', 'a link is given to a person who is no admin of the site', FN, "  if (!subject.isAdminOfThisSite) return { allowed: false, reason: 'not_admin' }\n", "", T_FN),
 ('F04', 'a link is given to an admin who finished onboarding', FN, "  if (subject.kvkkConsentAt !== null) return { allowed: false, reason: 'already_active' }\n  return { allowed: true }\n}\n\n/**\n * What the answer", "  return { allowed: true }\n}\n\n/**\n * What the answer", T_FN),
 ('F05', 'a refused person is told as a plain failure', FN, "  if (error?.message === 'person_not_found') return 'email_in_use_elsewhere'", "  if (error?.message === 'person_not_found') return 'failed'", T_FN),
 ('F06', '"already a member" is told as a failure', FN, "  if (error?.message === 'already_member') return 'already_linked'\n", "", T_FN),
 ('F07', 'a database refusal is told as a failure', FN, "  if (error?.code === '42501') return 'forbidden'\n", "", T_FN),
 ('F08', 'a link is given to the caller', FN, "export function decideAdminLink(subject: AdminLinkSubject): AdminLinkDecision {\n  if (subject.isCaller) return { allowed: false, reason: 'self' }\n", "export function decideAdminLink(subject: AdminLinkSubject): AdminLinkDecision {\n", T_FN),
 ('F09', 'a link is given for a deactivated admin', FN, "  if (!subject.isActive) return { allowed: false, reason: 'inactive' }\n  if (!subject.isAdminOfThisSite)", "  if (!subject.isAdminOfThisSite)", T_FN),
 ('F10', 'an admin invite accepts a phone like "abc"', FN, "    if (phone !== '' && !PHONE.test(phone)) return { ok: false, message: 'invalid phone' }\n    if (!UUID.test(text('siteId')))", "    if (!UUID.test(text('siteId')))", T_FN),
 # ---- the data calls ----
 ('A01', 'the list asks for the wrong function', ADM + 'api.ts', "rpc('list_site_admins'", "rpc('remove_site_admin'", T_API),
 ('A02', 'the list is not limited to the site', ADM + 'api.ts', "{ p_site: siteId })\n  if (error) throw error\n  return data.map", "{})\n  if (error) throw error\n  return data.map", T_API),
 ('A03', 'the activation date shows the "since" date', ADM + 'api.ts', "activatedAt: row.kvkk_consent_at,", "activatedAt: row.since,", T_API),
 ('A04', 'the caller is never marked', ADM + 'api.ts', "isSelf: row.is_self,", "isSelf: false,", T_API),
 ('A05', 'removing asks for the wrong function', ADM + 'api.ts', "rpc('remove_site_admin'", "rpc('add_site_admin'", T_API),
 ('A06', 'removing names the wrong person', ADM + 'api.ts', "{ p_site: siteId, p_profile: profileId }", "{ p_site: siteId, p_profile: siteId }", T_API),
 ('A07', 'a refusal when removing is swallowed', ADM + 'api.ts', "  const { error } = await client().rpc('remove_site_admin', { p_site: siteId, p_profile: profileId })\n  if (error) throw error", "  await client().rpc('remove_site_admin', { p_site: siteId, p_profile: profileId })", T_API),
 ('A08', 'an admin invite is sent as a resident invite', 'src/features/admin/api.ts', "callInviteFunction({ action: 'invite-admin', ...input })", "callInviteFunction({ action: 'invite', ...input })", T_INV),
 ('A09', 'a new admin link is asked as a resident link', 'src/features/admin/api.ts', "callInviteFunction({ action: 'admin-link', siteId, profileId })", "callInviteFunction({ action: 'link', siteId, profileId })", T_INV),
 # ---- the words and rules ----
 ('M01', '"already linked" says unit text for an admin', ADM + 'lib/messages.ts', "already_linked: 'Bu kişi zaten bu sitenin yöneticisi.'", "already_linked: 'Bu kişi bu dairede zaten aynı ilişkiyle kayıtlı.'", T_MSG),
 ('M02', 'the "cannot remove yourself" text is gone', ADM + 'lib/messages.ts', "    case 'cannot_remove_self':\n      return 'Kendinizi yönetici listesinden çıkaramazsınız. Başka bir yönetici sizi çıkarabilir.'\n", "", T_MSG),
 ('M03', 'the "not an admin" text is gone', ADM + 'lib/messages.ts', "    case 'not_admin':\n      return 'Bu kişi bu sitenin yöneticisi değil (belki zaten çıkarılmış). Listeyi yenileyin.'\n", "", T_MSG),
 ('M04', 'a refusal (42501) has no Turkish text', ADM + 'lib/messages.ts', "if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'", "if (e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'", T_MSG),
 ('M05', 'another company\'s e-mail is told as "in use by another unit"', ADM + 'lib/messages.ts', "email_in_use_elsewhere: 'Bu e-posta adresi başka bir firmanın hesabında kullanılıyor.", "email_in_use_elsewhere: 'Bu e-posta adresi kullanılıyor.", T_MSG),
 ('S01', 'the admin invite asks for a unit too', ADM + 'lib/schemas.ts', "pick({ fullName: true, email: true, phone: true })", "pick({ fullName: true, email: true, phone: true, unitId: true })", T_SCH),
 ('S02', 'the admin invite does not ask for the name', ADM + 'lib/schemas.ts', "pick({ fullName: true, email: true, phone: true })", "pick({ email: true, phone: true })", T_SCH),
 ('S03', 'the admin invite does not ask for the e-mail', ADM + 'lib/schemas.ts', "pick({ fullName: true, email: true, phone: true })", "pick({ fullName: true, phone: true })", T_SCH),
 ('S04', 'the invite link message does not say "as an admin"', 'src/features/admin/lib/invite-message.ts', "options.admin ? 'bina yönetimi portalına yönetici olarak davet edildiniz'", "options.admin ? 'bina yönetimi portalına davet edildiniz'", T_LIB),
 ('S05', 'the link dialog does not say "as an admin"', LNK, "{admin ? ' (yönetici olarak)' : ''}", "{''}", T_PAGE),
 # ---- the page ----
 ('P01', 'a pending admin is not noticed', PAGE, "const pending = a.isActive && a.activatedAt === null", "const pending = false", T_PAGE),
 ('P02', 'a switched-off admin shows "Etkin" or nothing', PAGE, "{!a.isActive && <Badge variant=\"destructive\">Hesap devre dışı</Badge>}", "", T_PAGE),
 ('P03', 'the caller gets a remove button', PAGE, "{a.isSelf ? (", "{false ? (", T_PAGE),
 ('P04', 'the caller is not marked "Siz"', PAGE, "{a.isSelf && <Badge variant=\"secondary\">Siz</Badge>}", "", T_PAGE),
 ('P05', 'a removal is not confirmed first', PAGE, "onClick={() => setRemoving(a)}", "onClick={() => void removeAdmin(site.id, a.profileId)}", T_PAGE),
 ('P06', 'the list is not loaded again after a removal', PAGE, "            } finally {\n              await refresh()\n            }", "            } finally {\n              /* nothing */\n            }", T_PAGE),
 ('P07', 'the list is not loaded again after an invite', PAGE, "  const onInvited = async ({ result, name, phone }: InviteAdminDone) => {\n    await refresh()\n", "  const onInvited = async ({ result, name, phone }: InviteAdminDone) => {\n", T_PAGE),
 ('P08', 'the page asks to remove the wrong person', PAGE, "await removeAdmin(site.id, removing.profileId)", "await removeAdmin(site.id, removing.profileId.slice(1))", T_PAGE),
 ('P09', 'a new link asks for the wrong site', PAGE, "await requestAdminLink(site.id, admin.profileId)", "await requestAdminLink(admin.profileId, admin.profileId)", T_PAGE),
 ('P10', 'a link problem is not shown', PAGE, "else toast.error(adminInviteMessage(result.ok ? 'failed' : result.error))", "else toast.error('')", T_PAGE),
 ('P11', 'the success toast for an existing person is gone', PAGE, "else toast.success('Kişi yönetici yapıldı. Hesabını zaten kullandığı için yeni bir bağlantı gerekmez.')", "", T_PAGE),
 ('P12', 'the removal success toast is gone', PAGE, "            toast.success('Yöneticilik kaldırıldı.')\n", "", T_PAGE),
 ('P13', 'the link dialog is not marked as an admin invite', PAGE, "phone={linkDialog.phone} admin />", "phone={linkDialog.phone} />", T_PAGE),
 ('P14', 'the retry button does nothing', PAGE, "onRetry={() => void admins.refetch()}", "onRetry={() => {}}", T_PAGE),
 ('P15', 'the removal dialog does not say what stays', PAGE, "Hesabı ve varsa daire kaydı silinmez; kişi gerekirse yeniden yönetici yapılabilir. ", "", T_PAGE),
 ('P16', 'the removal error is not told in Turkish', PAGE, "describeError={adminsErrorMessage}", "describeError={() => 'x'}", T_PAGE),
 ('P17', 'the date is the activation date', PAGE, "{formatDate(a.since.slice(0, 10))}", "{formatDate((a.activatedAt ?? a.since).slice(0, 10))}", T_PAGE),
 ('D01', 'the invite sends no site', DLG, "inviteAdmin({ siteId, email:", "inviteAdmin({ siteId: '', email:", T_PAGE),
 ('D02', 'the invite error is told with the resident texts', DLG, "setError(adminInviteMessage(result.error))", "setError('İşlem şu anda yapılamadı.')", T_PAGE),
 ('D03', 'the invite window forgets the phone', DLG, "phone: values.phone })", "phone: '' })", T_PAGE),
 ('D04', 'the warning about what an admin can do is gone', DLG, "Yalnızca güvendiğiniz kişileri ekleyin.", "", T_PAGE),
 # ---- routes, menu, audit ----
 ('R01', 'the Yöneticiler address shows another page', 'src/app/routes.tsx', "{ path: 'yoneticiler', element: <AdminsPage /> },", "{ path: 'yoneticiler', element: <p>x</p> },", 'src/app/routes.test.tsx'),
 ('R02', 'the menu has no Yöneticiler entry', LAY, "      { to: '/yonetim/yoneticiler', label: 'Yöneticiler', icon: ShieldCheck },\n", "", T_LAY),
 ('R03', 'the menu link goes to the wrong page', LAY, "to: '/yonetim/yoneticiler'", "to: '/yonetim/sakinler'", T_LAY),
 ('U01', 'the audit summary never names the person', 'src/features/audit/lib/describe.ts', "return str(d.person) ? `${role}: ${str(d.person)}` : role", "return role", 'src/features/audit/lib/describe.test.ts'),
 ('U02', 'the person field has no Turkish name', 'src/features/audit/lib/describe.ts', "  person: 'Kişi', type_:", "  type_:", 'src/features/audit/lib/describe.test.ts'),
]
