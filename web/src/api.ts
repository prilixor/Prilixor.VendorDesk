export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const form = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !form && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) throw new ApiError(response.status, body?.error ?? 'Something went wrong.')
  return body as T
}

export type Vendor = {
  id: string
  businessName: string
  email: string
  phone: string
  city: string
  ownerName: string
  address: string
  gstin: string
  taxPercent: number
  discountPercent: number
  profileComplete: boolean
  logo: string | null
}
export type Customer = {
  id: string
  name: string
  mobile: string
  email: string
  address: string
  refName: string
  refMobile: string
  refRelation: string
}
export type RentalListItem = {
  id: string
  number: string
  customerName: string
  itemNames: string[]
  returnOn: string
  status: string
  units: number
  taxable: number
}
export type RentalLine = {
  productId: string
  name: string
  quantity: number
  days: number
  startDate: string
  endDate: string
  pricePerDay: number
  depositPerUnit: number
  amount: number
  photo?: string | null
}
export type RentalDetail = {
  id: string
  number: string
  invoiceNo: string
  createdOn: string
  status: string
  customer: Customer
  items: RentalLine[]
  charges: { discountType: 'percent' | 'flat'; discountValue: number; taxPercent: number; additionalFees: number }
  totals: {
    subtotal: number
    discount: number
    taxable: number
    tax: number
    deposit: number
    additionalFees: number
    discountLabel: string
    taxPercent: number
    total: number
  }
  business: { name: string; owner: string; address: string; phone: string; gstin: string }
}
export type InventoryRow = {
  productId: string
  productName: string
  categoryName: string
  pricePerDay: number
  quantity: number
  deposit: number
  isActive: boolean
  isStocked: boolean
}
