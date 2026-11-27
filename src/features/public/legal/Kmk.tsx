import { ExternalLink } from 'lucide-react'
import { LegalList, LegalPage, LegalSection } from './LegalPage'

/** The official text of the law (mevzuat.gov.tr). */
export const KMK_URL = 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=634&MevzuatTur=1&MevzuatTertip=3'

/** A short, plain summary of the Kat Mülkiyeti Kanunu (634) for residents. Information only: the law itself is the source. */
export function Kmk() {
  return (
    <LegalPage
      title="Kat Mülkiyeti Kanunu (KMK) hakkında kısa bilgi"
      intro="Bu sayfa, 634 sayılı Kat Mülkiyeti Kanunu’nun sakinleri en çok ilgilendiren konularını sade bir dille özetler. Bilgilendirme amaçlıdır; hukuki danışmanlık değildir. Bağlayıcı olan, kanunun kendisidir."
    >
      <LegalSection title="1. Kanun nedir?">
        <p>Kat Mülkiyeti Kanunu, bir binanın bağımsız bölümlerinin (daireler, dükkânlar) ayrı ayrı mülkiyetine ve ortak yerlerin birlikte kullanımına ilişkin kuralları belirler. Kanunun resmi metnine{' '}
          <a href={KMK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            mevzuat.gov.tr <ExternalLink className="size-3" aria-hidden="true" />
          </a>{' '}
          adresinden ulaşabilirsiniz.</p>
      </LegalSection>

      <LegalSection title="2. Kat malikleri kurulu ve yönetim planı">
        <p>Kat malikleri, binanın yönetimine ilişkin kararları kat malikleri kurulunda alır. Kurul, kanunda belirtilen şekilde toplanır; olağan toplantı yılda bir kez yapılır. Binanın yönetim biçimini ve kuralları yönetim planı belirler. Toplantı ve karar çoğunlukları kanunda ve yönetim planında yazılıdır.</p>
      </LegalSection>

      <LegalSection title="3. Yönetici ve denetim">
        <p>Bina, kat malikleri kurulunca seçilen bir yönetici (ya da yönetim kurulu) tarafından yönetilir. Yönetici; kararları uygular, ortak giderlerin toplanmasını ve harcanmasını yürütür, hesapları düzenli tutar. Büyük sitelerde hesapları denetleyen bir denetçi de seçilir.</p>
      </LegalSection>

      <LegalSection title="4. Ortak giderler ve aidat">
        <LegalList
          items={[
            'Ortak giderlere (asansör, ısıtma, temizlik, bakım, onarım vb.) kat malikleri katılır. Aksi kararlaştırılmadıkça katılım, arsa payı oranındadır; yönetim planı farklı bir dağıtım belirleyebilir.',
            'Aidat ve avans, bu giderler için önceden toplanan paylardır.',
            'Giderlerin ve ödemelerin kayıtları, kat maliklerinin bilgisine sunulur.',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Ödemenin gecikmesi">
        <p>Ortak gider ve avans payını zamanında ödemeyen kat maliki için, kanun her gecikme ayına göre %5 oranında gecikme tazminatı öngörür (md. 20). Bu portalda gecikme tazminatı, yönetim tarafından hesaplanıp listeyi kontrol ettikten sonra onaylanarak “Gecikme Tazminatı” borç türüyle yazılır; hiçbir tazminat kendiliğinden yazılmaz. Oran ve yöntem yönetim tarafından ayarlanır.</p>
      </LegalSection>

      <LegalSection title="6. Kiracılar">
        <p>Ortak giderler kural olarak kat malikinin borcudur. Kira sözleşmesinde ya da yönetim planında kiracıya yüklenen giderler, kiracıya yansıtılır. Bu portalda yönetim, her borç türü için bunu ayrıca belirler.</p>
      </LegalSection>

      <LegalSection title="7. Başvuru">
        <p>Kanundan doğan sorularınız için bina yönetimiyle iletişime geçin. Hukuki bir uyuşmazlıkta bir avukata danışın.</p>
      </LegalSection>
    </LegalPage>
  )
}
