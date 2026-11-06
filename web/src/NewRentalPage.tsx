import { Check, Info, Minus, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type Customer, type InventoryRow, type RentalDetail, type Vendor } from './api'
import { endDate, fmtDate, inr, lineCharge, today, totals, validCharges, validDuration, type ChargeInput } from './money'
import { PageHeader } from './Shell'
import { CategoryPicker, ChargesEditor, MicField, Pager, pageRows, PrimaryButton, ProductPhoto, TotalsCard } from './ui'

const steps = [
  { label: 'Customer', hint: 'Who is renting' },
  { label: 'Products', hint: 'What goes out' },
  { label: 'Review', hint: 'Confirm and save' },
]

function RentalSteps({ step, onSelect }: { step: number; onSelect: (index: number) => void }) {
  return (
    <div className="mb-6 overflow-hidden rounded-lg border bg-white">
      <ol aria-label="Rental steps" className="grid grid-cols-3">
        {steps.map((item, index) => {
          const done = index < step
          const active = index === step
          const tone = done ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : active ? 'border-[var(--primary)] bg-white text-[var(--primary)]' : 'border-[var(--border)] bg-white text-[var(--muted)]'
          const note = done ? 'Completed' : active ? 'In progress' : item.hint
          return (
            <li key={item.label} className={index > 0 ? 'border-l' : ''}>
              <button className={`flex w-full min-w-0 cursor-pointer flex-col items-center gap-1.5 border-0 px-2 py-3 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)] disabled:cursor-default disabled:opacity-100 sm:flex-row sm:justify-center sm:gap-3 sm:px-4 sm:py-4 sm:text-left ${active ? 'bg-[var(--accent)]' : 'bg-white'} ${done ? 'hover:bg-[var(--secondary)]' : ''}`} type="button" disabled={index > step} aria-current={active ? 'step' : undefined} onClick={() => onSelect(index)}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${tone}`}>{done ? <Check className="size-4" strokeWidth={2.5} /> : index + 1}</span>
                <span className="min-w-0">
                  <span className={`block truncate text-xs sm:text-sm ${active || done ? 'font-semibold' : 'font-medium text-[var(--muted)]'}`}>{item.label}</span>
                  <span className={`mt-0.5 hidden truncate text-[11px] leading-tight sm:block ${active ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>{note}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="h-0.5 bg-[var(--secondary)]" aria-hidden>
        <div className="h-full bg-[var(--primary)] transition-[width] duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>
    </div>
  )
}
const durations = [7, 15, 30]
type Draft = { productId: string; name: string; category: string; available: number; quantity: number; days: number; startDate: string; pricePerDay: number; depositPerUnit: number; photo?: string }
const blank = { name: '', mobile: '', email: '', address: '', refName: '', refMobile: '', refRelation: '' }

function lookupCustomers(customers: Customer[], query: string, field: 'name' | 'mobile' | null) {
  if (!field) return []
  const text = query.trim().toLowerCase()
  const digits = text.replace(/\D/g, '')
  if (field === 'name' && text.length < 2) return []
  if (field === 'mobile' && digits.length < 3) return []
  return customers.filter((item) => field === 'mobile' ? item.mobile.includes(digits) : item.name.toLowerCase().includes(text) || (digits.length >= 3 && item.mobile.includes(digits))).slice(0, 6)
}

function CustomerMatches({ items, onPick }: { items: Customer[]; onPick: (item: Customer) => void }) {
  return (
    <ul className="grid max-h-48 gap-1.5 overflow-auto" role="listbox" aria-label="Saved customers">
      {items.map((item) => (
        <li key={item.id}>
          <button className="w-full rounded-md border bg-white px-3 py-2 text-left hover:border-[var(--primary)] hover:bg-[var(--accent)]" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(item)}>
            <span className="block truncate text-sm font-semibold">{item.name}</span>
            <span className="mt-0.5 block text-sm leading-snug"><span className="font-mono">{item.mobile}</span>{item.address ? <span> · {item.address}</span> : null}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function NewRentalPage({ vendor }: { vendor: Vendor }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stock, setStock] = useState<InventoryRow[]>([])
  const [linkedId, setLinkedId] = useState('')
  const [suggest, setSuggest] = useState<'name' | 'mobile' | null>(null)
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [items, setItems] = useState<Draft[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [productPage, setProductPage] = useState(0)
  const suggestBox = useRef<HTMLDivElement>(null)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [charges, setCharges] = useState<ChargeInput>({ discountType: 'percent', discountValue: vendor.discountPercent, taxPercent: vendor.taxPercent, additionalFees: 0 })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api<Customer[]>('/api/customers').then(setCustomers)
    void api<InventoryRow[]>('/api/inventory').then(setStock)
  }, [])

  useEffect(() => {
    if (!suggest) return
    const close = (event: MouseEvent) => { if (!suggestBox.current?.contains(event.target as Node)) setSuggest(null) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSuggest(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [suggest])

  const offered = stock.filter((row) => row.isStocked && row.isActive)
  const customer = { id: linkedId || 'new', ...form }
  const linked = customers.find((item) => item.id === linkedId) ?? null
  const suggestions = lookupCustomers(customers, suggest === 'mobile' ? form.mobile : form.name, suggest)
  const categories = ['All', ...Array.from(new Set(offered.map((row) => row.categoryName)))]
  const categoryCounts: Record<string, number> = { All: offered.length }
  for (const row of offered) categoryCounts[row.categoryName] = (categoryCounts[row.categoryName] ?? 0) + 1
  const catalog = offered.filter((row) => (!availableOnly || row.quantity > 0) && (category === 'All' || row.categoryName === category) && `${row.productName} ${row.categoryName}`.toLowerCase().includes(productSearch.trim().toLowerCase()))
  const productResults = pageRows(catalog, productPage, 9)
  const summary = totals(items.map((item) => ({ quantity: item.quantity, days: item.days, pricePerDay: item.pricePerDay, depositPerUnit: item.depositPerUnit })), charges)

  function validateCustomer() {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) next.mobile = 'Enter a valid 10-digit mobile'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email'
    if (!form.address.trim()) next.address = 'Address is required'
    if (!form.refName.trim()) next.refName = 'Reference name is required'
    if (!/^[6-9]\d{9}$/.test(form.refMobile.trim())) next.refMobile = 'Enter a valid 10-digit mobile'
    if (!form.refRelation.trim()) next.refRelation = 'Relation is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function fillCustomer(item: Customer) {
    setForm({ name: item.name, mobile: item.mobile, email: item.email, address: item.address, refName: item.refName, refMobile: item.refMobile, refRelation: item.refRelation })
    setLinkedId(item.id)
    setSuggest(null)
    setErrors({})
  }

  function clearCustomer() {
    setForm(blank)
    setLinkedId('')
    setSuggest(null)
    setErrors({})
  }

  function addProduct(row: InventoryRow) {
    if (row.quantity <= 0 || items.some((item) => item.productId === row.productId)) return
    setItems((current) => [...current, { productId: row.productId, name: row.productName, category: row.categoryName, available: row.quantity, quantity: 1, days: durations[0], startDate: today(), pricePerDay: row.pricePerDay, depositPerUnit: row.deposit }])
    setErrors({})
  }

  function update(index: number, patch: Partial<Draft>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
    setErrors({})
  }

  function next() {
    if (step === 0 && !validateCustomer()) return
    if (step === 1) {
      if (!items.length) return setErrors({ items: 'Add at least one product' })
      if (items.some((item) => !(item.pricePerDay > 0))) return setErrors({ items: 'Enter a price per day for every item' })
      if (items.some((item) => !item.startDate)) return setErrors({ items: 'Pick a start date for every item' })
      if (items.some((item) => !validDuration(item.days))) return setErrors({ items: 'Enter a whole number of days greater than zero' })
      if (items.some((item) => !Number.isFinite(item.depositPerUnit) || item.depositPerUnit < 0)) return setErrors({ items: 'Deposit must be zero or greater' })
      if (!validCharges(charges)) return setErrors({ charges: 'Enter non-negative charges. GST and a percentage discount must be 0–100%.' })
    }
    setErrors({})
    setStep((current) => current + 1)
    window.scrollTo({ top: 0 })
  }

  async function confirm() {
    if (!customer || !validCharges(charges)) return
    setBusy(true)
    setErrors({})
    try {
      const saved = await api<RentalDetail>('/api/rentals', {
        method: 'POST',
        body: JSON.stringify({
          customerId: linkedId || null,
          customer: form,
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, days: item.days, startDate: item.startDate, pricePerDay: item.pricePerDay, depositPerUnit: item.depositPerUnit, photo: item.photo ?? null })),
          charges,
        }),
      })
      navigate(`/rentals/${saved.id}`)
    } catch (caught) {
      setErrors({ confirm: caught instanceof ApiError ? caught.message : 'The rental could not be saved.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="New Rental" subtitle="A walk-in rental for a customer at the counter." />
      <RentalSteps step={step} onSelect={(index) => { if (index < step) { setErrors({}); setStep(index); window.scrollTo({ top: 0 }) } }} />

      {step === 0 ? (
        <section className="rounded-lg border bg-white p-4 md:p-6">
          <div className="space-y-6" ref={suggestBox}>
            <p className="flex items-start gap-2 rounded-md bg-[var(--secondary)] px-3 py-2 text-xs"><Info className="mt-0.5 size-4 shrink-0" /> Type a name or mobile. If this person is already saved, choose them and the address and reference fill in. For the mic, tap it, speak, then pause or tap it again. The words are filled in after that.</p>
            {linked ? (
              <div className="flex items-start justify-between gap-3 rounded-md border-l-2 border-[var(--primary)] bg-[var(--accent)] px-3 py-2 text-sm">
                <span className="min-w-0"><Check className="mr-2 inline size-4 text-[var(--primary)]" /><strong>{linked.name}</strong> · {linked.mobile}{linked.address ? <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted)]">{linked.address}</span> : null}</span>
                <button className="shrink-0 text-[var(--primary)]" type="button" onClick={clearCustomer}>Clear</button>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <MicField id="name" label="Customer name" value={form.name} onChange={(name) => { setForm({ ...form, name }); setSuggest('name') }} onFocus={() => setSuggest('name')} error={errors.name} />
                {suggest === 'name' && suggestions.length ? <div className="mt-2 sm:hidden"><CustomerMatches items={suggestions} onPick={fillCustomer} /></div> : null}
              </div>
              <div>
                <MicField id="mobile" label="Mobile" kind="phone" value={form.mobile} onChange={(mobile) => { setForm({ ...form, mobile }); setSuggest('mobile') }} onFocus={() => setSuggest('mobile')} error={errors.mobile} />
                {suggest === 'mobile' && suggestions.length ? <div className="mt-2 sm:hidden"><CustomerMatches items={suggestions} onPick={fillCustomer} /></div> : null}
              </div>
              {suggest && suggestions.length ? <div className="hidden sm:col-span-2 sm:block"><CustomerMatches items={suggestions} onPick={fillCustomer} /></div> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MicField id="email" label="Email" kind="email" optional value={form.email} onChange={(email) => setForm({ ...form, email })} error={errors.email} />
              <MicField id="address" label="Address" multiline value={form.address} onChange={(address) => setForm({ ...form, address })} error={errors.address} />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Reference person</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <MicField id="refName" label="Name" value={form.refName} onChange={(refName) => setForm({ ...form, refName })} error={errors.refName} />
                <MicField id="refMobile" label="Mobile" kind="phone" value={form.refMobile} onChange={(refMobile) => setForm({ ...form, refMobile })} error={errors.refMobile} />
                <MicField id="refRelation" label="Relation" value={form.refRelation} onChange={(refRelation) => setForm({ ...form, refRelation })} error={errors.refRelation} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between text-sm font-medium"><span>Add from your stock</span>{items.length > 0 ? <span className="text-xs text-[var(--primary)]">{items.length} selected</span> : null}</div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
              <input className="w-full rounded-md border py-2 pl-9 pr-3" aria-label="Search products" placeholder="Search products…" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductPage(0) }} />
            </div>
            <CategoryPicker className="mb-3" categories={categories} counts={categoryCounts} value={category} onChange={(name) => { setCategory(name); setProductPage(0) }} />
            <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]"><span>{catalog.length} products</span><label className="flex items-center gap-2"><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setProductPage(0) }} /> In stock only</label></div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {productResults.rows.map((row) => {
                const added = items.some((item) => item.productId === row.productId)
                const out = row.quantity <= 0
                return (
                  <button key={row.productId} type="button" disabled={added || out} className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50 ${added ? 'border-[var(--primary)] bg-[var(--accent)]' : ''}`} onClick={() => addProduct(row)}>
                    <span className="min-w-0"><span className="block truncate font-medium leading-5">{row.productName}</span><span className="block truncate text-xs leading-4 text-[var(--muted)]">{row.categoryName} · {out ? 'Out of stock' : `${row.quantity} available`}</span></span>
                    {added ? <Check className="size-4 shrink-0 text-[var(--primary)]" /> : <Plus className="size-4 shrink-0 text-[var(--primary)]" />}
                  </button>
                )
              })}
              {!catalog.length ? <p className="text-sm text-[var(--muted)]">No products match. Set a price and quantity in Inventory first.</p> : null}
            </div>
            <Pager {...productResults} size={9} onChange={setProductPage} />
          </div>
          {items.map((item, index) => (
            <div key={item.productId} className="rounded-lg border bg-white p-4">
              <div className="mb-3 flex items-start justify-between">
                <div><div className="font-medium">{item.name}</div><div className="text-xs text-[var(--muted)]">{inr(item.pricePerDay)}/day{item.depositPerUnit ? ` · Deposit ${inr(item.depositPerUnit)}/unit` : ''}</div></div>
                <button type="button" aria-label="Remove" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></button>
              </div>
              <div className="mb-4"><ProductPhoto name={item.name} photo={item.photo} onChange={(photo) => update(index, { photo })} /></div>
              <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                  <span className="flex h-8 items-center">Price / day (₹)</span>
                  <input className="h-10 w-full min-w-0 rounded-md border px-3 font-normal" type="number" min={1} value={item.pricePerDay || ''} onChange={(event) => update(index, { pricePerDay: Math.max(0, Number(event.target.value)) })} />
                </label>
                <div className="grid min-w-0 gap-1.5 text-sm font-semibold">
                  <span className="flex h-8 items-center">Quantity</span>
                  <div className="flex h-10 w-full items-center rounded-md border font-normal">
                    <button className="grid h-full w-10 shrink-0 place-items-center border-r disabled:opacity-40" type="button" disabled={item.quantity <= 1} onClick={() => update(index, { quantity: item.quantity - 1 })}><Minus className="size-4" /></button>
                    <span className="min-w-0 flex-1 text-center font-mono">{item.quantity}</span>
                    <button className="grid h-full w-10 shrink-0 place-items-center border-l disabled:opacity-40" type="button" disabled={item.quantity >= item.available} onClick={() => update(index, { quantity: item.quantity + 1 })}><Plus className="size-4" /></button>
                  </div>
                </div>
                <div className="grid min-w-0 gap-1.5 text-sm font-semibold">
                  <span className="flex h-8 items-center justify-between gap-2">
                    <span className="truncate">Duration</span>
                    <span className="grid h-8 shrink-0 grid-cols-3 overflow-hidden rounded-md border text-xs font-normal" role="group" aria-label="Duration in days">
                      {durations.map((days) => <button key={days} className={`px-2 ${item.days === days ? 'bg-[var(--primary)] text-white' : ''}`} type="button" aria-pressed={item.days === days} onClick={() => update(index, { days })}>{days} days</button>)}
                    </span>
                  </span>
                  <input className="h-10 w-full min-w-0 rounded-md border px-3 font-normal" aria-label="Duration in days" type="number" min={1} value={item.days || ''} onChange={(event) => update(index, { days: Number(event.target.value) })} />
                </div>
                <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                  <span className="flex h-8 items-center">Deposit / unit (₹)</span>
                  <input className="h-10 w-full min-w-0 rounded-md border px-3 font-normal" type="number" min={0} value={item.depositPerUnit} onChange={(event) => update(index, { depositPerUnit: Number(event.target.value) })} />
                </label>
                <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                  <span className="flex h-8 items-center">Start date</span>
                  <input className="h-10 w-full min-w-0 rounded-md border px-3 font-normal" type="date" value={item.startDate} onChange={(event) => update(index, { startDate: event.target.value })} />
                </label>
                <div className="grid min-w-0 content-start gap-1.5 text-sm sm:text-right">
                  <div className="flex h-8 items-center text-xs text-[var(--muted)] sm:justify-end">Ends</div>
                  <div className="flex h-10 items-center gap-3 sm:justify-end">
                    <span className="font-medium">{item.startDate && validDuration(item.days) ? fmtDate(endDate(item.startDate, item.days)) : '—'}</span>
                    <span className="font-mono text-[var(--primary)]">{inr(lineCharge({ quantity: item.quantity, days: item.days, pricePerDay: item.pricePerDay, depositPerUnit: item.depositPerUnit }))}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {errors.items ? <p className="text-sm text-[var(--danger)]">{errors.items}</p> : null}
          {items.length > 0 ? (
            <div className="rounded-lg border bg-white p-4">
              <ChargesEditor value={charges} onChange={(value) => { setCharges(value); setErrors({}) }} />
              {errors.charges ? <p className="mt-3 text-sm text-[var(--danger)]">{errors.charges}</p> : null}
              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4 text-sm">
                <span>Total including GST and deposit</span>
                <span className="shrink-0 font-mono text-base font-semibold">{inr(summary.total)}</span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 2 && customer ? (
        <section className="grid gap-4 md:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <div className="rounded-lg border bg-white p-4 text-sm">
              <div className="mb-2 flex justify-between"><span className="font-medium">Customer</span><button className="text-[var(--primary)]" type="button" onClick={() => setStep(0)}>Edit</button></div>
              <div className="font-medium">{customer.name}</div>
              <div className="text-[var(--muted)]">{customer.mobile}{customer.email ? ` · ${customer.email}` : ''}</div>
              <div className="text-[var(--muted)]">{customer.address}</div>
              <div className="mt-2 text-xs text-[var(--muted)]">Reference: {customer.refName} ({customer.refRelation}) · {customer.refMobile}</div>
            </div>
            <div className="rounded-lg border bg-white text-sm">
              <div className="flex justify-between border-b p-4"><span className="font-medium">Items</span><button className="text-[var(--primary)]" type="button" onClick={() => setStep(1)}>Edit</button></div>
              {items.map((item) => (
                <div key={item.productId} className="flex justify-between gap-3 border-b p-4 last:border-0">
                  <div className="min-w-0">{item.photo ? <img src={item.photo} alt="" className="mb-2 size-16 rounded-md border object-cover" /> : null}<div className="font-medium">{item.name} × {item.quantity}</div><div className="text-xs text-[var(--muted)]">{item.days} days · {fmtDate(item.startDate)} → {fmtDate(endDate(item.startDate, item.days))}</div><div className="text-xs text-[var(--muted)]">{inr(item.pricePerDay)}/day · Deposit {inr(item.depositPerUnit)}/unit</div></div>
                  <span className="shrink-0 font-mono">{inr(lineCharge(item))}</span>
                </div>
              ))}
            </div>
          </div>
          <TotalsCard t={summary} />
        </section>
      ) : null}

      {errors.confirm ? <p className="mt-4 text-sm text-[var(--danger)]">{errors.confirm}</p> : null}
      <div className="mt-6 flex justify-between">
        <button className="rounded-md border px-4 py-2.5 text-sm disabled:opacity-40" type="button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Back</button>
        {step < 2 ? <PrimaryButton onClick={next}>Continue</PrimaryButton> : <PrimaryButton disabled={busy} onClick={() => void confirm()}><Check className="size-4" /> {busy ? 'Saving…' : 'Confirm rental'}</PrimaryButton>}
      </div>
    </div>
  )
}
