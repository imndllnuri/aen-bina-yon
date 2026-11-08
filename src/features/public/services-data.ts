import { ChartColumn, CreditCard, FileText, Megaphone, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react'

export interface Service {
  title: string
  /** One sentence, shown on the home page. */
  text: string
  /** Short list, shown on the Hizmetler page. */
  points: string[]
  icon: LucideIcon
}

// Placeholder marketing text. Replace it with the company's own wording.
export const services: Service[] = [
  {
    title: 'Aidat ve Tahsilat',
    text: 'Aidat takibi, çevrimiçi ödeme ve otomatik makbuz.',
    points: ['Daire bazlı aidat ve borç takibi', 'Kartla ya da havale bildirimiyle ödeme', 'Her ödeme için otomatik makbuz'],
    icon: CreditCard,
  },
  {
    title: 'Muhasebe ve Raporlama',
    text: 'Gelir, gider ve kasa raporları her an elinizin altında.',
    points: ['Gelir, gider ve kasa raporları', 'Excel ve PDF çıktıları', 'Kat malikleri için şeffaf özet'],
    icon: ChartColumn,
  },
  {
    title: 'Duyuru ve İletişim',
    text: 'Tüm sakinlere ya da seçtiğiniz bloğa anında duyuru.',
    points: ['Tüm site, blok ya da seçili dairelere duyuru', 'Okundu bilgisiyle kimlerin gördüğünü izleme', 'Acil duyurular için bildirim'],
    icon: Megaphone,
  },
  {
    title: 'Arıza ve Talep Takibi',
    text: 'Talepler fotoğrafla açılır, durumu adım adım izlenir.',
    points: ['Fotoğraflı talep açma', 'Durum takibi: Açık, İşlemde, Çözüldü', 'Her değişiklikte bildirim'],
    icon: Wrench,
  },
  {
    title: 'Belge ve Karar Yönetimi',
    text: 'Kararlar, sözleşmeler ve tutanaklar tek yerde saklanır.',
    points: ['Karar defteri, sözleşme ve tutanaklar tek yerde', 'Belgelere yetkiye göre erişim', 'Toplantı kayıtlarının düzenli arşivi'],
    icon: FileText,
  },
  {
    title: 'Güvenlik ve KVKK',
    text: 'Verileriniz KVKK’ya uygun ve yetkiye göre korunur.',
    points: ['Rol bazlı erişim: herkes yalnızca kendi verisini görür', 'Kişisel veriler KVKK’ya uygun işlenir', 'Yönetici işlemleri kayıt altında tutulur'],
    icon: ShieldCheck,
  },
]
