'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  PieChart,
  TrendingUp,
  Sparkles,
  MessageSquare,
  Star,
  LogOut,
  User,
  ShieldCheck,
  GitCompareArrows,
  BookOpen,
  NotebookPen,
  Target,
  Brain,
  Search,
  Calculator,
  GraduationCap,
  Menu,
  X,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface NavbarProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    id?: string
  } | null
}

const navLinks = [
  { href: '/dashboard',   label: 'לוח בקרה',  icon: LayoutDashboard },
  { href: '/portfolio',   label: 'תיק',        icon: PieChart },
  { href: '/simulator',   label: 'סימולטור',   icon: TrendingUp },
  { href: '/ai-screener', label: 'סינון AI',   icon: Sparkles },
  { href: '/ai-chat',     label: "צ'אט AI",    icon: MessageSquare },
  { href: '/watchlist',   label: 'מעקב',       icon: Star },
  { href: '/ai-compare',  label: 'השוואה',      icon: GitCompareArrows },
  { href: '/trade-coach', label: 'מאמן עסקאות', icon: BookOpen },
  { href: '/journal',     label: 'יומן',         icon: NotebookPen },
  { href: '/goals',       label: 'מטרות',        icon: Target },
  { href: '/psychology',  label: 'פסיכולוגיה',   icon: Brain },
  { href: '/wealth-sim',  label: 'סימולטור עתידי', icon: Calculator },
  { href: '/academy',     label: 'אקדמיה',         icon: GraduationCap },
  { href: '/guide',       label: 'מדריך',           icon: BookOpen },
]

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  if (email) return email[0].toUpperCase()
  return 'U'
}

const BOTTOM_NAV = [
  { href: '/portfolio',   label: 'תיק',        icon: PieChart,       center: false },
  { href: '/ai-screener', label: 'סינון AI',    icon: Sparkles,       center: false },
  { href: '/dashboard',   label: 'דאשבורד',    icon: LayoutDashboard, center: true  },
  { href: '/academy',     label: 'אקדמיה',      icon: GraduationCap,  center: false },
  { href: '/ai-chat',     label: "צ'אט AI",     icon: MessageSquare,  center: false },
]

