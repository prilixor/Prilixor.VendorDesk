export type ChargeInput = { discountType: 'percent' | 'flat'; discountValue: number; taxPercent: number; additionalFees: number }
export type LineInput = { quantity: number; days: number; pricePerDay: number; depositPerUnit: number }

export const inr = (value: number) => '₹' + value.toLocaleString('en-IN')
export const today = () => new Date().toISOString().slice(0, 10)

export function endDate(start: string, days: number) {
  const date = new Date(`${start}T00:00:00`)
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function fmtDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const lineCharge = (line: LineInput) => line.quantity * line.days * line.pricePerDay
export const validDuration = (days: number) => Number.isSafeInteger(days) && days > 0
export const validCharges = (charges: ChargeInput) =>
  [charges.discountValue, charges.taxPercent, charges.additionalFees].every((value) => Number.isFinite(value) && value >= 0)
  && charges.taxPercent <= 100
  && (charges.discountType !== 'percent' || charges.discountValue <= 100)

export function totals(lines: LineInput[], charges: ChargeInput) {
  const subtotal = lines.reduce((sum, line) => sum + lineCharge(line), 0)
  const raw = charges.discountType === 'percent' ? (subtotal * charges.discountValue) / 100 : charges.discountValue
  const discount = Math.min(subtotal, Math.round(raw))
  const taxable = subtotal - discount
  const tax = Math.round(((taxable + charges.additionalFees) * charges.taxPercent) / 100)
  const deposit = lines.reduce((sum, line) => sum + line.quantity * line.depositPerUnit, 0)
  const discountLabel = charges.discountType === 'percent' ? `Discount (${charges.discountValue}%)` : 'Discount (flat)'
  return { subtotal, discount, taxable, tax, deposit, additionalFees: charges.additionalFees, discountLabel, taxPercent: charges.taxPercent, total: taxable + charges.additionalFees + tax + deposit }
}
