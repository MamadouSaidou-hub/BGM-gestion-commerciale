'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Banknote,
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
import { NotificationMenu } from '@/components/notification-menu'
import { companyInfo } from '@/lib/company-info'

const navItems = [
  { href: '/', label: 'Tableau de bord', icon: LayoutDashboard, adminOnly: false },
  { href: '/ventes', label: 'Ventes', icon: ShoppingCart, adminOnly: false },
  { href: '/stock', label: 'Stock', icon: Package, adminOnly: false },
  { href: '/transferts', label: 'Transferts', icon: ArrowLeftRight, adminOnly: true },
  { href: '/tresorerie', label: 'Trésorerie', icon: WalletCards, adminOnly: true },
]

const gestionItems = [
  { href: '/magasins', label: 'Magasins', icon: Store, adminOnly: true },
  { href: '/clients', label: 'Clients & créances', icon: Users, adminOnly: false },
  { href: '/fournisseurs', label: 'Fournisseurs', icon: Truck, adminOnly: true },
  { href: '/caisse', label: 'Caisse & Dépenses', icon: Banknote, adminOnly: true },
  { href: '/rapports', label: 'Rapports', icon: ReceiptText, adminOnly: true },
  { href: '/utilisateurs', label: 'Utilisateurs', icon: UserCog, adminOnly: true },
]

function UserChip() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

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
    <div ref={containerRef} style={{ position: 'relative' }}>
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

type SearchResult = { type: 'product' | 'client' | 'sale' | 'supplier' | 'store'; label: string; subtitle: string; href: string }
const searchTypeIcon: Record<SearchResult['type'], typeof Package> = { product: Package, client: Users, sale: ShoppingCart, supplier: Truck, store: Store }

function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/recherche?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((json) => setResults(json.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function go(result: SearchResult) {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(result.href)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {open && (
        <input
          className="search-input"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          placeholder="Rechercher un article, un client, une vente..."
          aria-label="Recherche globale"
        />
      )}
      <button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label="Rechercher"><Search /></button>
      {open && query.trim().length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 340,
            maxHeight: 380,
            overflowY: 'auto',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(16,25,41,.2)',
            zIndex: 50,
          }}
        >
          {loading && <p style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>Recherche...</p>}
          {!loading && results.length === 0 && <p style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>Aucun résultat pour « {query} ».</p>}
          {!loading &&
            results.map((result, index) => {
              const Icon = searchTypeIcon[result.type]
              return (
                <button
                  key={`${result.type}-${index}`}
                  type="button"
                  onClick={() => go(result)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 14px',
                    border: 0,
                    borderBottom: '1px solid var(--border)',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <Icon size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{result.subtitle}</span>
                  </span>
                </button>
              )
            })}
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
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'

  return (
    <div className="app-frame">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={companyInfo.logoPath} alt={companyInfo.shortName} className="brand-mark" />
          <div><strong>{companyInfo.shortName}</strong><span>{companyInfo.displayName}</span></div>
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
            <GlobalSearch />
            <NotificationMenu />
            {onExport && <button className="export-button" onClick={onExport}><Download /> Exporter</button>}
          </div>
        </header>

        <div className="page-body">{children}</div>
      </main>
    </div>
  )
}
