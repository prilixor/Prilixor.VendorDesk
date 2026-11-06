import { Check, Minus, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, type InventoryRow } from './api'
import { inr } from './money'
import { PageHeader } from './Shell'
import { CategoryPicker, Pager, pageRows } from './ui'

type Draft = { price: string; quantity: string; deposit: string; active: boolean }
type Status = 'offered' | 'out' | 'paused' | 'setup'
type Filter = 'all' | Status

const filters: { id: Status; label: string; hint: string }[] = [
  { id: 'offered', label: 'Offered', hint: 'Shown on New Rental' },
  { id: 'out', label: 'Out of stock', hint: 'Price is set, quantity is zero' },
  { id: 'paused', label: 'Paused', hint: 'Hidden until you offer them again' },
  { id: 'setup', label: 'Not set up', hint: 'Still need a price and quantity' },
]

export function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [filter, setFilter] = useState<Filter>('all')
  const [productPage, setProductPage] = useState(0)
  const listTop = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    void api<InventoryRow[]>('/api/inventory')
      .then((items) => {
        setRows(items)
        setDrafts(Object.fromEntries(items.map((row) => [row.productId, draftFrom(row)])))
      })
      .catch((caught) => setLoadError(caught instanceof ApiError ? caught.message : 'Inventory could not be loaded.'))
      .finally(() => setLoading(false))
  }, [])

  const dirtyCount = rows.filter((row) => drafts[row.productId] && !sameDraft(row, drafts[row.productId])).length
  useEffect(() => {
    if (!dirtyCount) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyCount])

  const categories = useMemo(() => ['All', ...new Set(rows.map((row) => row.categoryName))], [rows])
  const categoryCounts = useMemo(() => {
    const tally: Record<string, number> = { All: rows.length }
    for (const row of rows) tally[row.categoryName] = (tally[row.categoryName] ?? 0) + 1
    return tally
  }, [rows])
  const counts = useMemo(() => {
    const tally = { offered: 0, out: 0, paused: 0, setup: 0, units: 0 }
    for (const row of rows) {
      tally[statusOf(row)] += 1
      if (row.isStocked) tally.units += row.quantity
    }
    return tally
  }, [rows])

  const visible = rows.filter((row) => {
    const haystack = `${row.productName} ${row.categoryName}`.toLowerCase()
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false
    if (category !== 'All' && row.categoryName !== category) return false
    if (filter !== 'all' && statusOf(row) !== filter) return false
    return true
  })
  const paged = pageRows(visible, productPage, pageSize)

  function showPage(page: number) {
    setProductPage(page)
    listTop.current?.scrollIntoView({ block: 'start' })
  }

  function update(productId: string, next: Draft) {
    setDrafts((current) => ({ ...current, [productId]: next }))
    setSavedId((current) => current === productId ? null : current)
    setErrors((current) => ({ ...current, [productId]: '' }))
  }

  async function save(row: InventoryRow) {
    const draft = drafts[row.productId]
    const problem = blocker(draft)
    if (!draft || problem || busyId) {
      if (problem) setErrors((current) => ({ ...current, [row.productId]: problem }))
      return
    }
    setBusyId(row.productId)
    setErrors((current) => ({ ...current, [row.productId]: '' }))
    try {
      const saved = await api<InventoryRow>('/api/inventory', {
        method: 'PUT',
        body: JSON.stringify({
          productId: row.productId,
          pricePerDay: Number(draft.price),
          quantity: Number(draft.quantity),
          deposit: draft.deposit.trim() === '' ? 0 : Number(draft.deposit),
          isActive: draft.active,
        }),
      })
      setRows((current) => current.map((item) => item.productId === saved.productId ? saved : item))
      setDrafts((current) => ({ ...current, [saved.productId]: draftFrom(saved) }))
      setSavedId(saved.productId)
    } catch (caught) {
      setErrors((current) => ({ ...current, [row.productId]: caught instanceof ApiError ? caught.message : 'This product could not be saved.' }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-w-0 w-full">
      <PageHeader title="Inventory" subtitle="Set the daily rent, how many you have in the shop, and the refundable deposit. Offered products appear when you create a rental." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {filters.map((item) => (
          <button key={item.id} type="button" onClick={() => { setFilter((current) => current === item.id ? 'all' : item.id); setProductPage(0) }} className={`rounded-lg border bg-white p-4 text-left hover:border-[var(--primary)] ${filter === item.id ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : ''}`}>
            <div className="text-xs text-[var(--muted)]">{item.label}</div>
            <div className="mt-1 font-mono text-2xl">{loading ? '—' : counts[item.id]}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{item.id === 'offered' && !loading ? `${counts.units} units · on New Rental` : item.hint}</div>
          </button>
        ))}
      </div>

      <div className="relative mt-4 rounded-lg border bg-white p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
          <input className="h-10 w-full rounded-md border border-[var(--border)] py-2 pl-9 pr-3" type="search" aria-label="Search products" placeholder="Search by product or category" value={search} onChange={(event) => { setSearch(event.target.value); setProductPage(0) }} />
        </div>
        <CategoryPicker categories={categories} counts={categoryCounts} value={category} onChange={(name) => { setCategory(name); setProductPage(0) }} />
      </div>

      {dirtyCount > 0 ? <p className="mt-3 text-sm text-[var(--primary)]">{dirtyCount === 1 ? '1 product has unsaved changes.' : `${dirtyCount} products have unsaved changes.`}</p> : null}
      {loadError ? <p className="mt-3 text-sm text-[var(--danger)]">{loadError}</p> : null}

      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg border bg-white" />)}
        </div>
      ) : (
        <div ref={listTop} className="mt-4 scroll-mt-4 space-y-3">
          <p className="text-sm text-[var(--muted)]">{visible.length === rows.length ? `${rows.length} products` : `${visible.length} of ${rows.length} products`}{paged.pages > 1 ? ` · ${pageSize} per page` : ''}</p>
          {paged.rows.map((row, index) => {
            const draft = drafts[row.productId]
            if (!draft) return null
            const showCategory = index === 0 || paged.rows[index - 1].categoryName !== row.categoryName
            return (
              <div key={row.productId}>
                {showCategory ? <h2 className={`${index === 0 ? 'mb-2' : 'mb-2 mt-6'} text-sm font-medium text-[var(--muted)]`}>{row.categoryName}</h2> : null}
                <ProductCard
                  row={row}
                  draft={draft}
                  saving={busyId === row.productId}
                  justSaved={savedId === row.productId}
                  error={errors[row.productId] ?? ''}
                  onChange={(next) => update(row.productId, next)}
                  onSave={() => void save(row)}
                />
              </div>
            )
          })}
          {!visible.length ? (
            <div className="rounded-lg border bg-white px-4 py-10 text-center">
              <p className="text-sm text-[var(--muted)]">{emptyCopy(search, category, filter)}</p>
              <button className="mt-3 text-sm font-medium text-[var(--primary)]" type="button" onClick={() => { setSearch(''); setCategory('All'); setFilter('all'); setProductPage(0) }}>Show every product</button>
            </div>
          ) : paged.pages > 1 ? <Pager current={paged.current} pages={paged.pages} total={paged.total} size={pageSize} onChange={showPage} /> : null}
        </div>
      )}
    </div>
  )
}