export default function Navbar({ user }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [searchVal, setSearchVal] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string; exchange: string }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); setSearchOpen(false) }, [pathname])

  // Focus search input when overlay opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setSearchResults([])
    }
  }, [searchOpen])

  // Live search
  useEffect(() => {
    if (!searchOpen) return
    const q = searchVal.trim()
    if (!q) { setSearchResults([]); return }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSearchResults(data.results ?? [])
      } catch { /* ignore */ }
      setSearchLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchVal, searchOpen])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const raw = searchVal.trim()
    if (!raw) return
    const ticker = /^\d+$/.test(raw) ? raw : raw.toUpperCase()
    setSearchVal('')
    router.push(`/stock/${ticker}`)
  }

  return (
    <>
    <header
      className="sticky top-0 z-40 px-4 py-0"
      style={{
        background: 'var(--iq-surface)',
        borderBottom: '1px solid var(--iq-border)',
      }}
    >
      <nav className="flex items-center justify-between max-w-7xl mx-auto h-14 gap-4">

        {/* ── Logo ── */}
        <Link
          href="/dashboard"
          className="shrink-0 font-extrabold text-lg gradient-text font-jakarta"
          style={{ letterSpacing: '-0.02em' }}
        >
          InvestIQ
        </Link>

        {/* ── Nav Links — visible from lg (1024px) up ── */}
        <ul className="hidden lg:flex items-center gap-1 flex-1 justify-center">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                    isActive ? 'nav-active' : 'hover:bg-white/5'
                  )}
                  style={{ color: isActive ? undefined : 'var(--iq-text-2)' }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* ── Global Search ── */}
        <form onSubmit={handleSearch} className="hidden md:flex items-center shrink-0">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--iq-text-3)' }} />
            <input
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="חיפוש מניה..."
              className="h-8 w-44 rounded-lg pr-8 pl-3 text-xs font-medium outline-none transition-all focus:w-52 focus:ring-1"
              style={{
                background: 'var(--iq-elevated)',
                border: '1px solid var(--iq-border)',
                color: 'var(--iq-text)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--iq-border)')}
            />
          </div>
        </form>

        {/* ── Mobile Search Icon — visible below md ── */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/5"
          onClick={() => setSearchOpen(true)}
          aria-label="חיפוש"
        >
          <Search className="h-5 w-5" style={{ color: 'var(--iq-text-2)' }} />
        </button>

        {/* ── Hamburger — visible below lg ── */}
        <button
          type="button"
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-white/5"
          onClick={() => setMobileOpen(true)}
          aria-label="פתח תפריט"
        >
          <Menu className="h-5 w-5" style={{ color: 'var(--iq-text-2)' }} />
        </button>

        {/* ── User Avatar Dropdown ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 flex items-center gap-2 rounded-full focus:outline-none"
              aria-label="תפריט משתמש"
            >
              <Avatar
                className="h-8 w-8 cursor-pointer ring-2 ring-offset-2 transition-all"
                style={{
                  ringColor: 'var(--iq-indigo)',
                  outlineOffset: '2px',
                  outline: '2px solid rgba(99,102,241,0.4)',
                } as React.CSSProperties}
              >
                {user?.image && (
                  <AvatarImage src={user.image} alt={user.name ?? 'משתמש'} />
                )}
                <AvatarFallback
                  className="text-xs font-bold"
                  style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--iq-indigo)' }}
                >
                  {getInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-52"
            style={{ background: 'var(--iq-elevated)', border: '1px solid var(--iq-border)' }}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                {user?.name && (
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--iq-text)' }}>
                    {user.name}
                  </p>
                )}
                {user?.email && (
                  <p className="text-xs truncate" style={{ color: 'var(--iq-text-3)' }}>
                    {user.email}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator style={{ background: 'var(--iq-border)' }} />

            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <User className="h-4 w-4" />
                פרופיל
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/risk-profile" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <ShieldCheck className="h-4 w-4" />
                פרופיל סיכון
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/ai-compare" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <GitCompareArrows className="h-4 w-4" />
                השוואת AI
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/trade-coach" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <BookOpen className="h-4 w-4" />
                מאמן עסקאות
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/journal" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <NotebookPen className="h-4 w-4" />
                יומן
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/goals" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <Target className="h-4 w-4" />
                מטרות
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/psychology" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <Brain className="h-4 w-4" />
                פסיכולוגיה
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/guide" className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--iq-text-2)' }}>
                <BookOpen className="h-4 w-4" />
                מדריך למשתמש
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator style={{ background: 'var(--iq-border)' }} />

            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              style={{ color: 'var(--iq-red)' }}
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              <LogOut className="h-4 w-4" />
              התנתק
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>

    {/* ── Mobile Drawer ─────────────────────────────────────────────── */}
    {mobileOpen && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
        {/* Drawer panel — slides from right (RTL) */}
        <div
          className="fixed inset-y-0 right-0 z-50 w-72 lg:hidden flex flex-col overflow-y-auto"
          style={{ background: 'var(--iq-surface)', borderLeft: '1px solid var(--iq-border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: 'var(--iq-border)' }}>
            <span className="font-extrabold text-lg gradient-text font-jakarta">InvestIQ</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/5"
              aria-label="סגור תפריט"
            >
              <X className="h-5 w-5" style={{ color: 'var(--iq-text-2)' }} />
            </button>
          </div>
          <nav className="p-3 flex-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 rounded-xl mb-1 text-sm font-medium transition-colors"
                  style={{
                    minHeight: '48px',
                    background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                    color: isActive ? '#6366f1' : 'var(--iq-text-2)',
                    alignItems: 'center',
                    display: 'flex',
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </nav>
          {/* Sign out in drawer */}
          <div className="p-3 border-t" style={{ borderColor: 'var(--iq-border)' }}>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="flex items-center gap-3 px-4 rounded-xl w-full text-sm font-medium transition-colors hover:bg-white/5"
              style={{ minHeight: '48px', color: 'var(--iq-red)' }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              התנתק
            </button>
          </div>
        </div>
      </>
    )}

    {/* ── Mobile Fullscreen Search Overlay ─────────────────────────── */}
    {searchOpen && (
      <div
        className="fixed inset-0 z-[60] flex flex-col md:hidden"
        style={{ background: 'var(--iq-surface)' }}
      >
        {/* Search bar row */}
        <div className="flex items-center gap-2 px-3 py-3 border-b" style={{ borderColor: 'var(--iq-border)' }}>
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--iq-text-3)' }} />
            <input
              ref={searchInputRef}
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearchOpen(false); setSearchVal('') }
                if (e.key === 'Enter' && searchVal.trim()) {
                  const ticker = /^\d+$/.test(searchVal.trim()) ? searchVal.trim() : searchVal.trim().toUpperCase()
                  router.push(`/stock/${ticker}`)
                  setSearchVal('')
                  setSearchOpen(false)
                }
              }}
              placeholder="חפש מניה, קרן או אג&quot;ח..."
              className="w-full h-10 rounded-xl pr-10 pl-3 text-sm outline-none focus:ring-1 focus:ring-indigo-500/40"
              style={{
                background: 'var(--iq-elevated)',
                border: '1px solid var(--iq-border)',
                color: 'var(--iq-text)',
              }}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => { setSearchOpen(false); setSearchVal('') }}
            className="shrink-0 p-2 rounded-lg hover:bg-white/5 text-sm font-medium"
            style={{ color: 'var(--iq-text-2)' }}
          >
            ביטול
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {searchLoading && (
            <div className="flex items-center justify-center py-10">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}
          {!searchLoading && searchResults.length > 0 && (
            <ul>
              {searchResults.map((r) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/stock/${r.symbol}`)
                      setSearchVal('')
                      setSearchOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b text-right hover:bg-white/5 transition-colors"
                    style={{ borderColor: 'var(--iq-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: 'var(--iq-text)' }}>{r.symbol}</div>
                      <div className="text-xs truncate mt-0.5" style={{ color: 'var(--iq-text-3)' }}>{r.name}</div>
                    </div>
                    {r.exchange && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ background: 'var(--iq-elevated)', color: 'var(--iq-text-3)', border: '1px solid var(--iq-border)' }}>
                        {r.exchange}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searchLoading && searchVal.trim() && searchResults.length === 0 && (
            <p className="text-center py-10 text-sm" style={{ color: 'var(--iq-text-3)' }}>
              לא נמצאו תוצאות עבור &ldquo;{searchVal}&rdquo;
            </p>
          )}
          {!searchVal.trim() && (
            <p className="text-center py-10 text-sm" style={{ color: 'var(--iq-text-3)' }}>
              הקלד סמל מניה או שם חברה
            </p>
          )}
        </div>
      </div>
    )}

    {/* ── Bottom Navigation Bar — mobile only ───────────────────────── */}
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex md:hidden"
      style={{
        background: 'var(--iq-surface)',
        borderTop: '1px solid var(--iq-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {BOTTOM_NAV.map(({ href, label, icon: Icon, center }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        if (center) {
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-colors"
              style={{ minHeight: '56px' }}
            >
              <div
                className="flex items-center justify-center rounded-xl w-10 h-10 transition-all"
                style={{
                  background: isActive ? '#6366f1' : 'rgba(99,102,241,0.18)',
                  boxShadow: isActive ? '0 0 12px rgba(99,102,241,0.5)' : 'none',
                }}
              >
                <Icon className="h-5 w-5" style={{ color: isActive ? '#fff' : '#818cf8' }} />
              </div>
              <span className="text-[10px] font-medium leading-none" style={{ color: isActive ? '#6366f1' : '#64748b' }}>
                {label}
              </span>
            </Link>
          )
        }
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
            style={{
              minHeight: '56px',
              color: isActive ? '#6366f1' : '#64748b',
            }}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </Link>
        )
      })}
    </nav>
    </>
  )
}
