// Questions and answers of the SSS page. They describe what the portal does today (placeholder wording: adapt it to the company).
export interface FaqItem {
  question: string
  answer: string
}

export const faq: FaqItem[] = [
  {
    question: 'Bu portal nedir?',
    answer: 'Binanız ya da siteniz için aidat ve borç takibi, ödeme, duyuru, talep ve raporlama işlerini tek yerde toplayan bir bina yönetimi portalıdır. Sakinler kendi borçlarını ve duyuruları görür; yönetim her şeyi tek ekrandan yürütür.',
  },
  {
    question: 'Nasıl giriş yaparım? Kendim hesap açabilir miyim?',
    answer: 'Hayır, herkese açık kayıt yoktur. Yönetim sizi e-posta adresinizle davet eder; e-postadaki bağlantıdan şifrenizi belirlersiniz. Daveti almadıysanız yönetimle iletişime geçin.',
  },
  {
    question: 'Şifremi unuttum, ne yapmalıyım?',
    answer: 'Giriş sayfasındaki “Şifremi unuttum” bağlantısını kullanın; e-posta adresinize bir yenileme bağlantısı gönderilir. Şifrenizi biliyorsanız ve değiştirmek istiyorsanız, giriş yaptıktan sonra Profil sayfasından değiştirebilirsiniz.',
  },
  {
    question: 'Aidatımı nasıl öderim?',
    answer: 'Borçlarım sayfasından ödemek istediğiniz borçları seçip kartla ödeyebilirsiniz. Havale ya da EFT yaptıysanız “Havale Bildir” sayfasından dekontu yükleyin; yönetim onayladığında ödemeniz işlenir ve makbuzunuz oluşur.',
  },
  {
    question: 'Kartla ödeme gerçek mi?',
    answer: 'Bu deneme (demo) sürümünde kartla ödeme gerçek para çekmez, yalnızca test amaçlıdır. Gerçek ödeme açıldığında bu cevap güncellenecektir.',
  },
  {
    question: 'Makbuzumu nereden alırım?',
    answer: 'Ödemelerim sayfasında her ödemenin yanında PDF makbuz bağlantısı vardır. Makbuzda ödeme tarihi, tutar, yöntem ve kapanan borçlar yazar.',
  },
  {
    question: 'Kat maliki ve kiracı neleri görür?',
    answer: 'Kat maliki, dairenin tüm borçlarını görür. Kiracı, yalnızca yönetimin kiracıya yansıttığı ve taşınma tarihinden sonra vadesi gelen borçları görür; önceki kiracının borçları görünmez.',
  },
  {
    question: 'Arıza ya da talep nasıl bildiririm?',
    answer: 'Taleplerim sayfasından “Yeni talep” seçin; kategori, açıklama ve en fazla 3 fotoğraf ekleyin. Talebinizin durumunu (Açık, İnceleniyor, İşlemde, Çözüldü) aynı sayfadan izlersiniz; her değişiklikte bildirim alırsınız.',
  },
  {
    question: 'Telefon numaramı ya da şifremi nereden değiştiririm?',
    answer: 'Giriş yaptıktan sonra Profil sayfasından adınızı, telefonunuzu ve şifrenizi değiştirebilirsiniz. E-posta adresiniz giriş adresinizdir; değiştirmek için yönetimle iletişime geçin.',
  },
  {
    question: 'Kişisel verilerim güvende mi?',
    answer: 'Her kişi yalnızca kendi bilgilerini görür; yönetici işlemleri kayıt altında tutulur. Hangi verilerin neden işlendiğini KVKK Aydınlatma Metni’nde okuyabilirsiniz.',
  },
  {
    question: 'Binam için teklif almak istiyorum.',
    answer: 'Teklif Al sayfasındaki formu doldurun; bir iş günü içinde size dönüş yapalım. Sormak istediğiniz bir şey varsa İletişim sayfasındaki formu da kullanabilirsiniz.',
  },
]
