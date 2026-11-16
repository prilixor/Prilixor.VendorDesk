import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, type DepositReportRow, type DueReportRow, type GstReportRow, type RevenueReportRow, type ShopReport, type StockReportRow } from './api'
import { fmtDate, inr } from './money'
import { PageHeader } from './Shell'
import { Pager, pageRows, StatusBadge } from './ui'

const reportIds = ['due', 'revenue', 'gst', 'deposits', 'stock'] as const
type ReportId = (typeof reportIds)[number]
type Preset = 'today' | 'week' | 'month' | 'custom'
type DueFilter = 'All' | 'Overdue' | 'Due today' | 'Due soon' | 'Active'
const pageSize = 8

const titles: Record<ReportId, { title: string; subtitle: string }> = {
  due: { title: 'Due and overdue', subtitle: 'Open rentals, soonest return first. Days late use the earliest item end date.' },
  revenue: { title: 'Revenue', subtitle: 'Rentals created in this period. Billed is taxable rent, extra fees, and GST. Refundable deposits are on the Deposits report.' },
  gst: { title: 'GST', subtitle: 'Tax charged on rentals created in this period. Taxable value is the rent after discount plus extra fees.' },
  deposits: { title: 'Deposits held', subtitle: 'Refundable deposits on rentals that are still out.' },
  stock: { title: 'Stock position', subtitle: 'In shop and out now are current. Rented columns follow the selected period.' },
}

export function ReportsPage() {
  const { report: reportParam } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const reportId = reportIds.find((id) => id === reportParam)
  const period = resolvePeriod(searchParams)
  const problem = rangeProblem(period.from, period.to)
  const [report, setReport] = useState<ShopReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const query = `preset=${period.preset}&from=${period.from}&to=${period.to}`
  const current = !problem && !error && report && report.from === period.from && report.to === period.to ? report : null

  useEffect(() => {
    if (problem) return
    let cancel = false
    setLoading(true)
    setError('')
    void api<ShopReport>(`/api/reports?from=${period.from}&to=${period.to}`)
      .then((data) => { if (!cancel) setReport(data) })
      .catch((caught: unknown) => { if (!cancel) setError(caught instanceof ApiError ? caught.message : 'Reports could not be loaded.') })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [period.from, period.to, problem])

  if (reportParam && !reportId) return <Navigate to={`/reports?${query}`} replace />

  function choosePreset(preset: Preset) {
    const next = preset === 'custom' ? { from: period.from, to: period.to } : ranges()[preset]
    setSearchParams({ preset, from: next.from, to: next.to }, { replace: true })
  }

  function chooseCustom(from: string, to: string) {
    const issue = rangeProblem(from, to)
    if (issue === 'The start date has to be on or before the end date.' || issue === 'Dates have to be today or earlier.' || issue === 'Choose a period of one year or less.') return
    setSearchParams({ preset: 'custom', from, to }, { replace: true })
  }

  return (
    <div className="min-w-0 w-full">
      {reportId ? <Link className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)]" to={`/reports?${query}`}><ChevronLeft className="size-4" /> All reports</Link> : null}
      <PageHeader title={reportId ? titles[reportId].title : 'Reports'} subtitle={reportId ? titles[reportId].subtitle : 'Returns, billed rent, GST, deposits, and stock.'} />
      {!reportId || reportId === 'revenue' || reportId === 'gst' || reportId === 'stock' ? (
        <PeriodBar preset={period.preset} from={period.from} to={period.to} problem={problem} onPreset={choosePreset} onCustom={chooseCustom} />
      ) : <p className="mb-5 text-sm text-[var(--muted)]">As of {current ? fmtDate(current.asOf) : 'today'}</p>}
      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {problem ? null : reportId ? (
        current ? <ReportDetail id={reportId} report={current} /> : <p className="text-sm text-[var(--muted)]">{loading ? 'Loading report…' : ''}</p>
      ) : (
        <ReportHub query={query} report={current} loading={loading || !current} />
      )}
    </div>
  )
}

