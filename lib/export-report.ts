import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export type ReportsData = {
  totalRevenue: number
  totalRevenueFormatted: string
  totalMargin: number
  totalMarginFormatted: string
  marginPct: number
  salesCount: number
  avgBasket: number
  avgBasketFormatted: string
  salesTrend: { label: string; value: number }[]
  storeRevenue: { name: string; amount: number; formatted: string }[]
  topProducts: { name: string; quantity: number; revenue: number; formatted: string }[]
  topClients: { name: string; revenue: number; salesCount: number; formatted: string }[]
  paymentBreakdown: { status: string; label: string; count: number; amount: number; formatted: string }[]
  supplierSummary: { totalSacks: number; deliveriesCount: number; totalPaid: number; totalPaidFormatted: string }
}

const PRIMARY_RGB: [number, number, number] = [11, 46, 92] // matches --primary in app/globals.css

function docTitle(periodLabel: string) {
  const generatedAt = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  return { generatedAt }
}

export function exportReportPdf(data: ReportsData, periodLabel: string) {
  const doc = new jsPDF()
  const { generatedAt } = docTitle(periodLabel)
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(18)
  doc.setTextColor(...PRIMARY_RGB)
  doc.text('BGM — Rapport d’activité', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text(`Période : ${periodLabel}  ·  Généré le ${generatedAt}`, 14, 25)

  autoTable(doc, {
    startY: 32,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Chiffre d’affaires', data.totalRevenueFormatted],
      ['Marge brute', `${data.totalMarginFormatted} (${data.marginPct.toFixed(1)} %)`],
      ['Nombre de ventes', String(data.salesCount)],
      ['Panier moyen', data.avgBasketFormatted],
    ],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY_RGB },
    margin: { left: 14, right: 14 },
  })

  const afterKpis = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  autoTable(doc, {
    startY: afterKpis,
    head: [['Chiffre d’affaires par magasin', 'Montant']],
    body: data.storeRevenue.map((row) => [row.name, row.formatted]),
    theme: 'striped',
    headStyles: { fillColor: PRIMARY_RGB },
    margin: { left: 14, right: 14 },
  })

  const afterStores = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  autoTable(doc, {
    startY: afterStores,
    head: [['Statut de paiement', 'Nb ventes', 'Montant']],
    body: data.paymentBreakdown.map((row) => [row.label, String(row.count), row.formatted]),
    theme: 'striped',
    headStyles: { fillColor: PRIMARY_RGB },
    margin: { left: 14, right: 14 },
  })

  doc.addPage()
  doc.setFontSize(13)
  doc.setTextColor(...PRIMARY_RGB)
  doc.text('Top produits vendus', 14, 18)

  autoTable(doc, {
    startY: 24,
    head: [['Produit', 'Quantité (sacs)', 'Chiffre d’affaires']],
    body: data.topProducts.map((row) => [row.name, String(row.quantity), row.formatted]),
    theme: 'striped',
    headStyles: { fillColor: PRIMARY_RGB },
    margin: { left: 14, right: 14 },
  })

  const afterProducts = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14

  doc.setFontSize(13)
  doc.setTextColor(...PRIMARY_RGB)
  doc.text('Top clients', 14, afterProducts)

  autoTable(doc, {
    startY: afterProducts + 6,
    head: [['Client', 'Nb ventes', 'Chiffre d’affaires']],
    body: data.topClients.map((row) => [row.name, String(row.salesCount), row.formatted]),
    theme: 'striped',
    headStyles: { fillColor: PRIMARY_RGB },
    margin: { left: 14, right: 14 },
  })

  const afterClients = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14

  doc.setFontSize(13)
  doc.setTextColor(...PRIMARY_RGB)
  doc.text('Fournisseurs', 14, afterClients)

  autoTable(doc, {
    startY: afterClients + 6,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Sacs reçus sur la période', String(data.supplierSummary.totalSacks)],
      ['Nombre de livraisons', String(data.supplierSummary.deliveriesCount)],
      ['Payé aux fournisseurs', data.supplierSummary.totalPaidFormatted],
    ],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY_RGB },
    margin: { left: 14, right: 14 },
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 25, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(`rapport-bgm-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export function exportReportExcel(data: ReportsData, periodLabel: string) {
  const workbook = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Rapport d’activité BGM'],
    [`Période : ${periodLabel}`],
    [`Généré le ${new Date().toLocaleString('fr-FR')}`],
    [],
    ['Indicateur', 'Valeur'],
    ['Chiffre d’affaires (FCFA)', data.totalRevenue],
    ['Marge brute (FCFA)', data.totalMargin],
    ['Marge (%)', Number(data.marginPct.toFixed(1))],
    ['Nombre de ventes', data.salesCount],
    ['Panier moyen (FCFA)', Math.round(data.avgBasket)],
    ['Sacs reçus (fournisseurs)', data.supplierSummary.totalSacks],
    ['Livraisons fournisseurs', data.supplierSummary.deliveriesCount],
    ['Payé aux fournisseurs (FCFA)', data.supplierSummary.totalPaid],
  ])
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Résumé')

  const trendSheet = XLSX.utils.json_to_sheet(data.salesTrend.map((row) => ({ Période: row.label, 'Chiffre d’affaires (FCFA)': row.value })))
  XLSX.utils.book_append_sheet(workbook, trendSheet, 'Évolution ventes')

  const storeSheet = XLSX.utils.json_to_sheet(data.storeRevenue.map((row) => ({ Magasin: row.name, 'Montant (FCFA)': row.amount })))
  XLSX.utils.book_append_sheet(workbook, storeSheet, 'Par magasin')

  const paymentSheet = XLSX.utils.json_to_sheet(
    data.paymentBreakdown.map((row) => ({ Statut: row.label, 'Nb ventes': row.count, 'Montant (FCFA)': row.amount })),
  )
  XLSX.utils.book_append_sheet(workbook, paymentSheet, 'Statuts paiement')

  const productsSheet = XLSX.utils.json_to_sheet(
    data.topProducts.map((row) => ({ Produit: row.name, 'Quantité (sacs)': row.quantity, 'Chiffre d’affaires (FCFA)': row.revenue })),
  )
  XLSX.utils.book_append_sheet(workbook, productsSheet, 'Top produits')

  const clientsSheet = XLSX.utils.json_to_sheet(
    data.topClients.map((row) => ({ Client: row.name, 'Nb ventes': row.salesCount, 'Chiffre d’affaires (FCFA)': row.revenue })),
  )
  XLSX.utils.book_append_sheet(workbook, clientsSheet, 'Top clients')

  XLSX.writeFile(workbook, `rapport-bgm-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
