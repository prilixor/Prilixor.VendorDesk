import { ClipboardList, IndianRupee, Lock, Package, PlusCircle, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type InventoryRow, type RentalListItem, type Vendor } from './api'
import { fmtDate, inr } from './money'
import { PageHeader, ShopLogo } from './Shell'
import { CategoryPicker, Pager, pageRows, StatusBadge } from './ui'

export function DashboardPage({ vendor }: { vendor: Vendor }) {
  const [rentals, setRentals] = useState<RentalListItem[]>([])
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [productPage, setProductPage] = useState(0)
  const [rentalPage, setRentalPage] = useState(0)
  useEffect(() => {
    void api<RentalListItem[]>('/api/rentals').then(setRentals)
    void api<InventoryRow[]>('/api/inventory').then(setRows)
  }, [])
  const active = rentals.filter((rental) => rental.status !== 'Returned')
  const revenue = rentals.reduce((sum, rental) => sum + rental.taxable, 0)
  const unitsOut = active.reduce((sum, rental) => sum + rental.units, 0)
  const name = (vendor.ownerName || vendor.businessName).split(' ')[0]
  const categories = useMemo(() => ['All', ...new Set(rows.map((row) => row.categoryName))], [rows])
  const categoryCounts = useMemo(() => {
    const tally: Record<string, number> = { All: rows.length }
    for (const row of rows) tally[row.categoryName] = (tally[row.categoryName] ?? 0) + 1
    return tally
  }, [rows])
  const visible = rows.filter((row) => {
    const haystack = `${row.productName} ${row.categoryName}`.toLowerCase()
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false
    return category === 'All' || row.categoryName === category
  })
  const paged = pageRows(visible, productPage, pageSize)
  const recent = pageRows(rentals, rentalPage, pageSize)
  const stats = [
    { label: 'Active rentals', value: String(active.length), icon: ClipboardList },
    { label: 'Due for return', value: String(rentals.filter((rental) => rental.status === 'Due soon').length), icon: Package },
    { label: 'Units out', value: String(unitsOut), icon: Package },
    { label: 'Rental revenue', value: inr(revenue), icon: IndianRupee },
  ]
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader mark={vendor.logo ? <ShopLogo logo={vendor.logo} name={vendor.businessName} className="size-12 rounded-md border" /> : undefined} title={`${greeting()}, ${name}`} subtitle={vendor.businessName} action={<Link className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white" to="/rentals/new"><PlusCircle className="size-4" /> New Rental</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">{stat.label} <stat.icon className="size-4" /></div>
            <div className="mt-2 truncate font-mono text-xl sm:text-2xl">{stat.value}</div>
          </div>
        ))}
      </div>
      <section className="mt-8 rounded-lg border bg-white">
        <div className="border-b px-4 py-3 font-medium">Recent rentals</div>
        <div className="divide-y">
          {recent.rows.map((rental) => (
            <Link key={rental.id} to={`/rentals/${rental.id}`} className="grid gap-1 px-4 py-3 text-sm hover:bg-slate-50 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_140px_auto] sm:items-center">
              <span className="flex items-center justify-between gap-2 sm:block"><span className="font-mono text-xs text-[var(--muted)]">{rental.number}</span><span className="sm:hidden"><StatusBadge status={rental.status} /></span></span>
              <span className="font-medium">{rental.customerName}</span>
              <span className="truncate text-[var(--muted)]">{rental.itemNames.join(', ')}</span>
              <span className="text-xs text-[var(--muted)] sm:text-sm">Return {fmtDate(rental.returnOn)}</span>
              <span className="hidden text-right sm:block"><StatusBadge status={rental.status} /></span>
            </Link>
          ))}
          {!rentals.length ? <p className="px-4 py-6 text-sm text-[var(--muted)]">No rentals yet. Confirm one from New Rental.</p> : null}
          {recent.pages > 1 ? <div className="px-4 pb-3"><Pager current={recent.current} pages={recent.pages} total={recent.total} size={pageSize} onChange={setRentalPage} /></div> : null}
        </div>
      </section>
      <section className="mt-8 rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <span className="font-medium">My products & pricing</span>
          <span className="flex items-center gap-1 text-xs text-[var(--muted)]"><Lock className="size-3" /> Product names come from the platform catalog</span>
        </div>
        <div className="relative border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <input className="h-10 w-full rounded-md border py-2 pl-9 pr-3" type="search" aria-label="Search products" placeholder="Search by product or category" value={search} onChange={(event) => { setSearch(event.target.value); setProductPage(0) }} />
          </div>
          <CategoryPicker className="mt-3" categories={categories} counts={categoryCounts} value={category} onChange={(name) => { setCategory(name); setProductPage(0) }} />
        </div>
        {!visible.length ? <p className="px-4 py-6 text-sm text-[var(--muted)]">No products match. <button className="font-medium text-[var(--primary)]" type="button" onClick={() => { setSearch(''); setCategory('All'); setProductPage(0) }}>Show every product</button></p> : (
          <>
            <ul className="divide-y md:hidden">
              {paged.rows.map((row) => (
                <li key={row.productId} className="px-4 py-3">
                  <div className="font-medium">{row.productName}</div>
                  <div className="text-xs text-[var(--muted)]">{row.categoryName}</div>
                  {row.isStocked && row.isActive ? (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div><dt className="text-xs text-[var(--muted)]">Price/day</dt><dd className="font-mono">{inr(row.pricePerDay)}</dd></div>
                      <div><dt className="text-xs text-[var(--muted)]">Available</dt><dd className="font-mono">{row.quantity}</dd></div>
                      <div><dt className="text-xs text-[var(--muted)]">Durations</dt><dd>7d · 15d · 30d</dd></div>
                      <div><dt className="text-xs text-[var(--muted)]">Deposit</dt><dd className="font-mono">{row.deposit ? inr(row.deposit) : '—'}</dd></div>
                    </dl>
                  ) : <p className="mt-2 text-sm text-[var(--muted)]">Not offered yet · <Link className="text-[var(--primary)]" to="/inventory">Set price & quantity</Link></p>}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Price/day</th><th className="px-4 py-2">Available</th><th className="px-4 py-2">Durations</th><th className="px-4 py-2">Deposit</th></tr></thead>
                <tbody className="divide-y">
                  {paged.rows.map((row) => (
                    <tr key={row.productId}>
                      <td className="px-4 py-2"><div className="font-medium">{row.productName}</div><div className="text-xs text-[var(--muted)]">{row.categoryName}</div></td>
                      {row.isStocked && row.isActive ? (
                        <>
                          <td className="px-4 py-2 font-mono">{inr(row.pricePerDay)}</td>
                          <td className="px-4 py-2 font-mono">{row.quantity}</td>
                          <td className="px-4 py-2">7d · 15d · 30d</td>
                          <td className="px-4 py-2 font-mono">{row.deposit ? inr(row.deposit) : '—'}</td>
                        </>
                      ) : <td colSpan={4} className="px-4 py-2 text-[var(--muted)]">Not offered yet · <Link className="text-[var(--primary)]" to="/inventory">Set price & quantity</Link></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paged.pages > 1 ? <div className="px-4 pb-3"><Pager current={paged.current} pages={paged.pages} total={paged.total} size={pageSize} onChange={setProductPage} /></div> : <p className="px-4 py-3 text-xs text-[var(--muted)]">{visible.length === rows.length ? `${rows.length} products` : `${visible.length} of ${rows.length} products`}</p>}
          </>
        )}
      </section>
    </div>
  )
}

const pageSize = 8

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
