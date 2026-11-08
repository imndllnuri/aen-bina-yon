/**
 * Phone number -> the digits WhatsApp wants (country code, no "+" or spaces).
 * Turkey: 0532 123 45 67 -> 905321234567. Returns null when it does not look like a phone number.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('90')) return digits // 90 532 123 45 67
  if (digits.length === 11 && digits.startsWith('0')) return `90${digits.slice(1)}` // 0 532 123 45 67
  if (digits.length === 10 && !digits.startsWith('0')) return `90${digits}` // 532 123 45 67
  // Another country: only trust it when the person typed a "+" or "00" in front.
  if (/^\s*(\+|00)/.test(phone) && digits.length >= 11 && digits.length <= 15) return digits.replace(/^00/, '')
  return null
}

/** The message the admin sends. The link works once and only for this person. */
export function inviteMessage(options: { name: string; link: string; firmName: string }): string {
  const firstName = options.name.trim().split(/\s+/)[0] || 'Merhaba'
  return (
    `Merhaba ${firstName}, ${options.firmName} bina yönetimi portalına davet edildiniz. ` +
    `Hesabınızı etkinleştirmek ve şifrenizi belirlemek için bu bağlantıya tıklayın: ${options.link}\n\n` +
    `Bağlantı yalnızca bir kez kullanılabilir ve sadece size özeldir. Başkasıyla paylaşmayın.`
  )
}

/** A wa.me address that opens WhatsApp with the message ready (to the person, or to pick a contact). */
export function whatsappUrl(options: { phone: string | null | undefined; message: string }): string {
  const number = toWhatsAppNumber(options.phone)
  const text = encodeURIComponent(options.message)
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`
}
