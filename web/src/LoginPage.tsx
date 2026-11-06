import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type Vendor } from './api'

const blankDigits = () => ['', '', '', '', '', '']

export function LoginPage({ onSignedIn }: { onSignedIn: (vendor: Vendor) => void }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [digits, setDigits] = useState(blankDigits)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const [focusCode, setFocusCode] = useState(0)
  const busyRef = useRef(false)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  function choose(next: 'login' | 'register') {
    setMode(next)
    setSent(false)
    setDigits(blankDigits())
    setError('')
    setFieldErrors({})
    setWait(0)
  }

  function editEmail() {
    setSent(false)
    setDigits(blankDigits())
    setError('')
    setWait(0)
  }

  function problems() {
    const next: Record<string, string> = {}
    if (!/^[6-9]\d{9}$/.test(phone)) next.phone = 'Enter a valid 10-digit mobile.'
    if (mode === 'register') {
      const name = businessName.trim()
      const mail = email.trim()
      if (name.length < 2 || name.length > 160 || !/[A-Za-z]/.test(name)) next.businessName = 'Enter the business name.'
      const shop = address.trim()
      if (shop.length < 5 || shop.length > 500 || !/[A-Za-z]/.test(shop)) next.address = 'Enter the shop address.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) || mail.length > 320) next.email = 'Enter a valid email.'
    }
    return next
  }

  async function sendCode() {
    if (busyRef.current) return
    const next = problems()
    setFieldErrors(next)
    if (Object.keys(next).length) return setError('')
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), purpose: mode, businessName: businessName.trim(), phone, address: address.trim() }),
      })
      setDigits(blankDigits())
      setSent(true)
      setWait(45)
      setFocusCode((current) => current + 1)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The code could not be sent.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function verify(nextCode = digits.join('')) {
    if (busyRef.current || nextCode.length !== 6) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const vendor = await api<Vendor>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ phone, code: nextCode, purpose: mode }) })
      onSignedIn(vendor)
      navigate('/', { replace: true })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That code is not valid.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function changeDigits(next: string[]) {
    setDigits(next)
    setError('')
    const code = next.join('')
    if (next.every(Boolean)) void verify(code)
  }

  const code = digits.join('')

  return (
    <main className="flex min-h-screen justify-center px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/bm-icon.png" alt="BlinksMed" className="size-12 rounded-xl" />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Vendor Desk</h1>
          <p className="text-sm text-[var(--muted)]">Medical equipment rentals</p>
        </div>
        <section className="rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-[var(--secondary)] p-1 text-sm">
            <button className={`rounded-md px-3 py-2 ${mode === 'login' ? 'bg-white font-semibold shadow-sm' : 'text-[var(--muted)]'}`} type="button" onClick={() => choose('login')}>Sign in</button>
            <button className={`rounded-md px-3 py-2 ${mode === 'register' ? 'bg-white font-semibold shadow-sm' : 'text-[var(--muted)]'}`} type="button" onClick={() => choose('register')}>Register</button>
          </div>
          <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); void (sent ? verify() : sendCode()) }}>
            {sent ? (
              <>
                <div>
                  <h2 className="text-base font-semibold">Enter the text code</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">Sent to <span className="font-medium text-[var(--foreground)]">{phone.slice(0, 2)}••••{phone.slice(-2)}</span>. It expires in 10 minutes.</p>
                </div>
                <CodeBoxes digits={digits} invalid={Boolean(error)} disabled={busy} focusToken={focusCode} onChange={changeDigits} />
                {error ? <p className="rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
                <button className="rounded-md bg-[var(--primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy || code.length < 6} type="submit">{busy ? 'Checking…' : 'Verify code'}</button>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <button className="text-[var(--primary)]" type="button" onClick={editEmail}>Edit mobile</button>
                  <button className="text-[var(--primary)] disabled:text-[var(--muted)]" type="button" disabled={wait > 0 || busy} onClick={() => void sendCode()}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--muted)]">{mode === 'login' ? 'We text a 6-digit code to this mobile. There is no password.' : 'Register the shop, then confirm it with a code sent to this mobile.'}</p>
                {mode === 'register' ? (
                  <>
                    <Field label="Business name" value={businessName} onChange={(value) => { setBusinessName(value); setFieldErrors((current) => ({ ...current, businessName: '' })) }} autoComplete="organization" maxLength={160} error={fieldErrors.businessName} />
                    <Field label="Address" value={address} onChange={(value) => { setAddress(value); setFieldErrors((current) => ({ ...current, address: '' })) }} autoComplete="street-address" maxLength={500} error={fieldErrors.address} />
                    <Field label="Email" value={email} onChange={(value) => { setEmail(value); setFieldErrors((current) => ({ ...current, email: '' })) }} type="email" autoComplete="email" maxLength={320} error={fieldErrors.email} />
                  </>
                ) : null}
                <Field label="Mobile" value={phone} onChange={(value) => { setPhone(value.replace(/\D/g, '').slice(0, 10)); setFieldErrors((current) => ({ ...current, phone: '' })) }} type="tel" autoComplete="tel" inputMode="tel" maxLength={10} error={fieldErrors.phone} />
                {error ? <p className="rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
                <button className="rounded-md bg-[var(--primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? 'Sending code…' : 'Send code'}</button>
              </>
            )}
          </form>
        </section>
      </div>
    </main>
  )
}

function Field({ label, value, onChange, type = 'text', autoComplete, inputMode, maxLength, error }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; inputMode?: 'tel' | 'email' | 'text'; maxLength?: number; error?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input className={`rounded-md border bg-white px-3 py-2.5 font-normal outline-none focus:border-[var(--primary)] ${error ? 'border-[var(--danger)]' : ''}`} type={type} value={value} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} aria-invalid={error ? true : undefined} onChange={(event) => onChange(event.target.value)} />
      {error ? <span className="text-xs font-normal text-[var(--danger)]">{error}</span> : null}
    </label>
  )
}

function CodeBoxes({ digits, onChange, invalid, disabled, focusToken }: { digits: string[]; onChange: (next: string[]) => void; invalid: boolean; disabled: boolean; focusToken: number }) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [focusToken])

  function write(index: number, text: string) {
    const incoming = text.replace(/\D/g, '')
    const next = [...digits]
    if (!incoming) {
      next[index] = ''
      onChange(next)
      return
    }
    incoming.slice(0, 6 - index).split('').forEach((char, offset) => { next[index + offset] = char })
    onChange(next)
    const focusAt = Math.min(5, index + incoming.length)
    refs.current[focusAt]?.focus()
  }

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2" role="group" aria-label="6-digit text code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => { refs.current[index] = node }}
          className={`h-12 w-full rounded-md border bg-white text-center font-mono text-lg outline-none focus:border-[var(--primary)] sm:h-14 ${invalid ? 'border-[var(--danger)]' : digit ? 'border-[var(--primary)]' : ''}`}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1}`}
          maxLength={6}
          value={digit}
          disabled={disabled}
          onChange={(event) => write(index, event.target.value)}
          onFocus={(event) => event.target.select()}
          onPaste={(event) => { event.preventDefault(); write(index, event.clipboardData.getData('text')) }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index] && index > 0) {
              event.preventDefault()
              const next = [...digits]
              next[index - 1] = ''
              onChange(next)
              refs.current[index - 1]?.focus()
            }
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
            if (event.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus()
          }}
        />
      ))}
    </div>
  )
}
