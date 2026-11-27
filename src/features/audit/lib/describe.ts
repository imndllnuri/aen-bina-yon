import { formatDate, formatDateTime, formatTRY } from '@/lib/format'

// The audit log in words. The database stores raw rows ({"status": "voided"}); this turns them into sentences and field names
// people read. A table, field or value this version does not know is shown as it is, never hidden.

export type AuditAction = 'insert' | 'update' | 'delete'
export type AuditData = Record<string, unknown>

export const TABLE_LABEL: Record<string, string> = {
  charges: 'Borç',
  charge_batches: 'Toplu borçlandırma',
  recurring_plans: 'Aylık plan',
  charge_types: 'Borç türü',
  payments: 'Ödeme',
  transfer_notices: 'Havale bildirimi',
  units: 'Daire',
  unit_residents: 'Sakin kaydı',
  announcements: 'Duyuru',
  requests: 'Talep',
  site_members: 'Yönetici',
  companies: 'Firma / ayarlar',
}
export const tableLabel = (table: string) => TABLE_LABEL[table] ?? table

export const ACTION_LABEL: Record<AuditAction, string> = { insert: 'Eklendi', update: 'Değişti', delete: 'Silindi' }

const FIELD_LABEL: Record<string, string> = {
  amount: 'Tutar', fee: 'Komisyon', total: 'Toplam', due_date: 'Son ödeme tarihi', period: 'Dönem', description: 'Açıklama', tenant_visible: 'Kiracıya yansır',
  voided_at: 'İptal zamanı', voided_by: 'İptal eden', void_reason: 'İptal nedeni', status: 'Durum', name: 'Ad', door_no: 'Kapı no', floor: 'Kat', type: 'Tür',
  gross_m2: 'Brüt m²', land_share: 'Arsa payı', archived_at: 'Arşivlenme', block_id: 'Blok', unit_id: 'Daire', profile_id: 'Kişi', relation: 'İlişki',
  start_date: 'Başlangıç tarihi', end_date: 'Bitiş tarihi', title: 'Başlık', body: 'Metin', pinned: 'Sabitlenmiş', publish_at: 'Yayın zamanı', expire_at: 'Bitiş zamanı',
  published_at: 'Yayınlanma', deleted_at: 'Silinme', receipt_no: 'Makbuz no', payer_name: 'Ödeyen', payer_id: 'Ödeyen kişi', unit_label: 'Daire', method: 'Yöntem',
  provider: 'Sağlayıcı', paid_at: 'Ödeme zamanı', sender_name: 'Gönderen', sent_on: 'Gönderim tarihi', reject_reason: 'Red nedeni', reviewed_at: 'İnceleme zamanı',
  reviewed_by: 'İnceleyen', category: 'Kategori', priority: 'Öncelik', location: 'Konum', rating: 'Puan', resolved_at: 'Çözüm zamanı', requester_id: 'Talep sahibi',
  role: 'Rol', settings: 'Ayarlar', phone: 'Telefon', email: 'E-posta', address: 'Adres', tax_no: 'Vergi no', code: 'Kod', default_split: 'Dağıtım',
  tenant_visible_default: 'Kiracıya yansır (varsayılan)', active: 'Kullanımda', sort_order: 'Sıra', unit_count: 'Daire sayısı', split_method: 'Dağıtım yöntemi',
  karar_no: 'Karar no', karar_date: 'Karar tarihi', created_by: 'Oluşturan', created_at: 'Oluşturulma', site_id: 'Site', company_id: 'Firma', batch_id: 'Toplu işlem',
  charge_type_id: 'Borç türü', recurring_plan_id: 'Aylık plan', day_of_month: 'Ayın günü', target: 'Hedef', note: 'Not', file_path: 'Dosya', payment_id: 'Ödeme',
  person: 'Kişi', type_: 'Tür', resend_count: 'Yeniden gönderim', last_resent_at: 'Son yeniden gönderim', rated_at: 'Puan zamanı', installments: 'Taksit', logo_url: 'Logo',
}
export const fieldLabel = (key: string) => FIELD_LABEL[key] ?? key

