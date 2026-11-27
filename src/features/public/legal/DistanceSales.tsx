import { Link } from 'react-router'
import { site } from '@/config/site'
import { LegalList, LegalPage, LegalSection } from './LegalPage'

/**
 * Mesafeli Satış Sözleşmesi (distance sales contract): a DRAFT for the online payment of services.
 * Dues and shared expenses that come from the Kat Mülkiyeti Kanunu are a debt of the owners, not a "sale": this text only
 * covers services that are bought online. A lawyer must adapt it to what is really sold before real card payments start.
 */
export function DistanceSales() {
  return (
    <LegalPage title="Mesafeli Satış Sözleşmesi" version="2026-11-taslak-1" intro="Bu metin, internet üzerinden satın alınan hizmetlere ilişkin ön bilgilendirme ve sözleşme şartlarını içerir. Alıcı, ödemeyi tamamlamadan önce bu metni okuyup kabul eder.">
      <LegalSection title="1. Taraflar">
        <LegalList
          items={[
            <><strong className="text-foreground">Satıcı:</strong> {site.name}. Adres: {site.address}. Telefon: {site.phone}. E-posta: {site.email}. Vergi no: [VERGİ NO]</>,
            <><strong className="text-foreground">Alıcı:</strong> ödeme sırasında bildirdiği ad soyad, e-posta ve telefon bilgileriyle kayıtlı kişi.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Sözleşmenin konusu">
        <p>Alıcının internet üzerinden sipariş ettiği ve ödemesini yaptığı hizmetin; satıcı tarafından sunulmasına ilişkin tarafların hak ve yükümlülükleridir. Hizmetin türü, kapsamı ve bedeli sipariş ve ödeme ekranında gösterilir: [HİZMETİN ADI VE KAPSAMI].</p>
        <p>Site ya da apartman yönetiminden doğan aidat ve ortak gider borçları, Kat Mülkiyeti Kanunu’ndan doğan bir borçtur; bu sözleşme kapsamında bir “satış” değildir. Bu borçların ödenmesi için <Link to="/kat-mulkiyeti-kanunu" className="font-medium text-primary underline-offset-4 hover:underline">KMK bilgi sayfasına</Link> bakın.</p>
      </LegalSection>

      <LegalSection title="3. Bedel ve ödeme">
        <p>Bedel, ödeme ekranında KDV dahil Türk lirası olarak gösterilir. Ödeme, kredi veya banka kartı ile ya da havale / EFT ile yapılır. Taksit ve varsa kart komisyonu, ödeme ekranında ayrıca gösterilir. Ödeme tamamlanınca alıcıya makbuz verilir.</p>
      </LegalSection>

      <LegalSection title="4. İfa">
        <p>Hizmet, ödemenin onaylanmasından sonra [İFA SÜRESİ] içinde sunulur. Satıcı, mücbir sebepler dışında hizmeti zamanında sunmakla yükümlüdür.</p>
      </LegalSection>

      <LegalSection title="5. Cayma hakkı">
        <p>Alıcı, hizmet sözleşmelerinde, sözleşmenin kurulduğu tarihten itibaren 14 gün içinde gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkına sahiptir. Ancak hizmetin ifasına, cayma süresi dolmadan alıcının onayıyla başlanmışsa, ifa edilen hizmet bakımından cayma hakkı kullanılamaz. Cayma bildirimi, yukarıdaki iletişim bilgilerine yazılı olarak yapılır. Ayrıntılar için güncel Mesafeli Sözleşmeler Yönetmeliği’ne bakın.</p>
      </LegalSection>

      <LegalSection title="6. İade">
        <p>Cayma hakkının kullanılması halinde, bildirimin satıcıya ulaşmasından itibaren 14 gün içinde ödeme, alıcının kullandığı ödeme yöntemiyle iade edilir.</p>
      </LegalSection>

      <LegalSection title="7. Kişisel veriler">
        <p>Alıcının kişisel verileri, <Link to="/kvkk" className="font-medium text-primary underline-offset-4 hover:underline">KVKK Aydınlatma Metni</Link>’nde açıklandığı şekilde işlenir.</p>
      </LegalSection>

      <LegalSection title="8. Uyuşmazlıklar">
        <p>Bu sözleşmeden doğan uyuşmazlıklarda, güncel mevzuatta belirlenen parasal sınırlara göre alıcının yerleşim yerindeki Tüketici Hakem Heyetleri ya da Tüketici Mahkemeleri yetkilidir.</p>
      </LegalSection>

      <LegalSection title="9. Yürürlük">
        <p>Alıcı, ödemeyi tamamlamakla bu sözleşmenin tüm şartlarını okuduğunu ve kabul ettiğini beyan eder.</p>
      </LegalSection>
    </LegalPage>
  )
}
