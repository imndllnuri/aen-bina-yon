# Breaks of the slice 12 front end (public pages, contact form, admin messages)
PUB = 'src/features/public/'
LEG = PUB + 'legal/'
MSG = 'src/features/messages/'
ADM = 'src/features/admin/'
LAY = 'src/app/layouts/'
T_CS, T_CA, T_CF = PUB + 'contact-schema.test.ts', PUB + 'contact-api.test.ts', PUB + 'ContactForm.test.tsx'
T_QS = PUB + 'quote-schema.test.ts'
T_LEGAL, T_SD, T_CT = LEG + 'legal.test.tsx', PUB + 'ServiceDetail.test.tsx', PUB + 'Contact.test.tsx'
T_LAY, T_ROUTES = LAY + 'layouts.test.tsx', 'src/app/routes.test.tsx'
T_MAPS = 'src/lib/maps.test.ts'
T_MA, T_MP = MSG + 'api.test.ts', ADM + 'ContactMessagesPage.test.tsx'
BREAKS = [
 # ---- the contact form rules ----
 ('S01', 'a one-letter name is accepted', PUB + 'contact-schema.ts', ".min(2, 'Lütfen adınızı ve soyadınızı yazın.')", ".min(1, 'Lütfen adınızı ve soyadınızı yazın.')", T_CS),
 ('S02', 'a name may be 1200 characters', PUB + 'contact-schema.ts', ".max(120, 'En fazla 120 karakter yazabilirsiniz.')", ".max(1200, 'En fazla 120 karakter yazabilirsiniz.')", T_CS),
 ('S03', 'a message of 1 character is accepted', PUB + 'contact-schema.ts', ".min(5, 'Lütfen mesajınızı yazın (en az 5 karakter).')", ".min(1, 'Lütfen mesajınızı yazın (en az 5 karakter).')", T_CS),
 ('S04', 'a message may be 20000 characters', PUB + 'contact-schema.ts', ".max(2000, 'Mesajınız en fazla 2000 karakter olabilir.')", ".max(20000, 'Mesajınız en fazla 2000 karakter olabilir.')", T_CS),
 ('S05', 'the KVKK tick is not needed', PUB + 'contact-schema.ts', "(value) => value === true", "() => true", T_CS),
 ('S06', 'neither phone nor e-mail is accepted', PUB + 'contact-schema.ts', "values.phone !== '' || values.email !== ''", "true", T_CS),
 ('S07', 'an empty phone is saved as an empty text', PUB + 'contact-schema.ts', "phone: orNull(values.phone)", "phone: values.phone", T_CS),
 ('S08', 'the honeypot is sent to the database', PUB + 'contact-schema.ts', "return { name: values.name, phone:", "return { website: values.website, name: values.name, phone:", T_CS),
 ('S09', 'a phone of 5 digits is accepted', PUB + 'quote-schema.ts', "digitCount(value) >= 10 && digitCount(value) <= 13", "digitCount(value) >= 5 && digitCount(value) <= 13", T_CS),
 ('S10', 'an e-mail may be 2000 characters', PUB + 'quote-schema.ts', "(EMAIL.test(value) && value.length <= 200)", "(EMAIL.test(value) && value.length <= 2000)", T_CS),
 # ---- sending ----
 ('A01', 'the message goes to the wrong table', PUB + 'contact-api.ts', ".from('contact_messages')", ".from('quote_requests')", T_CA),
 ('A02', 'the form asks for the row back (visitors may not read)', PUB + 'contact-api.ts', ".insert(row)", ".insert(row).select()", T_CA),
 ('A03', 'a build without settings is not noticed', PUB + 'contact-api.ts', "  if (!supabase) return { ok: false, reason: 'not-configured' }\n", "", T_CA),
 ('A04', 'a refusal of the database looks like success', PUB + 'contact-api.ts', "    if (error) {\n      console.warn", "    if (false) {\n      console.warn", T_CA),
 # ---- the form ----
 ('F01', 'a bot (filled honeypot) is not caught', PUB + 'ContactForm.tsx', "if (values.website !== '') {", "if (false) {", T_CF),
 ('F02', 'the form keeps the text after sending', PUB + 'ContactForm.tsx', "    if (result.ok) {\n      setStatus('sent')\n      reset(emptyContactForm)", "    if (result.ok) {\n      setStatus('sent')", T_CF),
 ('F03', 'the error is never shown', PUB + 'ContactForm.tsx', "{status === 'error' && (", "{false && (", T_CF),
 ('F04', '"Yeni bir mesaj yaz" does nothing', PUB + 'ContactForm.tsx', "onClick={() => setStatus('idle')}", "onClick={() => {}}", T_CF),
 ('F05', 'the KVKK link opens in the same tab', PUB + 'ContactForm.tsx', '<Link to="/kvkk" target="_blank" rel="noopener"', '<Link to="/kvkk"', T_CF),
 ('F06', 'the honeypot is read out to screen readers', PUB + 'ContactForm.tsx', '<div aria-hidden="true" className="sr-only">', '<div className="sr-only">', T_CF),
 ('F07', 'the honeypot can be reached with the Tab key', PUB + 'ContactForm.tsx', 'tabIndex={-1} autoComplete="off"', 'autoComplete="off"', T_CF),
 ('F08', 'a success is told when sending failed (always "sent")', PUB + 'ContactForm.tsx', "    if (result.ok) {\n      setStatus('sent')", "    if (true) {\n      setStatus('sent')", T_CF),
 # ---- the map link, the WhatsApp button ----
 ('M01', 'the address is not encoded in the map link', 'src/lib/maps.ts', "encodeURIComponent(address)", "address", T_MAPS),
 ('M02', 'the map link goes to another address format', 'src/lib/maps.ts', "https://www.google.com/maps/search/?api=1&query=", "https://www.google.com/maps?q=", T_MAPS),
 ('M03', 'the map link has no address', PUB + 'Contact.tsx', "href={mapsUrl(site.address)}", 'href="#"', T_CT),
 ('M04', 'the map link opens in the same tab', PUB + 'Contact.tsx', '              target="_blank"\n              rel="noopener noreferrer"\n              className="mt-1', '              className="mt-1', T_CT),
 ('M05', 'the contact form is gone from the page', PUB + 'Contact.tsx', "        <ContactForm />", "", T_CT),
 ('W01', 'WhatsApp opens in the same tab', 'src/components/WhatsAppButton.tsx', '      target="_blank"\n      rel="noopener noreferrer"\n      aria-label', '      aria-label', T_LAY),
 ('W02', 'WhatsApp opens without "noopener"', 'src/components/WhatsAppButton.tsx', 'rel="noopener noreferrer"\n      aria-label', 'aria-label', T_LAY),
 ('W03', 'the WhatsApp button is printed', 'src/components/WhatsAppButton.tsx', "focus-visible:ring-ring/60 print:hidden", "focus-visible:ring-ring/60", T_LAY),
 ('W04', 'the WhatsApp button is not fixed', 'src/components/WhatsAppButton.tsx', 'className="fixed right-4 bottom-4', 'className="right-4 bottom-4', T_LAY),
 ('W05', 'the WhatsApp button has no good name', 'src/components/WhatsAppButton.tsx', 'aria-label="WhatsApp ile yazın"', 'aria-label="Yazın"', T_LAY),
 ('W06', 'the WhatsApp button has no number', 'src/components/WhatsAppButton.tsx', "href={`https://wa.me/${site.whatsapp}`}", 'href="https://wa.me/"', T_LAY),
 ('W07', 'the public layout shows no WhatsApp button', LAY + 'PublicLayout.tsx', "      <WhatsAppButton />\n", "", T_LAY),
 ('W08', 'the footer links touch the round button', LAY + 'PublicLayout.tsx', "px-4 pt-4 pb-20 text-xs", "px-4 py-4 text-xs", T_LAY),
 # ---- the footer ----
 ('L01', 'the SSS link is gone', LAY + 'PublicLayout.tsx', '<Link to="/sss" className="hover:text-foreground hover:underline">\n                SSS\n              </Link>', '', T_LAY),
 ('L02', 'the cookie link goes to a wrong address', LAY + 'PublicLayout.tsx', 'to="/cerez-politikasi"', 'to="/cerez"', T_LAY),
 ('L03', 'the sales contract link goes to a wrong address', LAY + 'PublicLayout.tsx', 'to="/mesafeli-satis"', 'to="/mesafeli"', T_LAY),
 ('L04', 'the KMK link goes to a wrong address', LAY + 'PublicLayout.tsx', 'to="/kat-mulkiyeti-kanunu"', 'to="/kmk"', T_LAY),
 # ---- the service pages ----
 ('V01', 'a card links to the list, not to its page', PUB + 'Services.tsx', "<Link to={`/hizmetler/${service.slug}`}", '<Link to="/hizmetler"', T_SD),
 ('V02', 'an unknown address shows the first service', PUB + 'ServiceDetail.tsx', "const service = services.find((s) => s.slug === slug)", "const service = services.find((s) => s.slug === slug) ?? services[0]", T_SD),
 ('V03', 'the "other services" list includes the page itself', PUB + 'ServiceDetail.tsx', "services.filter((s) => s.slug !== service.slug)", "services", T_SD),
 ('V04', 'the offer button goes to the contact page', PUB + 'ServiceDetail.tsx', '<Link to="/teklif-al">Teklif Al</Link>', '<Link to="/iletisim">Teklif Al</Link>', T_SD),
 ('V05', 'the way back goes to the home page', PUB + 'ServiceDetail.tsx', '<Link to="/hizmetler" className="inline-flex', '<Link to="/" className="inline-flex', T_SD),
 ('V06', 'the long text is not shown', PUB + 'ServiceDetail.tsx', "{service.details.map((paragraph) => (", "{[].map((paragraph: string) => (", T_SD),
 ('V07', 'two services share an address', PUB + 'services-data.ts', "slug: 'guvenlik-ve-kvkk'", "slug: 'aidat-ve-tahsilat'", T_SD),
 ('V08', 'a service address has a capital letter', PUB + 'services-data.ts', "slug: 'duyuru-ve-iletisim'", "slug: 'Duyuru-ve-iletisim'", T_SD),
 # ---- the legal texts ----
 ('G01', 'the draft warning is gone from every text', LEG + 'LegalPage.tsx', "draft = true,", "draft = false,", T_LEGAL),
 ('G02', 'the draft warning says something else', LEG + 'LegalPage.tsx', "'Bu metin örnek bir taslaktır. Yayına almadan önce bir hukukçu tarafından incelenmelidir.'", "'Bu metin güncel.'", T_LEGAL),
 ('G03', 'the law link goes to another law', LEG + 'Kmk.tsx', "MevzuatNo=634", "MevzuatNo=635", T_LEGAL),
 ('G04', 'the law link opens in the same tab', LEG + 'Kmk.tsx', 'target="_blank" rel="noopener noreferrer" className="inline-flex', 'className="inline-flex', T_LEGAL),
 ('G05', 'the FAQ says the card payment is real', LEG + 'faq-data.ts', "gerçek para çekmez", "gerçek para çeker", T_LEGAL),
 ('G06', 'the cookie page says the site uses cookies', LEG + 'Cookies.tsx', "çerez (cookie) kullanmaz", "çerez (cookie) kullanır", T_LEGAL),
 ('G07', 'the KVKK page shows no version', PUB + 'Kvkk.tsx', "version={KVKK_VERSION}", "version={undefined}", T_LEGAL),
 ('G08', 'the right to withdraw is 30 days', LEG + 'DistanceSales.tsx', "14 gün içinde gerekçe", "30 gün içinde gerekçe", T_LEGAL),
 ('G09', 'the KVKK version was not raised', 'src/config/kvkk.ts', "'2026-11-taslak-3'", "'2026-11-taslak-2'", T_LEGAL),
 ('G10', 'the KVKK page says the servers are in Türkiye', PUB + 'Kvkk.tsx', "Sunucular Londra’dadır", "Sunucular Türkiye’dedir", T_LEGAL),
 ('G11', 'a FAQ question is repeated', LEG + 'faq-data.ts', "question: 'Makbuzumu nereden alırım?'", "question: 'Bu portal nedir?'", T_LEGAL),
 ('G12', 'the sales contract calls dues a sale', LEG + 'DistanceSales.tsx', "bu sözleşme kapsamında bir “satış” değildir", "bu sözleşme kapsamında bir satıştır", T_LEGAL),
 # ---- the admin messages ----
 ('K01', 'the "read" status has another code', MSG + 'api.ts', "{ code: 'read', label: 'Okundu' }", "{ code: 'seen', label: 'Okundu' }", T_MA),
 ('K02', 'the oldest message comes first', MSG + 'api.ts', "{ ascending: false }", "{ ascending: true }", T_MA),
 ('K03', 'only 5 messages are loaded', MSG + 'api.ts', ".limit(500)", ".limit(5)", T_MA),
 ('K04', 'an empty note is saved as an empty text', MSG + 'api.ts', "note.trim() === '' ? null : note.trim()", "note", T_MA),
 ('K05', 'a change that touched no row looks fine', MSG + 'api.ts', "  if (!data || data.length === 0) throw Object.assign(new Error('not allowed'), { code: '42501' })\n", "", T_MA),
 ('K06', 'the status goes to the wrong table', MSG + 'api.ts', ".from('contact_messages').update({ status })", ".from('quote_requests').update({ status })", T_MA),
 ('K07', 'a delete is not limited to one message', MSG + 'api.ts', ".delete().eq('id', id)", ".delete()", T_MA),
 ('P01', 'the status filter shows everything', ADM + 'ContactMessagesPage.tsx', "filter === '' || m.status === filter", "true", T_MP),
 ('P02', 'the list is not reloaded after a note', ADM + 'ContactMessagesPage.tsx', "      await updateMessageNote(item.id, note)\n      await queryClient.invalidateQueries({ queryKey: KEY })", "      await updateMessageNote(item.id, note)", T_MP),
 ('P03', 'the list is not reloaded after a delete', ADM + 'ContactMessagesPage.tsx', "            await deleteMessage(removing.id)\n            await queryClient.invalidateQueries({ queryKey: KEY })", "            await deleteMessage(removing.id)", T_MP),
 ('P04', 'the list is not reloaded after a status change', ADM + 'ContactMessagesPage.tsx', "      await updateMessageStatus(item.id, status)\n      await queryClient.invalidateQueries({ queryKey: KEY })", "      await updateMessageStatus(item.id, status)", T_MP),
 ('P05', 'new messages are not highlighted', ADM + 'ContactMessagesPage.tsx', "m.status === 'new' ? 'default' : 'outline'", "'outline'", T_MP),
 ('P06', 'a refusal is not told in Turkish', ADM + 'ContactMessagesPage.tsx', "  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'\n", "", T_MP),
 ('P07', 'the empty list says something else', ADM + 'ContactMessagesPage.tsx', "'Henüz mesaj gelmedi.'", "'Liste boş.'", T_MP),
 ('P08', 'the whole message is not shown in the dialog', ADM + 'ContactMessagesPage.tsx', '<p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-sm">{item.message}</p>', '', T_MP),
 ('P09', 'the phone is not a link', ADM + 'ContactMessagesPage.tsx', "href={`tel:${m.phone}`}", 'href="#"', T_MP),
 ('P10', 'the retry button does nothing', ADM + 'ContactMessagesPage.tsx', "onRetry={() => void messages.refetch()}", "onRetry={() => {}}", T_MP),
 # ---- routes and menu ----
 ('R01', 'the admin address shows another page', 'src/app/routes.tsx', "{ path: 'mesajlar', element: <ContactMessagesPage /> },", "{ path: 'mesajlar', element: <p>x</p> },", T_ROUTES),
 ('R02', 'the admin menu has no messages entry', LAY + 'AdminLayout.tsx', "      { to: '/yonetim/mesajlar', label: 'İletişim Mesajları', icon: Mail },\n", "", T_LAY),
 ('R03', 'the SSS address is gone', 'src/app/routes.tsx', "      { path: '/sss', element: <Faq /> },\n", "", T_ROUTES),
 ('R04', 'the service pages are gone', 'src/app/routes.tsx', "      { path: '/hizmetler/:slug', element: <ServiceDetail /> },\n", "", T_ROUTES),
 ('R05', 'the cookie page is gone', 'src/app/routes.tsx', "      { path: '/cerez-politikasi', element: <Cookies /> },\n", "", T_ROUTES),
 ('R06', 'the sales contract page is gone', 'src/app/routes.tsx', "      { path: '/mesafeli-satis', element: <DistanceSales /> },\n", "", T_ROUTES),
 ('R07', 'the KMK page is gone', 'src/app/routes.tsx', "      { path: '/kat-mulkiyeti-kanunu', element: <Kmk /> },\n", "", T_ROUTES),
]
