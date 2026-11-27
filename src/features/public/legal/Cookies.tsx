import { Link } from 'react-router'
import { LegalList, LegalPage, LegalSection } from './LegalPage'

/** Çerez Politikası. This site sets NO cookies of its own: it only uses the browser's own storage, for the login and a few choices. */
export function Cookies() {
  return (
    <LegalPage title="Çerez Politikası" version="2026-11-taslak-1">
      <LegalSection title="1. Çerez nedir?">
        <p>Çerezler, bir siteyi ziyaret ettiğinizde tarayıcınıza kaydedilen küçük metin dosyalarıdır. Benzer şekilde tarayıcılar, siteler için “yerel depolama” alanı da sunar.</p>
      </LegalSection>

      <LegalSection title="2. Bu site neleri saklar?">
        <p>Bu site <strong className="text-foreground">çerez (cookie) kullanmaz</strong>; reklam, analiz ya da izleme amacıyla hiçbir veri toplamaz. Siteyi çalıştırmak için tarayıcınızın yerel depolama alanında yalnızca şunları saklar:</p>
        <LegalList
          items={[
            <><strong className="text-foreground">Oturum bilgisi:</strong> giriş yaptığınızda oturumunuzu sürdürmek için. “Beni hatırla” açıksa tarayıcıyı kapatsanız da kalır; kapalıysa sekmeyi kapattığınızda silinir.</>,
            <><strong className="text-foreground">“Beni hatırla” tercihi:</strong> bu seçimi hatırlamak için küçük bir işaret.</>,
            <><strong className="text-foreground">Seçili daire:</strong> birden çok daireniz varsa en son baktığınız daire.</>,
          ]}
        />
        <p>Bunlar siteyi çalıştırmak için zorunludur; bu yüzden onay istenmez. Çıkış yaptığınızda oturum bilgisi silinir.</p>
      </LegalSection>

      <LegalSection title="3. Üçüncü taraflar">
        <p>Yazı tipleri bu sitenin kendi sunucusundan yüklenir; Google Fonts gibi dış hizmetlere istek gitmez. Siteden WhatsApp ya da harita bağlantılarına tıklarsanız, ilgili hizmetin kendi sitesine geçersiniz; o sitelerin gizlilik ve çerez kuralları geçerli olur.</p>
      </LegalSection>

      <LegalSection title="4. Depolamayı nasıl silerim?">
        <p>Tarayıcınızın ayarlarından site verilerini silebilirsiniz. Bunu yaptığınızda oturumunuz kapanır; yeniden giriş yapmanız gerekir.</p>
      </LegalSection>

      <LegalSection title="5. Daha fazla bilgi">
        <p>Kişisel verilerinizin nasıl işlendiği için <Link to="/kvkk" className="font-medium text-primary underline-offset-4 hover:underline">KVKK Aydınlatma Metni</Link>’ne bakın.</p>
      </LegalSection>
    </LegalPage>
  )
}