const STATUS_LABEL: Record<string, string> = {
  approved: 'Onaylı', voided: 'İptal edildi', pending: 'Bekliyor', rejected: 'Reddedildi', cancelled: 'Geri çekildi', draft: 'Taslak', published: 'Yayında',
  acik: 'Açık', inceleniyor: 'İnceleniyor', islemde: 'İşlemde', cozuldu: 'Çözüldü', kapandi: 'Kapandı', iptal: 'İptal edildi',
}
const METHOD_LABEL: Record<string, string> = { card: 'Kart', havale: 'Havale / EFT', cash: 'Nakit', pos: 'POS' }
const RELATION_LABEL: Record<string, string> = { owner: 'Kat maliki', tenant: 'Kiracı' }
const MONEY_KEYS = new Set(['amount', 'fee', 'total'])
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** One value in words: money as ₺, dates as 23.11.2026, yes/no, known words in Turkish. Objects are shown as text. */
export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (typeof value === 'number') return MONEY_KEYS.has(key) ? formatTRY(value) : String(value).replace('.', ',')
  if (typeof value === 'string') {
    if (ISO_TIME.test(value)) return formatDateTime(value)
    if (ISO_DAY.test(value)) return formatDate(value)
    if (key === 'status') return STATUS_LABEL[value] ?? value
    if (key === 'method') return METHOD_LABEL[value] ?? value
    if (key === 'relation') return RELATION_LABEL[value] ?? value
    return value
  }
  const json = JSON.stringify(value)
  return json.length > 400 ? `${json.slice(0, 400)}…` : json
}

export interface AuditLike {
  table: string
  action: AuditAction
  oldData: AuditData | null
  newData: AuditData | null
}

/** The columns an update changed, in the order they were stored. */
export function changedKeys(row: AuditLike): string[] {
  return row.action === 'update' ? Object.keys(row.newData ?? {}) : []
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A short sentence for the list: what this row is about. */
export function summarize(row: AuditLike): string {
  const d: AuditData = { ...(row.oldData ?? {}), ...(row.newData ?? {}) }
  if (row.action === 'update') {
    if (row.table === 'companies') return changedKeys(row).includes('settings') ? 'Ayarlar değişti' : 'Firma bilgileri değişti'
    const labels = changedKeys(row).map(fieldLabel)
    return labels.length === 0 ? '' : `Değişen: ${labels.join(', ')}`
  }
  switch (row.table) {
    case 'payments':
      return [str(d.receipt_no), typeof d.amount === 'number' ? formatTRY(d.amount) : '', str(d.unit_label)].filter(Boolean).join(' · ')
    case 'charges':
      return [typeof d.amount === 'number' ? formatTRY(d.amount) : '', str(d.due_date) ? `son ödeme ${formatDate(str(d.due_date))}` : ''].filter(Boolean).join(' · ')
    case 'charge_batches':
      return [typeof d.total === 'number' ? formatTRY(d.total) : '', typeof d.unit_count === 'number' ? `${d.unit_count} daire` : ''].filter(Boolean).join(' · ')
    case 'units':
      return `Daire ${str(d.door_no)}`.trim()
    case 'unit_residents':
      return `${RELATION_LABEL[str(d.relation)] ?? str(d.relation)}${str(d.start_date) ? ` · başlangıç ${formatDate(str(d.start_date))}` : ''}`
    case 'announcements':
    case 'requests':
      return str(d.title)
    case 'charge_types':
    case 'recurring_plans':
      return str(d.name)
    case 'transfer_notices':
      return [typeof d.amount === 'number' ? formatTRY(d.amount) : '', str(d.sender_name)].filter(Boolean).join(' · ')
    case 'site_members': {
      // the database writes the NAME of the person into the row (migration 0012): "Yönetici: Ece Yılmaz"
      const role = str(d.role) === 'admin' ? 'Yönetici' : str(d.role)
      return str(d.person) ? `${role}: ${str(d.person)}` : role
    }
    case 'companies':
      return str(d.name)
    default:
      return ''
  }
}

/** "Ödeme eklendi", "Daire silindi", "Borç değişti" */
export function headline(row: AuditLike): string {
  return `${tableLabel(row.table)} ${ACTION_LABEL[row.action].toLowerCase()}`
}
