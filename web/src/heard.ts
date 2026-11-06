const digitWords: Record<string, string> = {
  zero: '0', oh: '0',
  one: '1', won: '1',
  two: '2', to: '2', too: '2', tu: '2',
  three: '3', tree: '3',
  four: '4', for: '4', fore: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8', ate: '8', hate: '8', head: '8',
  nine: '9', niner: '9',
}

/** Turns "nine eight double two" into digits. Used only for mobile fields. */
export function spokenPhone(text: string): string {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  let digits = ''
  let repeat = 1
  for (const token of tokens) {
    if (token === 'double' || token === 'triple') {
      repeat = token === 'double' ? 2 : 3
      continue
    }
    let digit = ''
    if (/^\d+$/.test(token)) digit = token
    else if (token.startsWith('eig')) digit = '8'
    else if (digitWords[token]) digit = digitWords[token]
    if (!digit) continue
    digits += digit.repeat(repeat)
    repeat = 1
  }
  if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(-10)
  return digits.slice(0, 10)
}

const mailProviders = ['gmail', 'yahoo', 'hotmail', 'outlook', 'rediffmail', 'rediff', 'icloud', 'live']

/** Turns "name at gmail dot com" or "name gmail com" into an email address. */
export function spokenEmail(text: string): string {
  let value = text.trim().toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ')
  value = value.replace(/^(?:the\s+)?(?:my\s+)?(?:e\s*mail|email)(?:\s+id)?(?:\s+is)?\s+/, '').replace(/^(?:it|this)\s+is\s+/, '')
  value = value.replace(/\bg\s+mail\b/g, 'gmail').replace(/\bhot\s+mail\b/g, 'hotmail').replace(/\bout\s+look\b/g, 'outlook').replace(/\brediff\s+mail\b/g, 'rediffmail')
  value = value.replace(/\bdot\s*com\b/g, 'dot com').replace(/\bdot\s*co\b/g, 'dot co')
  value = value.replace(/\bat\s+the\s+rate\b/g, '@').replace(/\battherate\b/g, '@').replace(/\s+at\s+/g, '@')
  value = value.replace(/\s+dot\s+/g, '.').replace(/\s+dash\s+/g, '-').replace(/\s+underscore\s+/g, '_')
  if (!value.includes('@')) {
    const provider = mailProviders.find((name) => new RegExp(`\\b${name}\\b`).test(value))
    if (provider) {
      const at = value.search(new RegExp(`\\b${provider}\\b`))
      const local = value.slice(0, at).trim().replace(/\s+/g, '')
      if (local) value = `${local}@${value.slice(at).trim()}`
    }
  }
  if (!value.includes('@')) return value.trim()
  const at = value.indexOf('@')
  const local = value.slice(0, at).replace(/\s+/g, '')
  const domain = value.slice(at + 1).trim()
    .replace(/\b(gmail|yahoo|hotmail|outlook|rediffmail|rediff|icloud|live)(com|in|org|net)\b/g, '$1.$2')
    .replace(/\bco\s+in\b/g, 'co.in').replace(/\s+/g, '.').replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '')
  return local && domain.includes('.') ? `${local}@${domain}` : value.trim()
}

function titleCase(text: string): string {
  return text.replace(/(^|\s)([a-z])/g, (letter) => letter.toUpperCase())
}

export function formatHeard(text: string, kind: 'text' | 'phone' | 'email', final = true): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  if (kind === 'phone') return spokenPhone(trimmed) || trimmed
  if (kind === 'email') {
    const email = spokenEmail(trimmed)
    if (email.includes('@') && email.includes('.')) return email
    return final ? email : trimmed.toLowerCase()
  }
  return final ? titleCase(trimmed) : trimmed
}
