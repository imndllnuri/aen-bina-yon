import { TriangleAlert } from 'lucide-react'
import { KVKK_VERSION } from '@/config/kvkk'
import { site } from '@/config/site'

/**
 * PLACEHOLDER legal text (plan, section 14). It must be reviewed by a lawyer before launch.
 * It describes what the site really does today: the "Teklif Al" form and the resident / admin
 * portal accounts. When this text changes, change KVKK_VERSION (src/config/kvkk.ts) too.
 */
export function Kvkk() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">KVKK Aydınlatma Metni</h1>
      <p className="mt-1 text-xs text-muted-foreground">Sürüm: {KVKK_VERSION}</p>

      <p
        role="note"
        className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          Bu metin örnek bir taslaktır. Yayına almadan önce bir hukukçu tarafından incelenmelidir.
        </span>
      </p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-base font-semibold">1. Veri sorumlusu</h2>
          <p className="mt-1 text-muted-foreground">
            6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu {site.name} şirketidir.
            İletişim: {site.email}, {site.phone}, {site.address}.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">2. İşlenen veriler</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Teklif formu:</strong> “Teklif Al” formunda yazdığınız ad soyad, telefon,
              e-posta, yapı tipi, daire sayısı, il, ilçe ve mesaj bilgileri.
            </li>
            <li>
              <strong className="text-foreground">Sakin ve yönetici hesapları:</strong> ad soyad, e-posta, telefon, bağlı olduğunuz
              site, blok ve daire, malik ya da kiracı olduğunuz bilgisi, taşınma tarihleri, hesap durumu ve bu metni
              onayladığınız tarih ve sürüm. Giriş şifreniz yalnızca size aittir ve yönetim tarafından görülemez.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">3. İşleme amacı ve hukuki sebep</h2>
          <p className="mt-1 text-muted-foreground">
            Teklif formundaki bilgiler, talebiniz üzerine teklif hazırlamak ve sizinle iletişime geçmek için işlenir. Hesap
            bilgileriniz, bina yönetimi hizmetinin yürütülmesi (hesabınıza giriş, duyurular, aidat ve talep takibi) için
            işlenir. Hukuki sebepler; bir sözleşmenin kurulması ya da ifası, Kat Mülkiyeti Kanunu’ndan doğan yükümlülükler ve
            meşru menfaattir.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">4. Aktarım</h2>
          <p className="mt-1 text-muted-foreground">
            Bilgileriniz, barındırma hizmeti aldığımız bulut altyapı sağlayıcısında (Supabase) saklanır. Bu sağlayıcının
            sunucuları yurt dışında olabilir. Bilgileriniz üçüncü kişilere satılmaz.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">5. Saklama süresi</h2>
          <p className="mt-1 text-muted-foreground">
            [SÜRE] boyunca saklanır, sonrasında silinir veya anonim hale getirilir. (Süre, hukuki inceleme sırasında
            belirlenecektir.)
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-semibold">6. Haklarınız</h2>
          <p className="mt-1 text-muted-foreground">
            KVKK’nın 11. maddesi kapsamında; verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini
            isteme gibi haklara sahipsiniz. Başvurularınızı yukarıdaki iletişim bilgilerinden iletebilirsiniz.
          </p>
        </section>
      </div>
    </article>
  )
}
