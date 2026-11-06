import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { api, ApiError, type Vendor } from './api'
import { PageHeader } from './Shell'
import { PrimaryButton } from './ui'

const gstRates = [0, 5, 12, 18, 28]
const discountRates = [0, 5, 10, 15]

export function ProfilePage({ vendor, onSaved }: { vendor: Vendor; onSaved: (vendor: Vendor) => void }) {
  const [form, setForm] = useState({ businessName: vendor.businessName, ownerName: vendor.ownerName, phone: vendor.phone, gstin: vendor.gstin, address: vendor.address, taxPercent: String(vendor.taxPercent), discountPercent: String(vendor.discountPercent) })
  const [logo, setLogo] = useState<string | null>(vendor.logo)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const logoFile = useRef<HTMLInputElement>(null)

  function set(key: keyof typeof form, value: string) {
    setSaved('')
    setForm((current) => ({ ...current, [key]: key === 'gstin' ? value.toUpperCase() : value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const tax = Number(form.taxPercent)
    const discount = Number(form.discountPercent)
    if (!Number.isFinite(tax) || tax < 0 || tax > 100 || !Number.isFinite(discount) || discount < 0 || discount > 100) {
      setError('GST and discount must be between 0 and 100.')
      setSaved('')
      return
    }
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const next = await api<Vendor>('/api/profile', { method: 'PUT', body: JSON.stringify({ businessName: form.businessName, ownerName: form.ownerName, address: form.address, phone: form.phone, gstin: form.gstin, taxPercent: tax, discountPercent: discount, logo }) })
      onSaved(next)
      setSaved('Business details saved. New rentals use these GST and discount values.')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save details')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 w-full">
      <PageHeader title="Business details" subtitle="The shop name, address, phone, and logo print on every invoice. GST and discount are the starting values for a new rental." />
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-medium">Shop</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-[var(--secondary)]">
                {logo ? <img src={logo} alt={`${form.businessName || 'Shop'} logo`} className="size-full object-contain" /> : <ImagePlus className="size-5 text-[var(--muted)]" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Shop logo</div>
                <p className="text-xs text-[var(--muted)]">Shown on the menu, the home page, and every invoice.</p>
              </div>
            </div>
            <div className={logo ? 'grid grid-cols-2 gap-2 sm:flex sm:shrink-0' : 'flex'}>
              <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-3 text-sm" type="button" onClick={() => logoFile.current?.click()}>
                {logo ? <RefreshCw className="size-4" /> : <ImagePlus className="size-4" />}
                {logo ? 'Replace' : 'Upload logo'}
              </button>
              {logo ? <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-3 text-sm text-[var(--danger)]" type="button" onClick={() => { setLogo(null); setSaved('') }}><Trash2 className="size-4" /> Remove</button> : null}
            </div>
            <input ref={logoFile} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload shop logo" onChange={(event) => { readLogo(event.target.files?.[0], setLogo, setError); setSaved(''); event.target.value = '' }} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Business name" value={form.businessName} onChange={(value) => set('businessName', value)} maxLength={160} />
            <Field label="Owner name" value={form.ownerName} onChange={(value) => set('ownerName', value)} maxLength={120} />
            <Field label="Business phone" value={form.phone} onChange={(value) => set('phone', value)} maxLength={25} inputMode="tel" />
            <Field label="GSTIN" hint="Optional" value={form.gstin} onChange={(value) => set('gstin', value)} maxLength={15} />
            <Field label="Business address" value={form.address} onChange={(value) => set('address', value)} maxLength={500} wide />
          </div>
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-medium">New rental defaults</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">You can still change these on each rental before you confirm it.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PercentField label="Default GST" value={form.taxPercent} rates={gstRates} onChange={(value) => set('taxPercent', value)} />
            <PercentField label="Default discount" value={form.discountPercent} rates={discountRates} onChange={(value) => set('discountPercent', value)} />
          </div>
        </section>

        <section className="rounded-lg border bg-white p-4 text-sm">
          <h2 className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">Invoice header</h2>
          <div className="mt-2 flex items-start gap-3">
            {logo ? <img src={logo} alt="" className="size-12 shrink-0 rounded-md border object-contain" /> : null}
            <div className="min-w-0">
              <div className="font-medium">{form.businessName.trim() || 'Business name'}</div>
              <div className="text-[var(--muted)]">{form.address.trim() || 'Address'}</div>
              <div className="text-[var(--muted)]">{form.phone.trim() || 'Phone'}{form.gstin.trim() ? ` · GSTIN ${form.gstin.trim()}` : ''}</div>
            </div>
          </div>
          <div className="mt-3 border-t pt-3 text-xs text-[var(--muted)]">A new rental starts at {form.taxPercent || '0'}% GST and {form.discountPercent || '0'}% discount.</div>
        </section>

        <div className="sticky bottom-0 z-20 -mx-4 border-t bg-[var(--background)]/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          {error ? <p className="mb-2 text-sm text-[var(--danger)]">{error}</p> : null}
          {saved ? <p className="mb-2 text-sm text-[var(--success)]">{saved}</p> : null}
          <PrimaryButton disabled={busy} type="submit">{busy ? 'Saving…' : 'Save business details'}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}

function readLogo(file: File | undefined, onLogo: (logo: string) => void, onError: (message: string) => void) {
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return onError('Choose a JPG, PNG or WebP logo.')
  if (file.size > 5 * 1024 * 1024) return onError('Logo must be smaller than 5 MB.')
  const reader = new FileReader()
  reader.onload = () => {
    const image = new Image()
    image.onload = () => {
      const longest = Math.max(image.width, image.height)
      const scale = Math.min(1, 256 / longest)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return onError('Could not read that logo.')
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL(type, 0.9)
      if (data.length > 300_000) return onError('That logo is still too large. Use a simpler image.')
      onError('')
      onLogo(data)
    }
    image.onerror = () => onError('Could not read that logo.')
    if (typeof reader.result === 'string') image.src = reader.result
  }
  reader.readAsDataURL(file)
}

function Field({ label, hint, value, onChange, maxLength, wide, inputMode }: { label: string; hint?: string; value: string; onChange: (value: string) => void; maxLength: number; wide?: boolean; inputMode?: 'tel' | 'text' }) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium ${wide ? 'sm:col-span-2' : ''}`}>
      <span>{label} {hint ? <span className="font-normal text-[var(--muted)]">{hint}</span> : null}</span>
      <input className="h-10 rounded-md border px-3 font-normal" required={!hint} maxLength={maxLength} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function PercentField({ label, value, rates, onChange }: { label: string; value: string; rates: number[]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <span className="flex h-10 items-center rounded-md border px-3 focus-within:border-[var(--primary)]">
        <input className="w-full bg-transparent font-mono outline-none" inputMode="decimal" min={0} max={100} required value={value} onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ''))} />
        <span className="text-[var(--muted)]">%</span>
      </span>
      <span className="flex flex-wrap gap-1 font-normal">
        {rates.map((rate) => (
          <button key={rate} className={`rounded-full px-2.5 py-1 text-xs ${Number(value) === rate ? 'bg-[var(--primary)] text-white' : 'border'}`} type="button" onClick={() => onChange(String(rate))}>{rate}%</button>
        ))}
      </span>
    </label>
  )
}
