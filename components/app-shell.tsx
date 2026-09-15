'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Bell,
  ChevronDown,
  CreditCard,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Search,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { AppearanceMenu } from '@/components/appearance-menu'

const navItems = [
  { href: '/', label: 'Tableau de bord', icon: LayoutDashboard, adminOnly: false },
  { href: '/ventes', label: 'Ventes', icon: ShoppingCart, adminOnly: false },
  { href: '/stock', label: 'Stock', icon: Package, adminOnly: false },
  { href: '/transferts', label: 'Transferts', icon: ArrowLeftRight, adminOnly: false },
  { href: '/tresorerie', label: 'Trésorerie', icon: WalletCards, adminOnly: true },
]

const gestionItems = [
  { href: '/magasins', label: 'Magasins', icon: Store, adminOnly: true },
  { href: '/clients', label: 'Clients & créances', icon: Users, adminOnly: false },
  { href: '/fournisseurs', label: 'Fournisseurs', icon: Truck, adminOnly: true },
  { href: '/rapports', label: 'Rapports', icon: ReceiptText, adminOnly: true },
  { href: '/utilisateurs', label: 'Utilisateurs', icon: UserCog, adminOnly: true },
]

function UserChip() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [open, setOpen] = useState(false)

  const name = session?.user?.name ?? '…'
  const role = session?.user?.role ?? 'gestionnaire'
  const roleLabel = role === 'admin' ? 'Administrateur' : 'Gestionnaire'
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function handleLogout() {
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="user-chip"
        style={{ border: 0, background: 'none', width: '100%', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="avatar">{initials || '…'}</div>
        <div><strong>{name}</strong><span>{roleLabel}</span></div>
        <ChevronDown />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            marginBottom: 6,
            overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(16,25,41,.25)',
          }}
        >
          <button
            type="button"
            className="nav-link"
            style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
            onClick={handleLogout}
          >
            <LogOut />Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

export function AppShell({
  breadcrumb,
  section,
  children,
  onExport,
}: {
  breadcrumb: string
  section: string
  children: ReactNode
  onExport?: () => void
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'

  return (
    <div className="app-frame">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark">B</div>
          <div><strong>BGM</strong><span>Barry-Gate Multi Service</span></div>
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu"><X /></button>
        </div>
        <div className="workspace-select"><span className="workspace-dot" /><span>Direction générale</span><ChevronDown aria-hidden="true" /></div>
        <nav className="nav-list" aria-label="Navigation principale">
          <p className="nav-caption">PILOTAGE</p>
          {navItems.filter((item) => isAdmin || !item.adminOnly).map((item) => (
            <Link key={item.href} className={`nav-link ${pathname === item.href ? 'active' : ''}`} href={item.href}>
              <item.icon />{item.label}
            </Link>
          ))}
          <p className="nav-caption nav-caption-spaced">GESTION</p>
          {gestionItems.filter((item) => isAdmin || !item.adminOnly).map((item) => (
            <Link key={item.href} className={`nav-link ${pathname === item.href ? 'active' : ''}`} href={item.href}>
              <item.icon />{item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <UserChip />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Menu /></button>
          <div className="breadcrumb"><span>{breadcrumb}</span><strong>{section}</strong></div>
          <div className="topbar-actions">
            <AppearanceMenu variant="topbar" />
            {searchOpen && <input className="search-input" autoFocus placeholder="Rechercher..." aria-label="Rechercher" />}
            <button className="icon-button" onClick={() => setSearchOpen(!searchOpen)} aria-label="Rechercher"><Search /></button>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell /><span /></button>
            {onExport && <button className="export-button" onClick={onExport}><Download /> Exporter</button>}
          </div>
        </header>

        <div className="page-body">{children}</div>
      </main>
    </div>
  )
}
