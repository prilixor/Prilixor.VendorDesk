import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Mic, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { startDictation, type Dictation } from './dictate'
import { inr, type totals } from './money'

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'Active' ? 'bg-[var(--success)]/15 text-[var(--success)]' : status === 'Due soon' ? 'bg-[var(--warning)]/25' : 'bg-slate-100 text-[var(--muted)]'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
}

export function TotalsCard({ t }: { t: ReturnType<typeof totals> }) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between py-1 ${strong ? 'border-t pt-2 text-base font-semibold' : ''}`}><span>{label}</span><span className="font-mono">{value}</span></div>
  )
  return (
    <div className="h-fit rounded-lg border bg-white p-4 text-sm">
      {row('Rental subtotal', inr(t.subtotal))}
      {row(t.discountLabel, '−' + inr(t.discount))}
      {t.additionalFees > 0 ? row('Additional charges', inr(t.additionalFees)) : null}
      {row(`GST (${t.taxPercent}%)`, inr(t.tax))}
      {t.deposit > 0 ? row('Refundable deposit', inr(t.deposit)) : null}
      {row('Total', inr(t.total), true)}
    </div>
  )
}

export function Pager({ current, pages, total, size, onChange }: { current: number; pages: number; total: number; size: number; onChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-[var(--muted)]">
      <span>{total ? `${current * size + 1}–${Math.min((current + 1) * size, total)} of ${total}` : '0 results'}</span>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <button className="grid size-8 place-items-center rounded-md border disabled:opacity-40" type="button" aria-label="Previous page" disabled={current === 0} onClick={() => onChange(current - 1)}><ChevronLeft className="size-4" /></button>
          <span>{current + 1} / {pages}</span>
          <button className="grid size-8 place-items-center rounded-md border disabled:opacity-40" type="button" aria-label="Next page" disabled={current + 1 >= pages} onClick={() => onChange(current + 1)}><ChevronRight className="size-4" /></button>
        </div>
      ) : null}
    </div>
  )
}

export function pageRows<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.max(0, Math.min(page, pages - 1))
  return { rows: items.slice(current * size, (current + 1) * size), current, pages, total: items.length }
}

export function CategoryPicker({ categories, counts, value, onChange, className = 'mt-3' }: { categories: string[]; counts: Record<string, number>; value: string; onChange: (name: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const choices = categories.filter((name) => name === 'All' ? query.trim() === '' : name.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium text-[var(--muted)]">
        <span>Category</span>
        <span>{Math.max(0, categories.length - 1)} in the catalog</span>
      </div>
      <button type="button" aria-expanded={open} aria-haspopup="listbox" className="flex h-10 w-full items-center justify-between gap-3 rounded-md border px-3 text-left text-sm" onClick={() => { setOpen((current) => !current); setQuery('') }}>
        <span className="min-w-0 truncate">{value === 'All' ? 'All categories' : value}</span>
        <span className="flex shrink-0 items-center gap-2 text-[var(--muted)]">
          <span className="text-xs">{counts[value] ?? 0}</span>
          <ChevronDown className={`size-4 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white p-2 shadow-lg">
          <input autoFocus className="mb-2 h-9 w-full rounded-md border px-3 text-sm" aria-label="Find a category" placeholder="Find a category" value={query} onChange={(event) => setQuery(event.target.value)} />
          <ul role="listbox" aria-label="Categories" className="max-h-60 overflow-y-auto">
            {choices.map((name) => (
              <li key={name}>
                <button type="button" role="option" aria-selected={value === name} title={name === 'All' ? 'All categories' : name} className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm ${value === name ? 'bg-[var(--accent)] text-[var(--foreground)]' : 'hover:bg-slate-50'}`} onClick={() => { onChange(name); setOpen(false) }}>
                  <span className="flex min-w-0 items-center gap-2">
                    {value === name ? <Check className="size-4 shrink-0 text-[var(--primary)]" /> : <span className="size-4 shrink-0" />}
                    <span className="truncate">{name === 'All' ? 'All categories' : name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{counts[name] ?? 0}</span>
                </button>
              </li>
            ))}
            {!choices.length ? <li className="px-2 py-3 text-sm text-[var(--muted)]">No category matches.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function speakHint(label: string, kind: 'text' | 'phone' | 'email') {
  const name = label.toLowerCase()
  if (kind === 'email') return 'Say the email with “at” and “dot”, such as rahul at gmail dot com. Pause, or tap the mic, when you finish.'
  if (kind === 'phone') return `Say the ${name} digits. Say “double” when a digit repeats. Pause, or tap the mic, when you finish.`
  return `Say the ${name}. Pause, or tap the mic, when you finish.`
}

export function MicField({ id, label, value, onChange, kind = 'text', error, optional, multiline, onFocus }: { id: string; label: string; value: string; onChange: (value: string) => void; kind?: 'text' | 'phone' | 'email'; error?: string; optional?: boolean; multiline?: boolean; onFocus?: () => void }) {
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('')
  const [hint, setHint] = useState('')
  const session = useRef<Dictation | null>(null)
  const phase = useRef<'idle' | 'listen' | 'work'>('idle')
  const mounted = useRef(true)
  const live = listening || status.startsWith('Listening')

  useEffect(() => () => {
    mounted.current = false
    session.current?.cancel()
  }, [])

  useEffect(() => {
    if (!status.startsWith('Listening')) return
    const timer = window.setTimeout(() => {
      if (phase.current !== 'listen') return
      session.current?.stop()
      window.setTimeout(() => {
        if (phase.current !== 'listen') return
        session.current = null
        phase.current = 'idle'
        setListening(false)
        setStatus('')
        setHint('The microphone did not respond. Tap it and speak again.')
      }, 400)
    }, 16000)
    return () => window.clearTimeout(timer)
  }, [status])

  function listen(event: { preventDefault: () => void; stopPropagation: () => void }) {
    event.preventDefault()
    event.stopPropagation()
    if (phase.current === 'listen') {
      phase.current = 'work'
      setListening(false)
      setHint('')
      setStatus('Working out what you said…')
      session.current?.stop()
      return
    }
    if (phase.current === 'work') return
    phase.current = 'listen'
    setHint('')
    setListening(true)
    setStatus('Listening… pause when you finish, or tap the mic.')
    const mine = startDictation({
      kind,
      multiline: Boolean(multiline),
      listeningMessage: 'Listening… pause when you finish, or tap the mic.',
      onListen: (on) => { if (mounted.current && session.current === mine && phase.current === 'listen') setListening(on) },
      onStatus: (message) => {
        if (!mounted.current || session.current !== mine) return
        if (message.startsWith('Working')) {
          phase.current = 'work'
          setListening(false)
        }
        setStatus(message)
      },
      onText: (text) => { if (session.current === mine) onChange(text) },
      onError: (message) => { if (mounted.current && session.current === mine) setHint(message) },
      onEnd: () => {
        if (session.current !== mine) return
        session.current = null
        phase.current = 'idle'
        if (!mounted.current) return
        setListening(false)
        setStatus('')
      },
    })
    session.current = mine
  }

  const guidance = speakHint(label, kind)

  return (
    <div className="grid gap-1.5 text-sm font-semibold">
      <label htmlFor={id}>{label} {optional ? <span className="font-normal text-[var(--muted)]">(optional)</span> : null}</label>
      <span className="flex gap-2">
        {multiline
          ? <textarea id={id} className={`min-h-20 flex-1 rounded-md border px-3 py-2 font-normal ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`} value={value} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} />
          : <input id={id} inputMode={kind === 'phone' ? 'tel' : kind === 'email' ? 'email' : 'text'} className={`h-10 flex-1 rounded-md border px-3 font-normal ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`} value={value} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} />}
        <button className={`grid size-10 shrink-0 place-items-center rounded-md border bg-[var(--secondary)] ${live ? 'animate-pulse border-[var(--primary)] bg-[var(--primary)] text-white' : ''}`} type="button" aria-pressed={live} aria-label={`Voice input for ${label}`} title={guidance} onClick={listen}><Mic className="size-4" /></button>
      </span>
      {status ? <span className="text-xs font-normal text-[var(--primary)]">{status}</span> : null}
      {hint ? <span className="text-xs font-normal text-[var(--danger)]">{hint}</span> : null}
      {error ? <span className="text-xs font-normal text-[var(--danger)]">{error}</span> : null}
    </div>
  )
}

export function ProductPhoto({ name, photo, onChange }: { name: string; photo?: string; onChange: (photo: string | undefined) => void }) {
  const upload = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  function read(file?: File) {
    if (!file) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Choose a JPG, PNG or WebP photo.')
    if (file.size > 5 * 1024 * 1024) return setError('Photo must be smaller than 5 MB.')
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') onChange(reader.result) }
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {photo ? (
        <div className="relative">
          <img src={photo} alt={`${name} rental photo`} className="size-20 rounded-md border object-cover" />
          <button className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-md border bg-white" type="button" aria-label={`Remove photo for ${name}`} onClick={() => onChange(undefined)}><X className="size-3" /></button>
        </div>
      ) : <div className="grid size-16 place-items-center rounded-md border border-dashed text-[var(--muted)]"><ImagePlus className="size-6" /></div>}
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => upload.current?.click()}><ImagePlus className="size-4" /> {photo ? 'Replace photo' : 'Upload photo'}</button>
        <button className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => camera.current?.click()}><Camera className="size-4" /> Take photo</button>
      </div>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
      <input ref={upload} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload photo for ${name}`} onChange={(event) => { read(event.target.files?.[0]); event.target.value = '' }} />
      <input ref={camera} className="hidden" type="file" accept="image/*" capture="environment" aria-label={`Take photo for ${name}`} onChange={(event) => { read(event.target.files?.[0]); event.target.value = '' }} />
    </div>
  )
}

