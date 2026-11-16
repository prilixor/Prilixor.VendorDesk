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
export type DueReportRow = {
  id: string
  number: string
  customerName: string
  customerMobile: string
  itemNames: string[]
  units: number
  returnOn: string
  daysLate: number
  status: string
}
export type RevenueReportRow = {
  id: string
  number: string
  createdOn: string
  customerName: string
  subtotal: number
  discount: number
  taxable: number
  tax: number
  additionalFees: number
  billed: number
}
export type GstReportRow = {
  id: string
  number: string
  invoiceNo: string
  createdOn: string
  customerName: string
  taxable: number
  taxPercent: number
  tax: number
}
export type DepositReportRow = {
  id: string
  number: string
  customerName: string
  customerMobile: string
  itemNames: string[]
  units: number
  returnOn: string
  deposit: number
}
export type StockReportRow = {
  productId: string
  productName: string
  categoryName: string
  inShop: number
  outNow: number
  rentedQty: number
  times: number
}
export type ShopReport = {
  from: string
  to: string
  asOf: string
  gstin: string
  summary: {
    overdue: number
    dueToday: number
    open: number
    taxable: number
    tax: number
    billed: number
    depositsHeld: number
    unitsOut: number
  }
  due: DueReportRow[]
  revenue: RevenueReportRow[]
  gst: GstReportRow[]
  deposits: DepositReportRow[]
  stock: StockReportRow[]
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
