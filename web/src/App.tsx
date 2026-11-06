import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api, type Vendor } from './api'
import { DashboardPage } from './DashboardPage'
import { InventoryPage } from './InventoryPage'
import { LoginPage } from './LoginPage'
import { NewRentalPage } from './NewRentalPage'
import { ProfilePage } from './ProfilePage'
import { InvoicePage, RentalPage } from './RentalPage'
import { Shell } from './Shell'

export function App() {
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api<Vendor>('/api/auth/me').then(setVendor).catch(() => setVendor(null)).finally(() => setReady(true))
  }, [])

  if (!ready) return <p className="p-8 text-sm text-[var(--muted)]">Loading…</p>
  return (
    <Routes>
      <Route path="/login" element={vendor ? <Navigate to="/" replace /> : <LoginPage onSignedIn={setVendor} />} />
      <Route path="/*" element={vendor ? <Desk vendor={vendor} setVendor={setVendor} /> : <Navigate to="/login" replace />} />
    </Routes>
  )
}

function Desk({ vendor, setVendor }: { vendor: Vendor; setVendor: (vendor: Vendor | null) => void }) {
  const path = useLocation().pathname
  const locked = !vendor.profileComplete && path !== '/profile'
  return (
    <Shell vendor={vendor} onSignOut={() => setVendor(null)}>
      {locked ? <Navigate to="/profile" replace /> : (
        <Routes>
          <Route path="/" element={<DashboardPage vendor={vendor} />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/rentals/new" element={<NewRentalPage vendor={vendor} />} />
          <Route path="/rentals/:id" element={<RentalPage />} />
          <Route path="/invoice/:id" element={<InvoicePage vendor={vendor} />} />
          <Route path="/profile" element={<ProfilePage vendor={vendor} onSaved={setVendor} />} />
        </Routes>
      )}
    </Shell>
  )
}
