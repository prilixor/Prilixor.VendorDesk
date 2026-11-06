import { CheckCircle2, FileText, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError, type RentalDetail, type Vendor } from './api'
import { fmtDate, inr } from './money'
import { PageHeader, ShopLogo } from './Shell'
import { StatusBadge, TotalsCard } from './ui'

export function RentalPage() {
  const { id } = useParams()
  const [rental, setRental] = useState<RentalDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [returning, setReturning] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id) return
    api<RentalDetail>(`/api/rentals/${id}`).then(setRental).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) setMissing(true) })
  }, [id])
  async function markReturned() {
    if (!rental) return
    setReturning(true)
    setError('')
    try {
      setRental(await api<RentalDetail>(`/api/rentals/${rental.id}/return`, { method: 'POST', body: '{}' }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The return could not be saved.')
    } finally {
      setReturning(false)
    }
  }

  if (missing) return <div className="mx-auto max-w-md py-20 text-center"><h1 className="text-xl font-semibold">Rental not found</h1><Link className="mt-6 inline-block font-semibold text-[var(--primary)]" to="/">Back to dashboard</Link></div>
  if (!rental) return <p className="text-sm text-[var(--muted)]">Loading…</p>
  const createdToday = rental.createdOn === new Date().toISOString().slice(0, 10)
  return (
    <div className="mx-auto max-w-6xl">
      {createdToday ? <div className="mb-5 flex items-start gap-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-4 text-sm"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--success)]" /><span>Rental confirmed. Invoice <strong>{rental.invoiceNo}</strong> was generated from this order.</span></div> : null}
      <PageHeader title={`Rental ${rental.number}`} subtitle={`Created ${fmtDate(rental.createdOn)}`} action={<><Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" to={`/invoice/${rental.id}`}><FileText className="size-4" /> View Invoice</Link><Link className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" to={`/invoice/${rental.id}?print=1`}><Printer className="size-4" /> Print</Link>{rental.status !== 'Returned' ? <button className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={returning} onClick={() => void markReturned()}>{returning ? 'Saving…' : 'Mark returned'}</button> : null}</>} />
      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {rental.status === 'Returned' ? <div className="mb-5 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-4 text-sm">Equipment returned. The quantity is back in inventory.</div> : null}
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4 text-sm">
            <div className="mb-2 flex items-center justify-between"><span className="font-medium">Customer</span><StatusBadge status={rental.status} /></div>
            <div className="font-medium">{rental.customer.name}</div>
            <div className="text-[var(--muted)]">{rental.customer.mobile}{rental.customer.email ? ` · ${rental.customer.email}` : ''}</div>
            <div className="text-[var(--muted)]">{rental.customer.address}</div>
            <div className="mt-2 text-xs text-[var(--muted)]">Reference: {rental.customer.refName} ({rental.customer.refRelation}) · {rental.customer.refMobile}</div>
          </div>
          <div className="rounded-lg border bg-white text-sm">
            <div className="border-b p-4 font-medium">Items</div>
            {rental.items.map((item) => (
              <div key={item.productId} className="flex justify-between gap-3 border-b p-4 last:border-0">
                <div className="min-w-0">{item.photo ? <img src={item.photo} alt={`${item.name} rental photo`} className="mb-2 size-16 rounded-md border object-cover" /> : null}<div className="font-medium">{item.name} × {item.quantity}</div><div className="text-xs text-[var(--muted)]">{item.days} days · {fmtDate(item.startDate)} → {fmtDate(item.endDate)} · {inr(item.pricePerDay)}/day</div><div className="text-xs text-[var(--muted)]">Deposit {inr(item.depositPerUnit)}/unit</div></div>
                <span className="shrink-0 font-mono">{inr(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <TotalsCard t={rental.totals} />
      </div>
    </div>
  )
}

export function InvoicePage({ vendor }: { vendor: Vendor }) {
  const { id } = useParams()
  const [rental, setRental] = useState<RentalDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const print = new URLSearchParams(window.location.search).get('print') === '1'
  useEffect(() => {
    if (!id) return
    api<RentalDetail>(`/api/rentals/${id}`).then(setRental).catch(() => setMissing(true))
  }, [id])
  useEffect(() => { if (print && rental) window.setTimeout(() => window.print(), 300) }, [print, rental])
  if (missing) return <div className="mx-auto max-w-md py-20 text-center"><h1 className="text-xl font-semibold">Rental not found</h1></div>
  if (!rental) return <p className="text-sm text-[var(--muted)]">Loading…</p>
  const totals = rental.totals
  const row = (label: string, value: string, strong = false) => <div className={strong ? 'flex justify-between border-t pt-2 text-base font-semibold' : 'flex justify-between'}><span>{label}</span><span className="font-mono">{value}</span></div>
  return (
    <div className="mx-auto max-w-6xl">
      <div className="no-print mb-4 flex justify-between">
        <Link className="text-sm font-medium" to={`/rentals/${rental.id}`}>Back to rental</Link>
        <button className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => window.print()}><Printer className="size-4" /> Print</button>
      </div>
      <article className="print-area rounded-lg border bg-white p-6 text-sm md:p-10">
        <header className="flex flex-wrap justify-between gap-4 border-b pb-6">
          <div className="flex items-start gap-3"><ShopLogo logo={vendor.logo} name={rental.business.name} className="size-16 shrink-0 rounded-md border p-1" /><div><div className="text-lg font-semibold">{rental.business.name}</div><div className="text-[var(--muted)]">{rental.business.address}</div><div className="text-[var(--muted)]">{rental.business.phone}{rental.business.gstin ? ` · GSTIN ${rental.business.gstin}` : ''}</div></div></div>
          <div className="sm:text-right"><div className="text-2xl font-semibold tracking-tight text-[var(--primary)]">INVOICE</div><div className="font-mono">{rental.invoiceNo}</div><div className="text-[var(--muted)]">Date: {fmtDate(rental.createdOn)}</div><div className="text-[var(--muted)]">Order: {rental.number}</div></div>
        </header>
        <section className="grid gap-4 border-b py-6 sm:grid-cols-2">
          <div><div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Bill to</div><div className="font-medium">{rental.customer.name}</div><div>{rental.customer.mobile}{rental.customer.email ? ` · ${rental.customer.email}` : ''}</div><div className="text-[var(--muted)]">{rental.customer.address}</div></div>
          <div><div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Reference</div><div>{rental.customer.refName} ({rental.customer.refRelation})</div><div>{rental.customer.refMobile}</div></div>
        </section>
        <div className="space-y-4 py-6 md:hidden print:hidden">
          {rental.items.map((item) => (
            <div key={item.productId} className="border-b pb-4 last:border-0">
              <div className="font-medium">{item.name}</div>
              <div className="text-xs text-[var(--muted)]">Deposit {inr(item.depositPerUnit)}/unit</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>Qty <span className="font-mono">{item.quantity}</span></div>
                <div>{item.days} days</div>
                <div className="col-span-2 text-xs text-[var(--muted)]">{fmtDate(item.startDate)} – {fmtDate(item.endDate)}</div>
                <div>Rate <span className="font-mono">{inr(item.pricePerDay)}</span></div>
                <div className="text-right font-mono">{inr(item.amount)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto py-6 md:block print:block">
          <table className="w-full min-w-[520px]">
            <thead className="border-b text-left text-xs text-[var(--muted)]"><tr><th className="py-2">Item</th><th>Qty</th><th>Duration</th><th>Period</th><th className="text-right">Rate/day</th><th className="text-right">Amount</th></tr></thead>
            <tbody className="divide-y">
              {rental.items.map((item) => (
                <tr key={item.productId}><td className="py-2 font-medium">{item.name}<div className="text-xs font-normal text-[var(--muted)]">Deposit {inr(item.depositPerUnit)}/unit</div></td><td className="font-mono">{item.quantity}</td><td>{item.days} days</td><td className="text-xs">{fmtDate(item.startDate)} – {fmtDate(item.endDate)}</td><td className="text-right font-mono">{inr(item.pricePerDay)}</td><td className="text-right font-mono">{inr(item.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-xs space-y-1">
          {row('Subtotal', inr(totals.subtotal))}
          {row(totals.discountLabel, '−' + inr(totals.discount))}
          {totals.additionalFees > 0 ? row('Additional charges', inr(totals.additionalFees)) : null}
          {row(`GST (${totals.taxPercent}%)`, inr(totals.tax))}
          {totals.deposit > 0 ? row('Refundable deposit', inr(totals.deposit)) : null}
          {row('Total', inr(totals.total), true)}
        </div>
        <footer className="mt-10 border-t pt-4 text-xs text-[var(--muted)]">Deposit is refundable on return of equipment in good condition.</footer>
      </article>
    </div>
  )
}
