import { Building2, LayoutDashboard, LogOut, Package, PlusCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, type Vendor } from './api'

const links = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', short: 'Stock', icon: Package },
  { to: '/rentals/new', label: 'New Rental', short: 'Rental', icon: PlusCircle },
  { to: '/profile', label: 'Business details', short: 'Business', icon: Building2 },
]

function linkActive(to: string, path: string) {
  if (to === '/') return path === '/' || path.startsWith('/invoice') || (path.startsWith('/rentals/') && path !== '/rentals/new')
  return path === to
}

export function ShopLogo({ logo, name, className }: { logo?: string | null; name: string; className: string }) {
  if (!logo) return null
  return <img src={logo} alt={`${name} logo`} className={`${className} bg-white object-contain`} />
}

export function Shell({ vendor, onSignOut, children }: { vendor: Vendor; onSignOut: () => void; children: ReactNode }) {
  const navigate = useNavigate()
  const path = useLocation().pathname
  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' })
    onSignOut()
    navigate('/login', { replace: true })
  }
  return (
    <div className="flex h-dvh min-h-0 flex-col print:block print:h-auto md:h-auto md:min-h-screen md:flex-row">
      <aside className="no-print hidden w-60 shrink-0 flex-col text-[var(--sidebar-foreground)] md:flex" style={{ background: 'var(--sidebar)' }}>
        <div className="flex items-center gap-2 px-5 py-5">
          {vendor.logo ? <ShopLogo logo={vendor.logo} name={vendor.businessName} className="size-9 rounded-md" /> : <img src="/bm-icon.png" alt="BlinksMed" className="size-9 rounded-md" />}
          <div>
            <div className="font-semibold text-white">Vendor Desk</div>
            <div className="text-xs opacity-70">Medical rentals</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={() => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${linkActive(link.to, path) ? 'bg-[var(--sidebar-accent)] font-medium text-white' : 'hover:bg-[var(--sidebar-accent)]'}`}>
              <link.icon className="size-4" /> {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-5 py-4 text-xs">
          <div className="font-medium text-white">{vendor.businessName || 'Complete business details'}</div>
          <div className="opacity-70">{vendor.ownerName || vendor.city}</div>
          <button className="mt-3 flex items-center gap-2 text-sm" type="button" onClick={() => void signOut()}><LogOut className="size-4" /> Sign out</button>
        </div>
      </aside>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="no-print flex shrink-0 items-center gap-3 px-4 py-3 text-white md:hidden" style={{ background: 'var(--sidebar)' }}>
          {vendor.logo ? <ShopLogo logo={vendor.logo} name={vendor.businessName} className="size-8 shrink-0 rounded-md" /> : <img src="/bm-icon.png" alt="BlinksMed" className="size-8 shrink-0 rounded-md" />}
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight">Vendor Desk</div>
            <div className="truncate text-xs opacity-80">{vendor.businessName || 'Business details'}</div>
          </div>
          <button className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/15 px-3 py-2 text-sm font-medium" type="button" onClick={() => void signOut()}><LogOut className="size-4" /> Sign out</button>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-5 print:h-auto print:overflow-visible md:overflow-visible md:px-8 md:py-8">{children}</main>
        <nav className="no-print grid shrink-0 grid-cols-4 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={() => `flex min-w-0 flex-col items-center gap-1 px-1 py-2 text-[10px] leading-tight ${linkActive(link.to, path) ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`}>
              <link.icon className="size-5 shrink-0" /> <span className="max-w-full truncate">{link.short}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action, mark }: { title: string; subtitle?: string; action?: ReactNode; mark?: ReactNode }) {
  return (
    <div className="no-print mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {mark}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}
