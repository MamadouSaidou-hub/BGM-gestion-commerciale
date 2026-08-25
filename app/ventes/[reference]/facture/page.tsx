import { notFound } from 'next/navigation'
import { getSaleDetail } from '@/lib/db/queries'
import { getSessionContext, isAdmin } from '@/lib/session'
import { PrintButton } from './print-button'

const statusLabel = { paid: 'Payée', partial: 'Partielle', credit: 'À crédit' }

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params
  const ctx = await getSessionContext()
  if (!ctx) notFound()

  const sale = await getSaleDetail(reference)
  if (!sale) notFound()
  if (!isAdmin(ctx) && sale.storeId !== ctx.storeId) notFound()

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif', color: '#142743' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>BGM</div>
          <div style={{ fontSize: 11, color: '#7d8ba0' }}>Barry-Gate Multi Service</div>
        </div>
        <PrintButton />
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Facture #{sale.reference}</h1>
      <p style={{ fontSize: 11, color: '#7d8ba0', marginBottom: 24 }}>
        {new Date(sale.date).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 12 }}>
        <div>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Magasin</p>
          <p>{sale.storeName}</p>
          <p style={{ color: '#7d8ba0' }}>{sale.storeCity}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Client</p>
          <p>{sale.clientName}</p>
          {sale.clientPhone && <p style={{ color: '#7d8ba0' }}>{sale.clientPhone}</p>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #142743' }}>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Article</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>Qté</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>P.U.</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #eef1f5' }}>
              <td style={{ padding: '8px 4px' }}>{item.productName} <span style={{ color: '#9aa8b8' }}>({item.sku})</span></td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{item.unitPriceFormatted}</td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>{item.lineTotalFormatted}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <div style={{ minWidth: 220, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid #142743', fontWeight: 800 }}>
            <span>Total</span><span>{sale.totalAmountFormatted}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, color: '#7d8ba0' }}>
            <span>Statut</span><span>{statusLabel[sale.paymentStatus as keyof typeof statusLabel]}</span>
          </div>
          {sale.receivable && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, color: '#c17800' }}>
              <span>Solde dû (échéance {new Date(sale.receivable.dueDate).toLocaleDateString('fr-FR')})</span>
              <span>{sale.receivable.amountFormatted}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
