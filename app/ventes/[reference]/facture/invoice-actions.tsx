'use client'

import { useState } from 'react'
import { Download, Mail, MessageCircle, Printer } from 'lucide-react'
import { companyInfo } from '@/lib/company-info'

const statusLabel: Record<string, string> = { paid: 'Payée', partial: 'Partielle', credit: 'À crédit' }

type SaleDetail = {
  reference: string
  date: string
  storeName: string
  storeCity: string
  clientName: string
  clientPhone: string | null
  paymentStatus: string
  totalAmount: number
  totalAmountFormatted: string
  items: { productName: string; sku: string; quantity: number; unitPriceFormatted: string; lineTotalFormatted: string }[]
  receivable: { amountFormatted: string; dueDate: string } | null
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function buildInvoicePdf(sale: SaleDetail) {
  const { jsPDF } = await import('jspdf')
  const autoTableModule = await import('jspdf-autotable')
  const autoTable = autoTableModule.default

  const NAVY: [number, number, number] = [11, 46, 92]
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  const logoDataUrl = await loadImageAsDataUrl(companyInfo.logoPath)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', 14, 14, 20, 20)
    } catch {
      // Non-PNG or unreadable image — skip the logo rather than fail the whole export.
    }
  }

  const textX = logoDataUrl ? 38 : 14
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text(companyInfo.name, textX, 20)
  doc.setFontSize(8.5)
  doc.setTextColor(46, 158, 63)
  doc.text(companyInfo.tagline.toUpperCase(), textX, 25)
  doc.setFontSize(8.5)
  doc.setTextColor(120, 130, 145)
  doc.text(`${companyInfo.address}  ·  ${companyInfo.phone}  ·  ${companyInfo.email}`, textX, 30)

  doc.setFontSize(18)
  doc.setTextColor(...NAVY)
  doc.text('FACTURE', pageWidth - 14, 20, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(120, 130, 145)
  doc.text(`N° ${sale.reference}`, pageWidth - 14, 26, { align: 'right' })
  doc.text(new Date(sale.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }), pageWidth - 14, 31, { align: 'right' })
  doc.text(statusLabel[sale.paymentStatus] ?? sale.paymentStatus, pageWidth - 14, 36, { align: 'right' })

  autoTable(doc, {
    startY: 44,
    body: [
      [`Magasin\n${sale.storeName}\n${sale.storeCity}`, `Facturé à\n${sale.clientName}${sale.clientPhone ? `\n${sale.clientPhone}` : ''}`],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: (pageWidth - 28) / 2 }, 1: { cellWidth: (pageWidth - 28) / 2 } },
    margin: { left: 14, right: 14 },
  })

  const afterInfo = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

  autoTable(doc, {
    startY: afterInfo,
    head: [['Article', 'Qté', 'P.U.', 'Total']],
    body: sale.items.map((item) => [`${item.productName} (${item.sku})`, String(item.quantity), item.unitPriceFormatted, item.lineTotalFormatted]),
    theme: 'striped',
    headStyles: { fillColor: NAVY },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  const afterItems = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  doc.setFillColor(...NAVY)
  doc.rect(pageWidth - 90, afterItems, 76, 10, 'F')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('Total à payer', pageWidth - 86, afterItems + 6.5)
  doc.text(sale.totalAmountFormatted, pageWidth - 18, afterItems + 6.5, { align: 'right' })

  let afterTotal = afterItems + 14
  if (sale.receivable) {
    doc.setFontSize(9)
    doc.setTextColor(193, 120, 0)
    doc.text(
      `Solde dû (échéance ${new Date(sale.receivable.dueDate).toLocaleDateString('fr-FR')}) : ${sale.receivable.amountFormatted}`,
      pageWidth - 18,
      afterTotal,
      { align: 'right' },
    )
    afterTotal += 6
  }

  doc.setFontSize(8.5)
  doc.setTextColor(120, 130, 145)
  doc.text(`Merci pour votre confiance — ${companyInfo.name}`, pageWidth / 2, 285, { align: 'center' })

  return doc
}

export function InvoiceActions({ sale }: { sale: SaleDetail }) {
  const [generating, setGenerating] = useState<'download' | 'email' | 'whatsapp' | null>(null)
  const [hint, setHint] = useState('')

  async function downloadPdf() {
    const doc = await buildInvoicePdf(sale)
    doc.save(`facture-${sale.reference}.pdf`)
  }

  async function handleDownload() {
    setGenerating('download')
    try {
      await downloadPdf()
    } finally {
      setGenerating(null)
    }
  }

  async function handleShareWhatsapp() {
    setGenerating('whatsapp')
    try {
      await downloadPdf()
      setHint('PDF téléchargé — joignez-le manuellement dans la conversation WhatsApp qui vient de s’ouvrir.')
      const message = `Facture ${sale.reference} — ${companyInfo.name}\nMontant : ${sale.totalAmountFormatted}\nMerci de votre confiance !`
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    } finally {
      setGenerating(null)
    }
  }

  async function handleShareEmail() {
    setGenerating('email')
    try {
      await downloadPdf()
      setHint('PDF téléchargé — joignez-le manuellement au brouillon e-mail qui vient de s’ouvrir.')
      const subject = `Facture ${sale.reference} — ${companyInfo.name}`
      const body = `Bonjour,\n\nVeuillez trouver ci-joint la facture ${sale.reference} d'un montant de ${sale.totalAmountFormatted}.\n\nMerci de votre confiance.\n\n${companyInfo.name}\n${companyInfo.phone} · ${companyInfo.email}`
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {hint && <p style={{ fontSize: 10, color: 'var(--faint)', margin: 0, textAlign: 'right', maxWidth: 320 }}>{hint}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" disabled={generating !== null} onClick={handleShareEmail}>
          <Mail size={13} /> {generating === 'email' ? 'Préparation...' : 'E-mail'}
        </button>
        <button type="button" className="btn-secondary" disabled={generating !== null} onClick={handleShareWhatsapp}>
          <MessageCircle size={13} /> {generating === 'whatsapp' ? 'Préparation...' : 'WhatsApp'}
        </button>
        <button type="button" className="btn-secondary" disabled={generating !== null} onClick={handleDownload}>
          <Download size={13} /> {generating === 'download' ? 'Génération...' : 'Télécharger PDF'}
        </button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          <Printer size={13} /> Imprimer
        </button>
      </div>
    </div>
  )
}