const chargeBox = 'h-10 w-full min-w-0 rounded-md border bg-white px-3 font-normal'

export function ChargesEditor({ value, onChange }: { value: ChargeInput; onChange: (value: ChargeInput) => void }) {
  const percent = value.discountType === 'percent'
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Discount & charges</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-2 text-sm font-semibold">
          <span className="flex h-8 items-center justify-between gap-2">
            Discount
            <span className="grid h-8 shrink-0 grid-cols-2 overflow-hidden rounded-md border text-xs font-normal" role="group" aria-label="Discount type">
              <button className={`px-2.5 ${percent ? 'bg-[var(--primary)] text-white' : ''}`} type="button" aria-pressed={percent} onClick={() => onChange({ ...value, discountType: 'percent', discountValue: Math.min(100, value.discountValue) })}>%</button>
              <button className={`px-2.5 ${percent ? '' : 'bg-[var(--primary)] text-white'}`} type="button" aria-pressed={!percent} onClick={() => onChange({ ...value, discountType: 'flat' })}>₹ Flat</button>
            </span>
          </span>
          <input className={chargeBox} aria-label={percent ? 'Discount percentage' : 'Flat discount amount'} type="number" min={0} max={percent ? 100 : undefined} step="0.01" value={value.discountValue} onChange={(event) => onChange({ ...value, discountValue: Number(event.target.value) })} />
          {percent ? (
            <span className="flex flex-wrap gap-1 font-normal">{[0, 5, 10, 15].map((rate) => <button key={rate} className={`rounded px-2 py-1 text-xs ${value.discountValue === rate ? 'bg-[var(--primary)] text-white' : 'border'}`} type="button" onClick={() => onChange({ ...value, discountValue: rate })}>{rate}%</button>)}</span>
          ) : <span className="text-xs font-normal text-[var(--muted)]">Rupees taken off the rental subtotal.</span>}
        </div>
        <label className="grid min-w-0 content-start gap-2 text-sm font-semibold">
          <span className="flex h-8 items-center">GST (%)</span>
          <input className={chargeBox} type="number" min={0} max={100} step="0.01" value={value.taxPercent} onChange={(event) => onChange({ ...value, taxPercent: Number(event.target.value) })} />
          <span className="flex flex-wrap gap-1 font-normal">{[0, 5, 12, 18, 28].map((rate) => <button key={rate} className={`rounded px-2 py-1 text-xs ${value.taxPercent === rate ? 'bg-[var(--primary)] text-white' : 'border'}`} type="button" onClick={() => onChange({ ...value, taxPercent: rate })}>{rate}%</button>)}</span>
        </label>
        <label className="grid min-w-0 content-start gap-2 text-sm font-semibold">
          <span className="flex h-8 items-center">Additional charges (₹)</span>
          <input className={chargeBox} type="number" min={0} step="0.01" value={value.additionalFees} onChange={(event) => onChange({ ...value, additionalFees: Number(event.target.value) })} />
          <span className="text-xs font-normal text-[var(--muted)]">Delivery, fitting, or any other fee.</span>
        </label>
      </div>
    </div>
  )
}

type ChargeInput = { discountType: 'percent' | 'flat'; discountValue: number; taxPercent: number; additionalFees: number }

export function PrimaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return <button className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled} type={type} onClick={onClick}>{children}</button>
}