function ReportHub({ query, report, loading }: { query: string; report: ShopReport | null; loading: boolean }) {
  const summary = report?.summary
  const gstBase = report?.gst.reduce((sum, row) => sum + row.taxable, 0) ?? 0
  const cards = [
    { id: 'due' as const, label: 'Due and overdue', value: summary ? String(summary.overdue + summary.dueToday) : '', detail: summary ? `${summary.overdue} overdue · ${summary.dueToday} due today` : 'Late or due today', note: 'Right now' },
    { id: 'revenue' as const, label: 'Revenue', value: summary ? inr(summary.billed) : '', detail: report ? `${report.revenue.length} rentals · taxable ${inr(report.summary.taxable)}` : 'Billed rent', note: 'Selected period' },
    { id: 'gst' as const, label: 'GST', value: summary ? inr(summary.tax) : '', detail: report ? (report.gstin ? `GSTIN ${report.gstin}` : 'GSTIN not set') : 'Tax for the period', note: report ? `On ${inr(gstBase)}` : 'Selected period' },
    { id: 'deposits' as const, label: 'Deposits held', value: summary ? inr(summary.depositsHeld) : '', detail: report ? `${report.deposits.length} open rentals` : 'Refundable money', note: 'Right now' },
    { id: 'stock' as const, label: 'Stock position', value: summary ? String(summary.unitsOut) : '', detail: 'Units out with customers', note: 'Right now' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      {cards.map((card) => (
        <Link key={card.id} to={`/reports/${card.id}?${query}`} className={`rounded-lg border bg-white p-3 hover:border-[var(--primary)] sm:p-4 ${card.id === 'stock' ? 'col-span-2 lg:col-span-1' : ''}`}>
          <div className="flex items-start justify-between gap-2 text-xs text-[var(--muted)]"><span className="min-w-0 leading-snug">{card.label}</span><span className="shrink-0">{card.note}</span></div>
          <div className="mt-2 truncate font-mono text-xl sm:text-2xl">{loading && !summary ? '—' : card.value}</div>
          <div className="mt-1 text-xs leading-snug text-[var(--muted)]">{card.detail}</div>
        </Link>
      ))}
    </div>
  )
}

function ReportDetail({ id, report }: { id: ReportId; report: ShopReport }) {
  const here = useLocation()
  const from = here.pathname + here.search
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [dueFilter, setDueFilter] = useState<DueFilter>('All')
  useEffect(() => { setSearch(''); setPage(0); setDueFilter('All') }, [id])
  const needle = search.trim().toLowerCase()
  const due = useMemo(() => report.due.filter((row) => (dueFilter === 'All' || row.status === dueFilter) && includes(needle, row.number, row.customerName, row.customerMobile, row.status, row.itemNames)), [report.due, dueFilter, needle])
  const revenue = useMemo(() => report.revenue.filter((row) => includes(needle, row.number, row.customerName)), [report.revenue, needle])
  const gst = useMemo(() => report.gst.filter((row) => includes(needle, row.number, row.invoiceNo, row.customerName)), [report.gst, needle])
  const deposits = useMemo(() => report.deposits.filter((row) => includes(needle, row.number, row.customerName, row.customerMobile, row.itemNames)), [report.deposits, needle])
  const stock = useMemo(() => report.stock.filter((row) => includes(needle, row.productName, row.categoryName)), [report.stock, needle])
  const duePage = pageRows(due, page, pageSize)
  const revenuePage = pageRows(revenue, page, pageSize)
  const gstPage = pageRows(gst, page, pageSize)
  const depositPage = pageRows(deposits, page, pageSize)
  const stockPage = pageRows(stock, page, pageSize)
  const shown = id === 'due' ? duePage : id === 'revenue' ? revenuePage : id === 'gst' ? gstPage : id === 'deposits' ? depositPage : stockPage
  const count = shown.total
  const empty = needle ? 'Nothing matches that search.' : id === 'due' && dueFilter !== 'All' ? 'No rentals with this status.' : id === 'due' ? 'Nothing is out on rent.' : id === 'revenue' ? 'No rentals were created in this period.' : id === 'gst' ? 'No taxable rentals in this period.' : id === 'deposits' ? 'No refundable deposits are held.' : 'No offered products yet.'

  return (
    <section className="rounded-lg border bg-white">
      <Summary id={id} report={report} />
      <div className="border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className="h-10 w-full rounded-md border py-2 pl-9 pr-3 text-base" type="search" aria-label={id === 'stock' ? 'Search by product or category' : 'Search by customer, mobile, or rental'} placeholder={id === 'stock' ? 'Product or category' : 'Name, mobile, or rental'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} />
        </div>
        {id === 'due' ? <DueStatusBar value={dueFilter} rows={report.due} onChange={(filter) => { setDueFilter(filter); setPage(0) }} /> : null}
      </div>
      {!count ? <p className="px-4 py-6 text-sm text-[var(--muted)]">{empty}{id === 'stock' && !needle ? <> <Link className="font-medium text-[var(--primary)]" to="/inventory">Set price and quantity</Link></> : null}</p> : (
        <>
          {id === 'due' ? <DueRows rows={duePage.rows} from={from} /> : null}
          {id === 'revenue' ? <RevenueRows rows={revenuePage.rows} from={from} /> : null}
          {id === 'gst' ? <GstRows rows={gstPage.rows} from={from} /> : null}
          {id === 'deposits' ? <DepositRows rows={depositPage.rows} from={from} /> : null}
          {id === 'stock' ? <StockRows rows={stockPage.rows} /> : null}
          {shown.pages > 1 ? <div className="px-4 pb-3"><Pager current={shown.current} pages={shown.pages} total={shown.total} size={pageSize} onChange={setPage} /></div> : <p className="px-4 py-3 text-xs text-[var(--muted)]">{count === 1 ? '1 row' : `${count} rows`}</p>}
        </>
      )}
    </section>
  )
}

function DueStatusBar({ value, rows, onChange }: { value: DueFilter; rows: DueReportRow[]; onChange: (filter: DueFilter) => void }) {
  const filters: { id: DueFilter; label: string; short: string }[] = [
    { id: 'All', label: 'All', short: 'All' },
    { id: 'Overdue', label: 'Overdue', short: 'Overdue' },
    { id: 'Due today', label: 'Due today', short: 'Today' },
    { id: 'Due soon', label: 'Due soon', short: 'Soon' },
    { id: 'Active', label: 'Active', short: 'Active' },
  ]
  return (
    <div className="mt-3 grid grid-cols-5 overflow-hidden rounded-lg border" role="tablist" aria-label="Filter by status">
      {filters.map((filter, index) => {
        const count = filter.id === 'All' ? rows.length : rows.filter((row) => row.status === filter.id).length
        const selected = value === filter.id
        return (
          <button key={filter.id} type="button" role="tab" aria-selected={selected} className={`min-w-0 px-1 py-1.5 text-center sm:px-3 sm:py-2 ${index > 0 ? 'border-l' : ''} ${selected ? 'bg-[var(--accent)]' : 'bg-white hover:bg-slate-50'}`} onClick={() => onChange(filter.id)}>
            <span className={`block truncate text-[11px] leading-tight sm:hidden ${selected ? 'font-medium text-[var(--primary)]' : 'text-[var(--muted)]'}`}>{filter.short}</span>
            <span className={`hidden truncate text-xs leading-tight sm:block ${selected ? 'font-medium text-[var(--primary)]' : 'text-[var(--muted)]'}`}>{filter.label}</span>
            <span className={`mt-0.5 block font-mono text-sm leading-none ${selected ? 'font-semibold text-[var(--primary)]' : count === 0 ? 'text-[var(--muted)]' : 'font-medium'}`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function Summary({ id, report }: { id: ReportId; report: ShopReport }) {
  const items: [string, string][] = id === 'due'
    ? [['Overdue', String(report.summary.overdue)], ['Due today', String(report.summary.dueToday)], ['Open', String(report.summary.open)], ['Units out', String(report.summary.unitsOut)]]
    : id === 'revenue'
      ? [['Billed', inr(report.summary.billed)], ['Taxable', inr(report.summary.taxable)], ['GST', inr(report.summary.tax)], ['Rentals', String(report.revenue.length)]]
      : id === 'gst'
        ? [['Tax', inr(report.summary.tax)], ['Taxable value', inr(report.gst.reduce((sum, row) => sum + row.taxable, 0))], ['GSTIN', report.gstin || 'Not set'], ['Invoices', String(report.gst.length)]]
        : id === 'deposits'
          ? [['Held', inr(report.summary.depositsHeld)], ['Rentals', String(report.deposits.length)]]
          : [['Out now', String(report.summary.unitsOut)], ['Rented in period', String(report.stock.reduce((sum, row) => sum + row.rentedQty, 0))], ['Products', String(report.stock.length)]]
  const wide = items.length === 2 ? 'sm:grid-cols-2' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'
  const restCols = items.length === 3 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className="border-b">
      <div className="sm:hidden">
        {items.length <= 2 ? (
          <div className="grid grid-cols-2">
            {items.map(([label, value], index) => <Stat key={label} label={label} value={value} strong={index === 0} edge={index > 0} />)}
          </div>
        ) : (
          <>
            <Stat label={items[0][0]} value={items[0][1]} strong />
            <div className={`grid border-t ${restCols}`}>
              {items.slice(1).map(([label, value], index) => <Stat key={label} label={label} value={value} edge={index > 0} />)}
            </div>
          </>
        )}
      </div>
      <div className={`hidden sm:grid ${wide}`}>
        {items.map(([label, value], index) => <Stat key={label} label={label} value={value} edge={index > 0} />)}
      </div>
    </div>
  )
}

function Stat({ label, value, strong = false, edge = false }: { label: string; value: string; strong?: boolean; edge?: boolean }) {
  return (
    <div className={`min-w-0 px-4 py-3 ${edge ? 'border-l' : ''}`}>
      <div className="text-xs leading-tight text-[var(--muted)]">{label}</div>
      <div className={`mt-1 truncate font-mono ${strong ? 'text-2xl' : 'text-sm sm:text-base'}`}>{value}</div>
    </div>
  )
}

function DueRows({ rows, from }: { rows: DueReportRow[]; from: string }) {
  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link className="block px-4 py-3 hover:bg-slate-50" to={`/rentals/${row.id}`} state={{ from }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-medium">{row.customerName}</div><div className="text-xs text-[var(--muted)]">{row.number} · {row.customerMobile}</div></div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-1 truncate text-sm text-[var(--muted)]">{row.itemNames.join(', ')}</div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-[var(--muted)]">Return</dt><dd>{fmtDate(row.returnOn)}</dd></div>
                <div><dt className="text-xs text-[var(--muted)]">Late</dt><dd className="font-mono">{row.daysLate ? `${row.daysLate}d` : '—'}</dd></div>
                <div><dt className="text-xs text-[var(--muted)]">Units</dt><dd className="font-mono">{row.units}</dd></div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="px-4 py-2">Rental</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Items</th><th className="px-4 py-2">Units</th><th className="px-4 py-2">Return</th><th className="px-4 py-2">Late</th><th className="px-4 py-2">Status</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2"><Link className="font-mono text-xs font-medium text-[var(--primary)]" to={`/rentals/${row.id}`} state={{ from }}>{row.number}</Link></td>
                <td className="px-4 py-2"><div className="font-medium">{row.customerName}</div><div className="text-xs text-[var(--muted)]">{row.customerMobile}</div></td>
                <td className="max-w-xs truncate px-4 py-2 text-[var(--muted)]">{row.itemNames.join(', ')}</td>
                <td className="px-4 py-2 font-mono">{row.units}</td>
                <td className="px-4 py-2">{fmtDate(row.returnOn)}</td>
                <td className="px-4 py-2 font-mono">{row.daysLate ? `${row.daysLate}d` : '—'}</td>
                <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function RevenueRows({ rows, from }: { rows: RevenueReportRow[]; from: string }) {
  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link className="block px-4 py-3 hover:bg-slate-50" to={`/rentals/${row.id}`} state={{ from }}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{row.customerName}</div><div className="text-xs text-[var(--muted)]">{row.number} · {fmtDate(row.createdOn)}</div></div><div className="font-mono text-sm">{inr(row.billed)}</div></div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-[var(--muted)]">Taxable</dt><dd className="font-mono">{inr(row.taxable)}</dd></div>
                <div><dt className="text-xs text-[var(--muted)]">GST</dt><dd className="font-mono">{inr(row.tax)}</dd></div>
                <div><dt className="text-xs text-[var(--muted)]">Fees</dt><dd className="font-mono">{inr(row.additionalFees)}</dd></div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="px-4 py-2">Rental</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Taxable</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Fees</th><th className="px-4 py-2 text-right">GST</th><th className="px-4 py-2 text-right">Billed</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2"><Link className="font-mono text-xs font-medium text-[var(--primary)]" to={`/rentals/${row.id}`} state={{ from }}>{row.number}</Link></td>
                <td className="px-4 py-2">{fmtDate(row.createdOn)}</td>
                <td className="px-4 py-2 font-medium">{row.customerName}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.taxable)}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.discount)}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.additionalFees)}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.tax)}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.billed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function GstRows({ rows, from }: { rows: GstReportRow[]; from: string }) {
  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link className="block px-4 py-3 hover:bg-slate-50" to={`/rentals/${row.id}`} state={{ from }}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{row.customerName}</div><div className="text-xs text-[var(--muted)]">{row.invoiceNo} · {fmtDate(row.createdOn)}</div></div><div className="font-mono text-sm">{inr(row.tax)}</div></div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-[var(--muted)]">Taxable value</dt><dd className="font-mono">{inr(row.taxable)}</dd></div>
                <div><dt className="text-xs text-[var(--muted)]">Rate</dt><dd className="font-mono">{trim(row.taxPercent)}%</dd></div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2 text-right">Taxable value</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Tax</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2"><Link className="font-mono text-xs font-medium text-[var(--primary)]" to={`/rentals/${row.id}`} state={{ from }}>{row.invoiceNo}</Link></td>
                <td className="px-4 py-2">{fmtDate(row.createdOn)}</td>
                <td className="px-4 py-2 font-medium">{row.customerName}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.taxable)}</td>
                <td className="px-4 py-2 text-right font-mono">{trim(row.taxPercent)}%</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DepositRows({ rows, from }: { rows: DepositReportRow[]; from: string }) {
  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link className="block px-4 py-3 hover:bg-slate-50" to={`/rentals/${row.id}`} state={{ from }}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-medium">{row.customerName}</div><div className="text-xs text-[var(--muted)]">{row.number} · {row.customerMobile}</div></div><div className="font-mono text-sm">{inr(row.deposit)}</div></div>
              <div className="mt-1 truncate text-sm text-[var(--muted)]">{row.itemNames.join(', ')}</div>
              <div className="mt-2 text-sm"><div className="text-xs text-[var(--muted)]">Return</div>{fmtDate(row.returnOn)}</div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="px-4 py-2">Rental</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Items</th><th className="px-4 py-2">Units</th><th className="px-4 py-2">Return</th><th className="px-4 py-2 text-right">Deposit</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2"><Link className="font-mono text-xs font-medium text-[var(--primary)]" to={`/rentals/${row.id}`} state={{ from }}>{row.number}</Link></td>
                <td className="px-4 py-2"><div className="font-medium">{row.customerName}</div><div className="text-xs text-[var(--muted)]">{row.customerMobile}</div></td>
                <td className="max-w-xs truncate px-4 py-2 text-[var(--muted)]">{row.itemNames.join(', ')}</td>
                <td className="px-4 py-2 font-mono">{row.units}</td>
                <td className="px-4 py-2">{fmtDate(row.returnOn)}</td>
                <td className="px-4 py-2 text-right font-mono">{inr(row.deposit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function StockRows({ rows }: { rows: StockReportRow[] }) {
  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={row.productId} className="px-4 py-3">
            <div className="font-medium">{row.productName}</div>
            {row.categoryName ? <div className="text-xs text-[var(--muted)]">{row.categoryName}</div> : null}
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-[var(--muted)]">In shop</dt><dd className="font-mono">{row.inShop}</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Out now</dt><dd className="font-mono">{row.outNow}</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Rented qty</dt><dd className="font-mono">{row.rentedQty}</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Times</dt><dd className="font-mono">{row.times}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">In shop</th><th className="px-4 py-2">Out now</th><th className="px-4 py-2">Rented qty</th><th className="px-4 py-2">Times</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.productId}>
                <td className="px-4 py-2"><div className="font-medium">{row.productName}</div>{row.categoryName ? <div className="text-xs text-[var(--muted)]">{row.categoryName}</div> : null}</td>
                <td className="px-4 py-2 font-mono">{row.inShop}</td>
                <td className="px-4 py-2 font-mono">{row.outNow}</td>
                <td className="px-4 py-2 font-mono">{row.rentedQty}</td>
                <td className="px-4 py-2 font-mono">{row.times}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PeriodBar({ preset, from, to, problem, onPreset, onCustom }: { preset: Preset; from: string; to: string; problem: string; onPreset: (preset: Preset) => void; onCustom: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false)
  const [calendar, setCalendar] = useState<'from' | 'to' | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const presets: [Preset, string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Custom range']]
  const current = presets.find(([id]) => id === preset)?.[1] ?? 'Period'
  const label = problem ? 'Choose a valid range' : parseIso(from) && parseIso(to) ? `${fmtDate(from)} – ${fmtDate(to)}` : 'Choose dates'
  const today = iso(new Date())

  useEffect(() => {
    if (!open && !calendar) return
    const close = (event: MouseEvent) => {
      if (box.current?.contains(event.target as Node)) return
      setOpen(false)
      setCalendar(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setCalendar(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, calendar])

  function choose(id: Preset) {
    onPreset(id)
    setOpen(false)
    setCalendar(null)
  }

  function pick(day: string) {
    if (!parseIso(day) || day > today || day < firstReportYear) return
    if (calendar === 'from') {
      let end = to && to >= day ? to : day
      const limit = shiftYears(day, 1)
      if (limit && end > limit) end = limit
      if (end > today) end = today
      onCustom(day, end)
    }
    if (calendar === 'to') {
      let start = from && from <= day ? from : day
      const limit = shiftYears(day, -1)
      if (limit && start < limit) start = limit
      if (start < firstReportYear) start = firstReportYear
      onCustom(start, day)
    }
    setCalendar(null)
  }

  return (
    <div ref={box} className="relative mb-4">
      <div className={`grid items-end gap-3 ${preset === 'custom' ? 'grid-cols-2 sm:grid-cols-3' : 'max-w-md'}`}>
        <div className={`relative ${preset === 'custom' ? 'col-span-2 sm:col-span-1' : ''}`}>
          <div className="mb-1 text-xs font-medium text-[var(--muted)]">Period</div>
          <button type="button" aria-expanded={open} aria-haspopup="dialog" className={`flex h-11 w-full items-center gap-3 rounded-md border bg-white px-3 text-left ${problem ? 'border-[var(--danger)]' : ''}`} onClick={() => { setCalendar(null); setOpen((value) => !value) }}>
            <Calendar className="size-4 shrink-0 text-[var(--muted)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] leading-none text-[var(--muted)]">{current}</span>
              <span className={`mt-1 block truncate text-sm font-medium ${problem ? 'text-[var(--danger)]' : ''}`}>{label}</span>
            </span>
            <ChevronDown className={`size-4 shrink-0 text-[var(--muted)] ${open ? 'rotate-180' : ''}`} />
          </button>
          {open ? <PeriodMenu presets={presets} preset={preset} onChoose={choose} /> : null}
        </div>
        {preset === 'custom' ? (
          <>
            <DateField label="From" value={from} open={!open && calendar === 'from'} min={firstReportYear} max={today} onOpen={() => { setOpen(false); setCalendar((current) => current === 'from' ? null : 'from') }} onPick={pick} />
            <DateField label="To" value={to} open={!open && calendar === 'to'} min={firstReportYear} max={today} align="end" onOpen={() => { setOpen(false); setCalendar((current) => current === 'to' ? null : 'to') }} onPick={pick} />
          </>
        ) : null}
      </div>
      {problem ? <p className="mt-2 text-sm text-[var(--danger)]">{problem}</p> : null}
    </div>
  )
}

function PeriodMenu({ presets, preset, onChoose }: { presets: [Preset, string][]; preset: Preset; onChoose: (id: Preset) => void }) {
  return (
    <div className="z-30 mt-1.5 w-full rounded-lg border bg-white p-2 shadow-lg sm:absolute" role="dialog" aria-label="Choose a period">
      <ul>
        {presets.map(([id, text]) => (
          <li key={id}>
            <button type="button" aria-pressed={preset === id} className={`flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${preset === id ? 'bg-[var(--accent)] font-medium' : 'hover:bg-slate-50'}`} onClick={() => onChoose(id)}>
              {preset === id ? <Check className="size-4 shrink-0 text-[var(--primary)]" /> : <span className="size-4 shrink-0" />}
              {text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DateField({ label, value, open, min, max, align = 'start', onOpen, onPick }: { label: string; value: string; open: boolean; min: string; max: string; align?: 'start' | 'end'; onOpen: () => void; onPick: (day: string) => void }) {
  return (
    <div className="relative min-w-0">
      <label className="block text-xs font-medium text-[var(--muted)]">{label}
        <button type="button" aria-expanded={open} className={`mt-1 flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm font-normal text-[var(--foreground)] ${open ? 'border-[var(--primary)]' : ''}`} onClick={onOpen}>
          <span className="truncate">{value ? fmtDate(value) : 'Choose'}</span>
          <Calendar className="size-4 shrink-0 text-[var(--muted)]" />
        </button>
      </label>
      {open ? <MonthCalendar value={value} min={min} max={max} className={`absolute top-full z-30 mt-1 w-[calc(200%+0.75rem)] sm:w-full ${align === 'end' ? 'right-0 sm:left-0 sm:right-auto' : 'left-0'}`} onPick={onPick} /> : null}
    </div>
  )
}

function MonthCalendar({ value, min, max, className, onPick }: { value: string; min: string; max: string; className: string; onPick: (day: string) => void }) {
  const selected = parseIso(value)
  const seed = selected ?? parseIso(max) ?? new Date()
  const now = new Date()
  const [cursor, setCursor] = useState({ year: seed.getFullYear(), month: seed.getMonth() })
  const [view, setView] = useState<'days' | 'months' | 'years'>('days')
  const [pageStart, setPageStart] = useState(() => Math.max(firstYearNumber, now.getFullYear() - 11))
  const today = iso(now)
  const todayOk = (!min || today >= min) && (!max || today <= max)
  const cells = monthCells(cursor.year, cursor.month)
  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const years = Array.from({ length: 12 }, (_, index) => pageStart + index).filter((year) => year <= now.getFullYear())
  const canPrev = view === 'years' ? pageStart > firstYearNumber : view === 'months' ? cursor.year > firstYearNumber : iso(new Date(cursor.year, cursor.month, 0)) >= min
  const canNext = view === 'years' ? pageStart + 11 < now.getFullYear() : view === 'months' ? cursor.year < now.getFullYear() : iso(new Date(cursor.year, cursor.month + 1, 1)) <= max

  function step(direction: -1 | 1) {
    if (view === 'years') {
      setPageStart((start) => direction < 0 ? Math.max(firstYearNumber, start - 12) : Math.min(start + 12, now.getFullYear() - 11))
      return
    }
    if (view === 'months') {
      setCursor((current) => ({ ...current, year: current.year + direction }))
      return
    }
    setCursor((current) => {
      const next = new Date(current.year, current.month + direction, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  function showYears() {
    setPageStart(Math.max(firstYearNumber, Math.min(cursor.year, now.getFullYear()) - 11))
    setView('years')
  }

  return (
    <div className={`${className} rounded-lg border bg-white p-3 shadow-lg`} role="dialog" aria-label="Choose a date">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md border disabled:opacity-40" aria-label={view === 'years' ? 'Earlier years' : view === 'months' ? 'Previous year' : 'Previous month'} disabled={!canPrev} onClick={() => step(-1)}><ChevronLeft className="size-4" /></button>
        {view === 'years' ? <div className="text-sm font-medium">{years[0]} – {years[years.length - 1]}</div> : (
          <button type="button" className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-slate-50" onClick={showYears}>
            <span className="truncate">{view === 'months' ? cursor.year : monthTitle}</span>
            <ChevronDown className="size-3.5 shrink-0 text-[var(--muted)]" />
          </button>
        )}
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md border disabled:opacity-40" aria-label={view === 'years' ? 'Later years' : view === 'months' ? 'Next year' : 'Next month'} disabled={!canNext} onClick={() => step(1)}><ChevronRight className="size-4" /></button>
      </div>
      {view === 'years' ? (
        <div className="grid grid-cols-3 gap-1">
          {years.map((year) => {
            const selectedYear = selected?.getFullYear() === year
            return <button key={year} type="button" className={`h-10 rounded-md text-sm ${selectedYear ? 'bg-[var(--primary)] font-medium text-white' : 'hover:bg-slate-50'}`} onClick={() => { setCursor((current) => ({ ...current, year })); setView('months') }}>{year}</button>
          })}
        </div>
      ) : null}
      {view === 'months' ? (
        <div className="grid grid-cols-3 gap-1">
          {monthNames.map((name, month) => {
            const allowed = cursor.year < now.getFullYear() || month <= now.getMonth()
            const selectedMonth = selected?.getFullYear() === cursor.year && selected.getMonth() === month
            return <button key={name} type="button" disabled={!allowed} className={`h-10 rounded-md text-sm disabled:opacity-40 ${selectedMonth ? 'bg-[var(--primary)] font-medium text-white' : allowed ? 'hover:bg-slate-50' : ''}`} onClick={() => { setCursor({ year: cursor.year, month }); setView('days') }}>{name}</button>
          })}
        </div>
      ) : null}
      {view === 'days' ? (
        <>
          <div className="grid grid-cols-7 text-center text-[11px] text-[var(--muted)]">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => <div key={day} className="py-1">{day}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((day, index) => {
              const allowed = !!day && (!min || day >= min) && (!max || day <= max)
              return <button key={day ?? `empty-${index}`} type="button" disabled={!allowed} className={`mx-auto grid aspect-square w-full max-w-9 place-items-center rounded-md text-sm ${day === value ? 'bg-[var(--primary)] font-medium text-white' : allowed ? 'hover:bg-slate-50' : 'text-[var(--muted)] opacity-40'}`} onClick={() => { if (day && allowed) onPick(day) }}>{day ? Number(day.slice(8)) : ''}</button>
            })}
          </div>
        </>
      ) : null}
      <button type="button" className="mt-2 h-9 w-full rounded-md text-sm font-medium text-[var(--primary)] disabled:opacity-40" disabled={!todayOk} onClick={() => onPick(today)}>Today</button>
    </div>
  )
}

const firstReportYear = '2000-01-01'
const firstYearNumber = 2000
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthCells(year: number, month: number) {
  const startPad = (new Date(year, month, 1).getDay() + 6) % 7
  const count = new Date(year, month + 1, 0).getDate()
  const cells: Array<string | null> = Array.from({ length: startPad }, () => null)
  for (let day = 1; day <= count; day += 1) cells.push(iso(new Date(year, month, day)))
  while (cells.length % 7) cells.push(null)
  return cells
}

function resolvePeriod(params: URLSearchParams, now = new Date()): { preset: Preset; from: string; to: string } {
  const known = ranges(now)
  const preset = params.get('preset')
  if (preset === 'today' || preset === 'week' || preset === 'month') return { preset, ...known[preset] }
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (from || to) return { preset: 'custom' as const, from, to }
  return { preset: 'month' as const, ...known.month }
}

function ranges(now = new Date()) {
  const today = iso(now)
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const weekEnd = iso(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))
  const monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  return {
    today: { from: today, to: today },
    week: { from: iso(weekStart), to: earlierDate(weekEnd, today) },
    month: { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: earlierDate(monthEnd, today) },
  }
}

function rangeProblem(from: string, to: string) {
  const start = parseIso(from)
  const end = parseIso(to)
  if (!start || !end) return 'Choose both dates.'
  if (start > end) return 'The start date has to be on or before the end date.'
  const today = parseIso(iso(new Date()))
  if (today && (start > today || end > today)) return 'Dates have to be today or earlier.'
  const days = Math.round((end.getTime() - start.getTime()) / 86400000)
  if (days > 366) return 'Choose a period of one year or less.'
  return ''
}

function earlierDate(left: string, right: string) {
  if (!left) return right
  if (!right) return left
  return left < right ? left : right
}

function shiftYears(value: string, years: number) {
  const date = parseIso(value)
  if (!date) return ''
  const month = date.getMonth()
  date.setFullYear(date.getFullYear() + years)
  if (date.getMonth() !== month) date.setDate(0)
  return iso(date)
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null
  return date
}

function includes(needle: string, ...parts: Array<string | number | string[]>) {
  if (!needle) return true
  return parts.flat().join(' ').toLowerCase().includes(needle)
}

function trim(value: number) {
  return value.toString().replace(/\.0+$/, '')
}
