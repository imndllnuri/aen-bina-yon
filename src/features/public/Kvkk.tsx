import { Link } from 'react-router'
import { KVKK_VERSION } from '@/config/kvkk'
import { site } from '@/config/site'
import { LegalList, LegalPage, LegalSection } from './legal/LegalPage'

/**
 * DRAFT legal text (plan, section 14). It must be reviewed by a lawyer before launch.
 * It describes what the site really does today: the two public forms, the resident / admin portal accounts, charges and
 * payments, requests with photos, announcements, the audit log. When this text changes, change KVKK_VERSION
 * (src/config/kvkk.ts) too: the version is stored with each person's consent.
 */
export function Kvkk() {
  const strong = (text: string) => <strong className="text-foreground">{text}</strong>
  return (
    <LegalPage title="KVKK Aydınlatma Metni" version={KVKK_VERSION}>
      <LegalSection title="1. Veri sorumlusu">
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu {site.name} şirketidir. İletişim: {site.email}, {site.phone}, {site.address}.
        </p>
      </LegalSection>

      <LegalSection title="2. İşlenen veriler">
        <LegalList
          items={[
            <>{strong('Teklif ve iletişim formları:')} “Teklif Al” ve “İletişim” formlarında yazdığınız ad soyad, telefon, e-posta, yapı bilgileri ve mesajınız.</>,
            <>{strong('Sakin ve yönetici hesapları:')} ad soyad, e-posta, telefon, bağlı olduğunuz site, blok ve daire, malik ya da kiracı olduğunuz bilgisi, taşınma tarihleri, hesap durumu, bu metni onayladığınız tarih ve sürüm, e-posta bildirim tercihleriniz. Giriş şifreniz yalnızca size aittir ve yönetim tarafından görülemez.</>,
            <>{strong('Mali bilgiler:')} borçlarınız, ödemeleriniz, makbuzlarınız, havale bildirimleriniz ve yüklediğiniz dekont dosyası (dekontta banka ve hesap bilgileri bulunabilir). Kart bilgileriniz bu sitede saklanmaz.</>,
            <>{strong('Talepler:')} başlık, açıklama, yer bilgisi, yönetimle yazışmalarınız ve eklediğiniz fotoğraflar. Fotoğraflarda kişiler ya da evinizin içi görünebilir; bu yüzden yalnızca gerekli olanı ekleyin. Fotoğraflardaki konum bilgisi, yüklenmeden önce tarayıcınızda silinir.</>,
            <>{strong('Duyuru ve bildirimler:')} size gelen duyurular ve bildirimler ile bunları okuduğunuz bilgisi.</>,
            <>{strong('İşlem kayıtları:')} yöneticilerin yaptığı işlemlerin (kim, ne zaman, hangi kayıt, ne değişti) kaydı. Bu kayıtlar değiştirilemez ve silinemez.</>,
            <>{strong('Oturum bilgisi:')} oturumunuzu sürdürmek için tarayıcınızın yerel depolama alanında tutulur (bkz. <Link to="/cerez-politikasi" className="font-medium text-primary underline-offset-4 hover:underline">Çerez Politikası</Link>).</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. İşleme amacı ve hukuki sebep">
        <p>
          Form bilgileri, talebiniz üzerine teklif hazırlamak ve sizinle iletişime geçmek için işlenir. Hesap, mali ve talep bilgileriniz; bina yönetimi hizmetinin yürütülmesi (hesabınıza giriş, borç ve ödeme takibi, makbuz, duyuru, talep takibi) için işlenir. İşlem kayıtları, yönetimin hesap verebilirliği ve güvenlik için tutulur. Hukuki sebepler; bir sözleşmenin kurulması ya da ifası, Kat Mülkiyeti Kanunu’ndan doğan yükümlülükler, hukuki yükümlülüklerin yerine getirilmesi ve meşru menfaattir.
        </p>
      </LegalSection>

      <LegalSection title="4. Kimlerle paylaşılır?">
        <p>
          Bilgilerinizi, bulunduğunuz sitenin yönetimi (yönetici ve yetkili çalışanlar) kendi görevi kapsamında görür. Bir sakin, başka bir sakinin bilgilerini göremez; kiracı yalnızca kendisine yansıtılan borçları görür. Bilgileriniz üçüncü kişilere satılmaz.
        </p>
      </LegalSection>

      <LegalSection title="5. Yurt dışına aktarım">
        <p>
          Bilgileriniz, barındırma hizmeti aldığımız bulut altyapı sağlayıcısında (Supabase) saklanır. Sunucular Londra’dadır; bu nedenle verileriniz yurt dışında işlenir. [Yurt dışına aktarımın KVKK madde 9 şartları, yayına almadan önce hukuk danışmanı tarafından teyit edilmelidir.]
        </p>
      </LegalSection>

      <LegalSection title="6. Saklama süresi">
        <p>
          Bilgileriniz [SÜRE] boyunca saklanır, sonrasında silinir veya anonim hale getirilir. İşlem kayıtları için ayrı bir süre belirlenecektir. (Süreler, hukuki inceleme sırasında belirlenecektir.)
        </p>
      </LegalSection>

      <LegalSection title="7. Güvenlik">
        <p>
          Her kişi yalnızca yetkisi olan bilgiyi görür (rol bazlı erişim). Yönetici işlemleri kayıt altına alınır. Bilgiler şifreli bağlantı üzerinden iletilir.
        </p>
      </LegalSection>

      <LegalSection title="8. Haklarınız">
        <p>
          KVKK’nın 11. maddesi kapsamında; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi isteme, düzeltilmesini veya silinmesini isteme gibi haklara sahipsiniz. Başvurularınızı yukarıdaki iletişim bilgilerinden iletebilirsiniz. Adınızı ve telefonunuzu giriş yaptıktan sonra Profil sayfasından da düzeltebilirsiniz.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
