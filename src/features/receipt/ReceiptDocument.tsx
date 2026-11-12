import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import boldUrl from '@/assets/fonts/NotoSans-Bold.ttf?url'
import regularUrl from '@/assets/fonts/NotoSans-Regular.ttf?url'
import { formatDate, formatDateTime, monthLabel } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { installmentsLabel, methodLabel, type Receipt } from './api'

// The receipt (makbuz) PDF. This file is only loaded when somebody asks for a PDF (dynamic import),
// because the PDF library is large.
//
// Noto Sans is embedded on purpose: the standard PDF fonts have no Turkish letters (İ ı Ş ş Ğ ğ ...).
// Hyphenation is switched off: Turkish words must never be cut in the middle.
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: regularUrl, fontWeight: 400 },
    { src: boldUrl, fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 10, padding: 40, color: '#1a2428' },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  company: { fontSize: 14, fontWeight: 700 },
  muted: { color: '#5d6b70' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  receiptNo: { fontSize: 12, fontWeight: 700 },
  stamp: { marginTop: 6, color: '#b3261e', fontWeight: 700, fontSize: 12 },
  test: { marginBottom: 14, padding: 6, backgroundColor: '#fff4cc', color: '#6b5200', fontWeight: 700 },
  box: { marginBottom: 14, flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', marginBottom: 6 },
  label: { color: '#5d6b70', fontSize: 8 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a2428', paddingBottom: 4, fontWeight: 700 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#c9d1d4' },
  cType: { width: '34%' },
  cPeriod: { width: '22%' },
  cDue: { width: '22%' },
  cAmount: { width: '22%', textAlign: 'right' },
  totals: { marginTop: 10, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: 220, marginBottom: 3 },
  grand: { fontWeight: 700, fontSize: 12 },
  footer: { position: 'absolute', left: 40, right: 40, bottom: 30, fontSize: 8, color: '#5d6b70' },
})

const Field = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Text>{value}</Text>
  </View>
)

export function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  const isTest = receipt.provider === 'mock'
  return (
    <Document title={`Makbuz ${receipt.receiptNo}`} author={receipt.companyName} language="tr">
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View>
            <Text style={styles.company}>{receipt.companyName}</Text>
            <Text style={styles.muted}>{receipt.siteName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.title}>Ödeme Makbuzu</Text>
            <Text style={styles.receiptNo}>{receipt.receiptNo}</Text>
            {receipt.status === 'voided' && <Text style={styles.stamp}>İPTAL EDİLDİ</Text>}
          </View>
        </View>

        {isTest && <Text style={styles.test}>TEST MODU: Bu makbuz deneme ödemesi içindir. Gerçek bir tahsilat değildir ve yasal geçerliliği yoktur.</Text>}

        <View style={styles.box}>
          <Field label="Tarih" value={formatDateTime(receipt.paidAt)} />
          <Field label="Daire" value={receipt.unitLabel} />
          <Field label="Ödeyen" value={receipt.payerName ?? '—'} />
          <Field label="Ödeme yöntemi" value={`${methodLabel(receipt.method)} · ${installmentsLabel(receipt.installments)}`} />
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.cType}>Borç</Text>
          <Text style={styles.cPeriod}>Dönem</Text>
          <Text style={styles.cDue}>Son ödeme</Text>
          <Text style={styles.cAmount}>Tutar</Text>
        </View>
        {receipt.lines.map((line, index) => (
          <View key={index} style={styles.row} wrap={false}>
            <Text style={styles.cType}>
              {line.typeName ?? 'Borç'}
              {line.description ? ` · ${line.description}` : ''}
            </Text>
            <Text style={styles.cPeriod}>{line.period ? monthLabel(line.period) : '—'}</Text>
            <Text style={styles.cDue}>{formatDate(line.dueDate)}</Text>
            <Text style={styles.cAmount}>{formatKurus(line.amountKurus)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Borç tutarı</Text>
            <Text>{formatKurus(receipt.amountKurus)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Komisyon</Text>
            <Text>{formatKurus(receipt.feeKurus)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grand]}>
            <Text>Toplam</Text>
            <Text>{formatKurus(receipt.totalKurus)}</Text>
          </View>
        </View>

        {receipt.status === 'voided' && receipt.voidReason && <Text style={[styles.stamp, { marginTop: 16 }]}>İptal nedeni: {receipt.voidReason}</Text>}

        <Text style={styles.footer} fixed>
          {receipt.companyName} · {receipt.receiptNo} · Ödeme Makbuzu
        </Text>
      </Page>
    </Document>
  )
}
