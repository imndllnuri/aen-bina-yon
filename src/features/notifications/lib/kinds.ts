export type NotificationKind = 'charge' | 'payment' | 'payment_void' | 'havale_new' | 'havale_approved' | 'havale_rejected' | 'announcement'

export const KIND_LABEL: Record<NotificationKind, string> = {
  charge: 'Borç',
  payment: 'Ödeme',
  payment_void: 'Ödeme iptali',
  havale_new: 'Havale bildirimi',
  havale_approved: 'Havale onayı',
  havale_rejected: 'Havale reddi',
  announcement: 'Duyuru',
}

const KINDS = Object.keys(KIND_LABEL)
/** A kind this version does not know yet (a newer server) is shown as a plain notification, never as an error. */
export const kindLabel = (kind: string): string => (KINDS.includes(kind) ? KIND_LABEL[kind as NotificationKind] : 'Bildirim')
