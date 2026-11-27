import { ChartColumn, CreditCard, FileText, Megaphone, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react'

export interface Service {
  /** The address of the detail page: /hizmetler/<slug>. */
  slug: string
  title: string
  /** One sentence, shown on the home page. */
  text: string
  /** Short list, shown on the Hizmetler page. */
  points: string[]
  /** Longer text for the detail page (one paragraph each). */
  details: string[]
  icon: LucideIcon
}

// Placeholder marketing text. Replace it with the company's own wording.
export const services: Service[] = [
  {
    slug: 'aidat-ve-tahsilat',
    title: 'Aidat ve Tahsilat',
    text: 'Aidat takibi, çevrimiçi ödeme ve otomatik makbuz.',
    points: ['Daire bazlı aidat ve borç takibi', 'Kartla ya da havale bildirimiyle ödeme', 'Her ödeme için otomatik makbuz'],
    details: [
      'Her daire için aylık aidat ve diğer borçlar tek yerde tutulur. Sakin, ne kadar borcu olduğunu ve neyin ne zaman vadesi geldiğini her an görür.',
      'Ödeme kartla ya da havale bildirimiyle yapılır. Yönetim, havale bildirimlerini dekontla birlikte inceleyip onaylar; her ödeme için makbuz otomatik oluşur ve borç kapanır.',
    ],
    icon: CreditCard,
  },
  {
    slug: 'muhasebe-ve-raporlama',
    title: 'Muhasebe ve Raporlama',
    text: 'Gelir, gider ve kasa raporları her an elinizin altında.',
    points: ['Gelir, gider ve kasa raporları', 'Excel ve PDF çıktıları', 'Kat malikleri için şeffaf özet'],
    details: [
      'Borç listesi, tahsilat, aylık tahakkuk–tahsilat ve sakin listesi raporları her an hazırdır. Rakamlar veritabanında hesaplanır; yaşlandırma (kaç gündür gecikmiş) bir bakışta görülür.',
      'Raporlar Excel dosyası olarak indirilir ya da yazdırılır. Kat malikleri kurulu için imzalanabilir hazirun cetveli de oluşturulur.',
    ],
    icon: ChartColumn,
  },
  {
    slug: 'duyuru-ve-iletisim',
    title: 'Duyuru ve İletişim',
    text: 'Tüm sakinlere ya da seçtiğiniz bloğa anında duyuru.',
    points: ['Tüm site, blok ya da seçili dairelere duyuru', 'Okundu bilgisiyle kimlerin gördüğünü izleme', 'Acil duyurular için bildirim'],
    details: [
      'Duyuru tüm siteye, seçilen bloklara ya da seçilen dairelere gönderilir. Acil, bakım ve toplantı gibi türler vardır; önemli duyurular üstte sabitlenebilir.',
      'Yönetim, duyuruyu kimlerin okuduğunu görür ve okumayanlara hatırlatma gönderebilir. Sakinler yeni duyuru ve gelişmeleri zil simgesinden takip eder.',
    ],
    icon: Megaphone,
  },
  {
    slug: 'ariza-ve-talep-takibi',
    title: 'Arıza ve Talep Takibi',
    text: 'Talepler fotoğrafla açılır, durumu adım adım izlenir.',
    points: ['Fotoğraflı talep açma', 'Durum takibi: Açık, İşlemde, Çözüldü', 'Her değişiklikte bildirim'],
    details: [
      'Sakin, arıza ya da isteğini kategori ve fotoğrafla bildirir. Talep; Açık, İnceleniyor, İşlemde ve Çözüldü adımlarından geçer ve her adım kayıt altında tutulur.',
      'Yönetim, talepleri liste ya da pano görünümünde izler, sakine görünen yanıtlar ve yalnızca yönetimin gördüğü iç notlar yazabilir. Talep çözülünce sakin puan verebilir.',
    ],
    icon: Wrench,
  },
  {
    slug: 'belge-ve-karar-yonetimi',
    title: 'Belge ve Karar Yönetimi',
    text: 'Kararlar, sözleşmeler ve tutanaklar tek yerde saklanır.',
    points: ['Karar defteri, sözleşme ve tutanaklar tek yerde', 'Belgelere yetkiye göre erişim', 'Toplantı kayıtlarının düzenli arşivi'],
    details: [
      'Karar defteri, sözleşmeler ve toplantı tutanakları düzenli bir arşivde saklanır; belgelere yalnızca yetkili kişiler erişir.',
      'Bu hizmet, plana göre sonraki aşamada eklenecektir. Şimdilik karar ve toplantı bilgileri duyurular üzerinden paylaşılır.',
    ],
    icon: FileText,
  },
  {
    slug: 'guvenlik-ve-kvkk',
    title: 'Güvenlik ve KVKK',
    text: 'Verileriniz KVKK’ya uygun ve yetkiye göre korunur.',
    points: ['Rol bazlı erişim: herkes yalnızca kendi verisini görür', 'Kişisel veriler KVKK’ya uygun işlenir', 'Yönetici işlemleri kayıt altında tutulur'],
    details: [
      'Herkes yalnızca kendi bilgisini görür: bir sakin başka bir sakinin borcuna ya da bilgilerine erişemez; kiracı yalnızca kendisine yansıtılan borçları görür.',
      'Yöneticilerin yaptığı işlemler (kim, ne zaman, ne değişti) değiştirilemez bir işlem geçmişinde tutulur. Kişisel veriler KVKK Aydınlatma Metni’ne uygun işlenir.',
    ],
    icon: ShieldCheck,
  },
]
