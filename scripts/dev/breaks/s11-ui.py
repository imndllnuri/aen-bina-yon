# Breaks of the slice 11 front end (the Profil page)
P = 'src/features/profile/'
SCH, PRF, MSG, API, QRY, PAGE = P + 'lib/schemas.ts', P + 'lib/prefs.ts', P + 'lib/messages.ts', P + 'api.ts', P + 'queries.ts', P + 'ProfilePage.tsx'
T_SCH, T_PRF, T_MSG, T_API, T_QRY, T_PAGE = (P + 'lib/schemas.test.ts', P + 'lib/prefs.test.ts', P + 'lib/messages.test.ts', P + 'api.test.ts', P + 'queries.test.tsx', P + 'ProfilePage.test.tsx')
LAY = 'src/app/layouts/'
BREAKS = [
 # ---- the rules of the forms ----
 ('U01', 'the new password may equal the old one', SCH, "(values) => values.password !== values.current", "() => true", T_SCH),
 ('U02', 'a repeat that does not match is accepted', SCH, "(values) => values.password === values.confirm", "() => true", T_SCH),
 ('U03', 'the current password may be empty', SCH, "z.string().min(1, 'Mevcut şifrenizi yazın.')", "z.string()", T_SCH),
 ('U04', 'name and phone follow another rule than the admin\'s', SCH, "export const contactSchema = residentContactSchema", "export const contactSchema = z.object({ fullName: z.string(), phone: z.string() })", T_SCH),
 ('U05', 'the new password has no rule', SCH, "    password: passwordField,", "    password: z.string(),", T_SCH),
 # ---- the e-mail choices ----
 ('P01', 'one of the three keys is missing', PRF, "['email_finance', 'email_announcements', 'email_requests'] as const", "['email_finance', 'email_announcements'] as const", T_PRF),
 ('P02', 'a choice never made counts as OFF', PRF, "prefs[key] !== false", "prefs[key] === true", T_PRF),
 ('P03', 'any value is read as a choice', PRF, "if (typeof v === 'boolean') prefs[key] = v", "if (v !== undefined) prefs[key] = v as boolean", T_PRF),
 # ---- the messages ----
 ('M01', 'a wrong current password has no own sentence', MSG, "  if (reason === 'wrong-current') return 'Mevcut şifre hatalı.'\n", "", T_MSG),
 ('M02', '"not allowed" is not told in Turkish', MSG, "if (e?.code === '42501' || e?.message === 'not allowed')", "if (e?.code === '42501')", T_MSG),
 ('M03', 'the invalid-value text is gone', MSG, "  if (e?.code === '23514') return 'Girilen değer geçersiz. Alanları kontrol edin.'\n", "", T_MSG),
 # ---- the data calls ----
 ('A01', 'an empty phone is saved as an empty text', API, "phone: phone === '' ? null : phone", "phone: phone", T_API),
 ('A02', 'the name is not trimmed', API, "full_name: values.fullName.trim()", "full_name: values.fullName", T_API),
 ('A03', 'the save is not limited to the own row', API, "    .eq('id', userId)\n    .select('id')", "    .select('id')", T_API),
 ('A04', 'a save that changed nothing looks fine', API, "  if (data.length === 0) throw Object.assign(new Error('not allowed'), { code: '42501' })\n", "", T_API),
 ('A05', 'the current password is not checked', API, "const check = await signInWithPassword(email, current)", "const check = { ok: true as const }", T_API),
 ('A06', 'a wrong current password is reported as a wrong login', API, "reason: check.reason === 'invalid-credentials' ? 'wrong-current' : check.reason", "reason: check.reason", T_API),
 ('A07', 'the password change closes THIS device too', API, "signOut({ scope: 'others' })", "signOut({ scope: 'global' })", T_API),
 ('A08', 'a refused new password is ignored', API, "  if (!saved.ok) return saved\n", "", T_API),
 ('A09', 'closing the other devices is always reported as done', API, "othersClosed: (await signOutOtherSessions()).ok", "othersClosed: true", T_API),
 ('A10', 'the choices go to the wrong function', API, "rpc('save_my_notification_prefs'", "rpc('save_company_settings'", T_API),
 ('A11', 'the stored choices are not cleaned', API, "return readPrefs(data)", "return data as Prefs", T_API),
 ('A12', 'the profile is read without the id filter', API, "    .eq('id', userId)\n    .maybeSingle()", "    .maybeSingle()", T_API),
 ('A13', 'a missing profile is not an error', API, "  if (!data) throw new Error('profile not found')\n", "", T_API),
 ('A14', 'the KVKK date shows the version', API, "kvkkAt: data.kvkk_consent_at,", "kvkkAt: data.kvkk_consent_version,", T_API),
 ('A15', 'a failed "close other sessions" looks like success', API, "    if (error) {\n      console.warn", "    if (false) {\n      console.warn", T_API),
 ('Q01', 'saving does not refresh the greeting name', QRY, ", queryClient.invalidateQueries({ queryKey: ['resident', 'name'] })", "", T_QRY),
 ('Q02', 'saving does not refresh the Profil page', QRY, "queryClient.invalidateQueries({ queryKey: ['profile'] }),", "", T_QRY),
 # ---- the page ----
 ('G01', 'the e-mail can be edited', PAGE, "value={profile.email ?? authEmail} readOnly disabled type=\"email\"", "defaultValue={profile.email ?? authEmail} type=\"email\"", T_PAGE),
 ('G02', 'a choice never made is shown OFF', PAGE, "[key, isOn(profile.prefs, key)]", "[key, profile.prefs[key] === true]", T_PAGE),
 ('G03', 'a half-done password change is told as success', PAGE, "if (result.othersClosed) toast.success(", "if (true) toast.success(", T_PAGE),
 ('G04', 'the password form is not cleared after a change', PAGE, "    reset()\n    if (result.othersClosed)", "    if (result.othersClosed)", T_PAGE),
 ('G05', 'the units are asked for an admin too', PAGE, "enabled: isResident })", "enabled: true })", T_PAGE),
 ('G06', 'the admin sites are asked for a resident too', PAGE, "enabled: isAdmin })", "enabled: true })", T_PAGE),
 ('G07', 'the KVKK line is the wrong way round', PAGE, "{profile.kvkkAt ? ", "{!profile.kvkkAt ? ", T_PAGE),
 ('G08', 'the password check uses an empty e-mail', PAGE, "<PasswordCard authEmail={session.session.user.email ?? ''} />", "<PasswordCard authEmail=\"\" />", T_PAGE),
 ('G09', 'saving the name does not reload the profile', PAGE, "await saveMyContact(userId, values)\n      await refresh()", "await saveMyContact(userId, values)", T_PAGE),
 ('G10', 'saving the choices does not reload the profile', PAGE, "const stored = await saveMyNotificationPrefs(values)\n      await refresh()", "const stored = await saveMyNotificationPrefs(values)", T_PAGE),
 ('G11', 'the role names are swapped', PAGE, "{ admin: 'Yönetici', resident: 'Sakin' }", "{ admin: 'Sakin', resident: 'Yönetici' }", T_PAGE),
 ('G12', '"Tekrar dene" does nothing', PAGE, "onRetry={() => void profile.refetch()}", "onRetry={() => {}}", T_PAGE),
 ('G13', 'a password problem is not shown', PAGE, "setError(passwordChangeMessage(result.reason))", "setError(null)", T_PAGE),
 ('G14', 'a failed "close other devices" is told as success', PAGE, "if (result.ok) toast.success('Diğer cihazlardaki oturumlar kapatıldı.')", "if (true) toast.success('Diğer cihazlardaki oturumlar kapatıldı.')", T_PAGE),
 ('G15', 'the note about "only saved" is gone', PAGE, "<b>yalnızca kaydedilir</b>", "kaydedilir", T_PAGE),
 # ---- routes and menus ----
 ('R01', 'the resident address shows another page', 'src/app/routes.tsx', "{ path: '/profil', element: <ProfilePage /> },", "{ path: '/profil', element: <p>Profil</p> },", 'src/app/routes.test.tsx'),
 ('R02', 'the admin address shows another page', 'src/app/routes.tsx', "{ path: 'profil', element: <ProfilePage /> },", "{ path: 'profil', element: <p>Profil</p> },", 'src/app/routes.test.tsx'),
 ('R03', 'the resident phone button is hidden on phones', LAY + 'ResidentLayout.tsx', "<Button asChild variant=\"ghost\" size=\"icon\" className=\"md:hidden\">", "<Button asChild variant=\"ghost\" size=\"icon\" className=\"max-md:hidden\">", LAY + 'layouts.test.tsx'),
 ('R04', 'the admin phone button is hidden on phones', LAY + 'AdminLayout.tsx', "<Button asChild variant=\"ghost\" size=\"icon\" className=\"lg:hidden\">\n              <Link to=\"/yonetim/profil\"", "<Button asChild variant=\"ghost\" size=\"icon\" className=\"max-lg:hidden\">\n              <Link to=\"/yonetim/profil\"", LAY + 'layouts.test.tsx'),
 ('R05', 'the admin menu has no Profilim', LAY + 'AdminLayout.tsx', "      { to: '/yonetim/profil', label: 'Profilim', icon: User },\n", "", LAY + 'layouts.test.tsx'),
 ('R06', 'the resident button goes to the home page', LAY + 'ResidentLayout.tsx', "<Link to=\"/profil\" aria-label=\"Profilim\">", "<Link to=\"/panel\" aria-label=\"Profilim\">", LAY + 'layouts.test.tsx'),
 ('R07', 'the admin button goes to the dashboard', LAY + 'AdminLayout.tsx', "<Link to=\"/yonetim/profil\" aria-label=\"Profilim\">", "<Link to=\"/yonetim\" aria-label=\"Profilim\">", LAY + 'layouts.test.tsx'),
]
