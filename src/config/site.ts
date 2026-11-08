/**
 * THE ONE FILE YOU EDIT LATER.
 * Company name, logo, phone, IBAN and address are placeholders in [BRACKETS].
 * Replace them with real values before showing the site to real residents.
 */
export const site = {
  name: '[FİRMA ADI] Bina Yönetimi',
  shortName: '[FİRMA]',
  slogan: 'Binanız için şeffaf ve modern yönetim',
  // BASE_URL is "/aen-bina-yon/" on GitHub Pages and "/" with a custom domain.
  logo: `${import.meta.env.BASE_URL}images/logo.svg`,
  phone: '0850 000 00 00',
  whatsapp: '905000000000',
  email: 'info@firmaadi.com.tr',
  address: '[Mahalle, Cadde, No] [İlçe]/[İl]',
  workingHours: 'Hafta içi 09.00–18.00',
  social: { instagram: '#', facebook: '#' },
  bankAccounts: [
    { bank: '[BANKA ADI]', holder: '[HESAP SAHİBİ]', iban: 'TR00 0000 0000 0000 0000 0000 00' },
  ],
  stats: { years: '10+', owners: '1000+', satisfaction: '%99' },
  /** Shown as a badge in the header while the site runs on GitHub Pages (plan, section 16). */
  demo: true,
} as const
