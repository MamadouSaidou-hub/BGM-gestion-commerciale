import { notFound } from 'next/navigation'
import { getSaleDetail } from '@/lib/db/queries'
import { getSessionContext, isAdmin } from '@/lib/session'
import { companyInfo } from '@/lib/company-info'
import { InvoiceActions } from './invoice-actions'

const statusLabel = { paid: 'Payée', partial: 'Partielle', credit: 'À crédit' }
const statusColor = { paid: '#2e9e3f', partial: '#f0a020', credit: '#3b82c4' }

const NAVY = '#0b2e5c'
const MUTED = '#7d8ba0'
const BORDER = '#e3e9f1'

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params
  const ctx = await getSessionContext()
  if (!ctx) notFound()

  const sale = await getSaleDetail(reference)
  if (!sale) notFound()
  if (!isAdmin(ctx) && sale.storeId !== ctx.storeId) notFound()

  const status = sale.paymentStatus as keyof typeof statusLabel

  return (
    <div className="invoice-page">
      <div id="invoice-root" className="invoice-card">
        <div className="invoice-topbar" />

        <div className="invoice-body">
          <div className="invoice-header">
            <div className="invoice-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={companyInfo.logoPath} alt={companyInfo.name} style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, letterSpacing: '-.3px' }}>{companyInfo.name}</div>
                <div style={{ fontSize: 10, color: '#2e9e3f', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', margin: '2px 0 6px' }}>{companyInfo.tagline}</div>
                <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.6 }}>
                  <div>{companyInfo.address}</div>
                  <div>{companyInfo.phone} · {companyInfo.email}</div>
                </div>
              </div>
            </div>
            <div className="invoice-meta">
              <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: '-.5px' }}>FACTURE</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>N° {sale.reference}</div>
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>
                {new Date(sale.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
              <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 12, color: statusColor[status], background: `${statusColor[status]}1a` }}>
                {statusLabel[status]}
              </span>
            </div>
          </div>

          <div className="invoice-parties">
            <div className="invoice-party">
              <p style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: '.08em', textTransform: 'uppercase', margin: '0 0 6px' }}>Magasin</p>
              <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>{sale.storeName}</p>
              <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>{sale.storeCity}</p>
            </div>
            <div className="invoice-party">
              <p style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: '.08em', textTransform: 'uppercase', margin: '0 0 6px' }}>Facturé à</p>
              <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>{sale.clientName}</p>
              {sale.clientPhone && <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>{sale.clientPhone}</p>}
            </div>
          </div>
        </div>

        <div className="invoice-items">
          <div className="invoice-table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${NAVY}` }}>
                  <th style={{ textAlign: 'left', padding: '10px 6px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Article</th>
                  <th style={{ textAlign: 'right', padding: '10px 6px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Qté</th>
                  <th style={{ textAlign: 'right', padding: '10px 6px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>P.U.</th>
                  <th style={{ textAlign: 'right', padding: '10px 6px', fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, index) => (
                  <tr key={index} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '10px 6px' }}>{item.productName} <span style={{ color: '#9aa8b8' }}>({item.sku})</span></td>
                    <td style={{ textAlign: 'right', padding: '10px 6px' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '10px 6px' }}>{item.unitPriceFormatted}</td>
                    <td style={{ textAlign: 'right', padding: '10px 6px', fontWeight: 600 }}>{item.lineTotalFormatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="invoice-totals-row">
            <div style={{ minWidth: 240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: NAVY, borderRadius: 8, color: 'white', fontWeight: 800, fontSize: 14 }}>
                <span>Total à payer</span><span>{sale.totalAmountFormatted}</span>
              </div>
              {sale.receivable && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px 0', fontSize: 11, color: '#c17800', fontWeight: 700 }}>
                  <span>Solde dû (échéance {new Date(sale.receivable.dueDate).toLocaleDateString('fr-FR')})</span>
                  <span>{sale.receivable.amountFormatted}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="invoice-footer" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>Merci pour votre confiance — {companyInfo.name}</p>
          <p style={{ fontSize: 9.5, color: '#b3bdcb', margin: '4px 0 0' }}>{companyInfo.address} · {companyInfo.phone} · {companyInfo.email}</p>
        </div>
      </div>

      <div className="print-hide invoice-actions-wrap">
        <InvoiceActions sale={sale} />
      </div>
    </div>
  )
}