function ProductCard({ row, draft, saving, justSaved, error, onChange, onSave }: { row: InventoryRow; draft: Draft; saving: boolean; justSaved: boolean; error: string; onChange: (draft: Draft) => void; onSave: () => void }) {
  const dirty = !sameDraft(row, draft)
  const problem = blocker(draft)
  const status = statusOf(row)
  const fields = fieldIssues(draft)
  const quantity = Number(draft.quantity || '0')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (dirty) onSave()
  }

  return (
    <form onSubmit={submit} className={`rounded-lg border bg-white p-4 ${dirty ? 'ring-2 ring-[var(--primary)]/25' : ''} ${accent(status)}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_220px] lg:items-center">
        <div>
          <h3 className="font-medium leading-snug">{row.productName}</h3>
          <div className="mt-1.5"><StatusPill status={dirty ? 'unsaved' : status} /></div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">{row.isStocked ? summary(row) : 'Add a daily price and quantity, then save.'}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price / day" error={dirty ? fields.price : ''}>
            <span className="flex h-10 items-center rounded-md border border-[var(--border)] px-3 focus-within:border-[var(--primary)]">
              <span className="text-sm text-[var(--muted)]">₹</span>
              <input className="w-full bg-transparent px-2 font-mono outline-none placeholder:text-slate-300" inputMode="decimal" autoComplete="off" aria-label={`Price per day for ${row.productName}`} placeholder="" value={draft.price} onChange={(event) => onChange({ ...draft, price: moneyText(event.target.value) })} />
            </span>
          </Field>
          <Field label="In shop" error={dirty ? fields.quantity : ''}>
            <span className="flex h-10 items-center rounded-md border border-[var(--border)] focus-within:border-[var(--primary)]">
              <button className="grid h-full w-9 place-items-center text-[var(--muted)] disabled:opacity-30" type="button" aria-label={`Decrease quantity for ${row.productName}`} disabled={quantity <= 0} onClick={() => onChange({ ...draft, quantity: String(Math.max(0, quantity - 1)) })}><Minus className="size-4" /></button>
              <input className="w-full bg-transparent text-center font-mono outline-none placeholder:text-slate-300" inputMode="numeric" autoComplete="off" aria-label={`Quantity for ${row.productName}`} placeholder="" value={draft.quantity} onChange={(event) => onChange({ ...draft, quantity: event.target.value.replace(/\D/g, '').slice(0, 5) })} />
              <button className="grid h-full w-9 place-items-center text-[var(--muted)] disabled:opacity-30" type="button" aria-label={`Increase quantity for ${row.productName}`} disabled={quantity >= 10000} onClick={() => onChange({ ...draft, quantity: String(Math.min(10000, quantity + 1)) })}><Plus className="size-4" /></button>
            </span>
          </Field>
          <Field label="Deposit · refundable" error={dirty ? fields.deposit : ''}>
            <span className="flex h-10 items-center rounded-md border border-[var(--border)] px-3 focus-within:border-[var(--primary)]">
              <span className="text-sm text-[var(--muted)]">₹</span>
              <input className="w-full bg-transparent px-2 font-mono outline-none placeholder:text-slate-300" inputMode="decimal" autoComplete="off" aria-label={`Deposit for ${row.productName}`} placeholder="" value={draft.deposit} onChange={(event) => onChange({ ...draft, deposit: moneyText(event.target.value) })} />
            </span>
          </Field>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch">
          <button type="button" role="switch" aria-checked={draft.active} aria-label={`Offer ${row.productName} on New Rental`} onClick={() => onChange({ ...draft, active: !draft.active })} className="flex items-center gap-3 text-left">
            <span className={`relative h-6 w-11 shrink-0 rounded-full ${draft.active ? 'bg-[var(--primary)]' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${draft.active ? 'translate-x-5' : ''}`} />
            </span>
            <span>
              <span className="block text-sm font-medium">{draft.active ? (ready(draft) ? 'Offered' : 'Offer after save') : 'Paused'}</span>
              <span className="block text-xs font-normal text-[var(--muted)]">{offerHint(draft)}</span>
            </span>
          </button>
          {dirty ? (
            <button className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-40" type="submit" disabled={saving || !!problem}>{saving ? 'Saving…' : 'Save changes'}</button>
          ) : justSaved ? (
            <span className="inline-flex h-10 items-center gap-1 text-sm font-medium text-[var(--success)] lg:justify-end"><Check className="size-4" /> Saved</span>
          ) : null}
        </div>
      </div>
      {dirty && problem ? <p className="mt-3 text-xs text-[var(--danger)]">{error || problem}</p> : null}
      {!dirty && error ? <p className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
    </form>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-[var(--muted)]">
      {label}
      {children}
      {error ? <span className="font-normal text-[var(--danger)]">{error}</span> : null}
    </label>
  )
}

function StatusPill({ status }: { status: Status | 'unsaved' }) {
  const label = status === 'offered' ? 'Offered' : status === 'out' ? 'Out of stock' : status === 'paused' ? 'Paused' : status === 'setup' ? 'Not set up' : 'Unsaved'
  const tone = status === 'offered' ? 'bg-[var(--success)]/15 text-[var(--success)]' : status === 'out' ? 'bg-[var(--warning)]/30' : status === 'unsaved' ? 'bg-[var(--accent)] text-[var(--primary)]' : 'bg-slate-100 text-[var(--muted)]'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

const pageSize = 8

function draftFrom(row: InventoryRow): Draft {
  if (!row.isStocked) return { price: '', quantity: '', deposit: '', active: true }
  return { price: moneyFrom(row.pricePerDay), quantity: String(row.quantity), deposit: row.deposit ? moneyFrom(row.deposit) : '', active: row.isActive }
}

function moneyFrom(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function moneyText(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [whole, fraction] = cleaned.split('.')
  return fraction === undefined ? whole : `${whole}.${fraction.slice(0, 2)}`
}

function sameDraft(row: InventoryRow, draft: Draft) {
  const saved = draftFrom(row)
  return saved.price === draft.price && saved.quantity === draft.quantity && saved.deposit === draft.deposit && saved.active === draft.active
}

function statusOf(row: InventoryRow): Status {
  if (!row.isStocked) return 'setup'
  if (!row.isActive) return 'paused'
  if (row.quantity <= 0) return 'out'
  return 'offered'
}

function accent(status: Status) {
  if (status === 'offered') return 'border-l-4 border-l-[var(--success)]'
  if (status === 'out') return 'border-l-4 border-l-[var(--warning)]'
  if (status === 'paused') return 'border-l-4 border-l-slate-300'
  return 'border-l-4 border-l-slate-300 bg-[var(--secondary)]/40'
}

function summary(row: InventoryRow) {
  return `${inr(row.pricePerDay)} / day · ${row.quantity} in shop · deposit ${row.deposit ? inr(row.deposit) : 'none'}`
}

function emptyCopy(search: string, category: string, filter: Filter) {
  if (search.trim()) return `No products match “${search.trim()}”.`
  if (filter === 'offered') return 'Nothing is offered on New Rental yet.'
  if (filter === 'out') return 'Nothing is out of stock.'
  if (filter === 'paused') return 'Nothing is paused.'
  if (filter === 'setup') return 'Every catalog product already has a price and quantity.'
  if (category !== 'All') return `No products in ${category}.`
  return 'No products in the catalog yet.'
}

function ready(draft: Draft) {
  return draft.price.trim() !== '' && draft.quantity.trim() !== ''
}

function offerHint(draft: Draft) {
  if (!ready(draft)) return 'Add a price and quantity'
  if (!draft.active) return 'Hidden from New Rental'
  if ((Number(draft.quantity) || 0) <= 0) return 'Listed as out of stock'
  return 'Shows on New Rental'
}

function fieldIssues(draft: Draft) {
  const price = Number(draft.price)
  const quantity = Number(draft.quantity)
  const deposit = Number(draft.deposit)
  return {
    price: draft.price.trim() !== '' && (!Number.isFinite(price) || price < 0) ? 'Enter a valid price.' : '',
    quantity: draft.quantity.trim() !== '' && (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) ? 'Use a whole number up to 10,000.' : '',
    deposit: draft.deposit.trim() !== '' && (!Number.isFinite(deposit) || deposit < 0) ? 'Enter a valid deposit.' : '',
  }
}

function blocker(draft: Draft) {
  const fields = fieldIssues(draft)
  if (fields.price || fields.quantity || fields.deposit) return fields.price || fields.quantity || fields.deposit
  if (draft.price.trim() === '' || draft.quantity.trim() === '') return 'Enter the daily price and how many you have.'
  if (draft.active && Number(draft.price) <= 0) return 'Set a daily price above zero, or pause this product.'
  return ''
}
