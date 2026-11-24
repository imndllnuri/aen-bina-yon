// The e-mail choices of a person. They are STORED now (profiles.notify_prefs); e-mail sending starts in a later slice.
// A choice that was never made counts as ON: these are service messages (a new charge, a payment, an answer to your request).
// The bell inside the site is always on and has no switch.

export const PREF_KEYS = ['email_finance', 'email_announcements', 'email_requests'] as const
export type PrefKey = (typeof PREF_KEYS)[number]
export type Prefs = Partial<Record<PrefKey, boolean>>

export const PREF_LABEL: Record<PrefKey, { label: string; hint: string }> = {
  email_finance: { label: 'Borç ve ödemeler', hint: 'Yeni borç, ödeme makbuzu, havale bildiriminizin sonucu' },
  email_announcements: { label: 'Duyurular', hint: 'Yönetimin yayınladığı duyurular' },
  email_requests: { label: 'Taleplerim', hint: 'Talebinizin durumu ve yönetimin yanıtları' },
}

/** What the database holds, as a clean object: only the known keys, only true / false. */
export function readPrefs(value: unknown): Prefs {
  const prefs: Prefs = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefs
  for (const key of PREF_KEYS) {
    const v = (value as Record<string, unknown>)[key]
    if (typeof v === 'boolean') prefs[key] = v
  }
  return prefs
}

/** A choice never made is ON. */
export const isOn = (prefs: Prefs, key: PrefKey) => prefs[key] !== false
