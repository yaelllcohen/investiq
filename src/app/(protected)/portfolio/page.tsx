'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { Plus, Trash2, PlusCircle, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatPercent } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16']

const CURRENCIES = ['USD','ILS','EUR','GBP'] as const
const CURRENCY_SYMBOLS: Record<string, string> = { USD:'$', ILS:'₪', EUR:'€', GBP:'£' }
const CURRENCY_LABELS: Record<string, string>  = { USD:'USD ($)', ILS:'ILS (₪)', EUR:'EUR (€)', GBP:'GBP (£)' }

// All asset types grouped by category (form dropdown)
const CATEGORY_GROUPS = [
  { key: 'capital',     label: 'שוק ההון',          icon: '📈', types: ['stock','etf','mutual_fund','bond','crypto','forex'] },
  { key: 'longterm',    label: 'חיסכון ארוך טווח',  icon: '🏦', types: ['gemel','hishtalmut','pension','deposit'] },
  { key: 'realestate',  label: 'נדל"ן',              icon: '🏠', types: ['real_estate'] },
  { key: 'alternative', label: 'אלטרנטיבי',          icon: '💼', types: ['other','gold','p2p'] },
]

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: 'מניה', etf: 'ETF', mutual_fund: 'קרן נאמנות',
  gemel: 'קופת גמל', hishtalmut: 'קרן השתלמות', pension: 'פנסיה',
  bond: 'אג"ח', crypto: 'קריפטו', forex: 'Forex',
  deposit: 'פיקדון בנקאי', cash: 'מזומן', real_estate: 'נדל"ן',
  gold: 'זהב', p2p: 'P2P הלוואות', other: 'אחר',
}

const DEPOSIT_FREQ_LABELS: Record<string, string> = {
  monthly: 'חודשית', quarterly: 'רבעונית', yearly: 'שנתית',
}

// ─── Form variant logic ───────────────────────────────────────────────────────

type FormVariant = 'market' | 'fund' | 'longterm' | 'deposit' | 'simple'

function getVariant(assetType: string): FormVariant {
  if (['stock','etf','bond','crypto','forex'].includes(assetType)) return 'market'
  if (assetType === 'mutual_fund')                                  return 'fund'
  if (['gemel','hishtalmut','pension'].includes(assetType))         return 'longterm'
  if (assetType === 'deposit')                                      return 'deposit'
  return 'simple'  // real_estate, gold, p2p, cash, other
}

// For TABLE display grouping (deposit displays under longterm, gold/p2p under alternative)
function getCategoryForType(assetType: string): string {
  if (['stock','etf','mutual_fund','bond','crypto','forex'].includes(assetType)) return 'capital'
  if (['gemel','hishtalmut','pension','deposit'].includes(assetType))            return 'longterm'
  if (assetType === 'real_estate')                                               return 'realestate'
  return 'alternative'  // gold, p2p, cash, other
}

// For FORM: category key → group definition
function getCategoryGroup(key: string) {
  return CATEGORY_GROUPS.find(g => g.key === key)
}

function autoTicker(assetType: string, accountNumber: string, managingBody: string, name: string) {
  const pfx = assetType.toUpperCase().replace('_', '').slice(0, 8)
  const id = (accountNumber || managingBody || name).replace(/[^A-Z0-9א-ת]/gi, '').slice(0, 8).toUpperCase()
  return `${pfx}-${id || '001'}`.slice(0, 20)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Holding {
  id: string
  ticker: string
  name: string
  assetType: string
  currency: string
  quantity: number
  avgPrice: number
  manualPrice: number | null
  currentPrice: number
  priceSource: 'manual' | 'tase' | 'yahoo' | 'cost'
  value: number
  plAmount: number
  plPercent: number
  dailyChange: number
  dailyChangePercent: number
  purchaseDate?: string
  managingBody?: string | null
  accountNumber?: string | null
  track?: string | null
  monthlyDeposit?: number | null
  depositFrequency?: string | null
  interestRate?: number | null
  maturityDate?: string | null
}

interface CurrencyGroup {
  totalValue: number; totalCost: number; totalPL: number; totalPLPercent: number
}

interface PortfolioData {
  holdings: Holding[]
  byCurrency: Record<string, CurrencyGroup>
}

interface FormState {
  assetType: string
  name: string
  currency: string
  purchaseDate: string
  ticker: string
  quantity: string
  avgPrice: string
  managingBody: string
  accountNumber: string
  track: string
  monthlyDeposit: string
  depositFrequency: string
  interestRate: string
  maturityDate: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0]

function defaultForm(): FormState {
  return {
    assetType: 'stock', name: '', currency: 'USD', purchaseDate: today(),
    ticker: '', quantity: '', avgPrice: '',
    managingBody: '', accountNumber: '', track: '',
    monthlyDeposit: '', depositFrequency: 'monthly',
    interestRate: '', maturityDate: '',
  }
}

function fmt(v: number, c: string) { return formatCurrency(v, c) }
function sym(c: string) { return CURRENCY_SYMBOLS[c] ?? c }

function isTasePaperNumber(t: string) { return /^\d{6,9}$/.test(t) }

function getCountry(h: { ticker: string; assetType: string; currency: string }): string {
  const t = h.ticker
  if (h.assetType === 'crypto' || (t.includes('-') && !t.endsWith('.TA'))) return 'גלובלי 🌍'
  if (h.assetType === 'forex') return 'גלובלי 🌍'
  if (isTasePaperNumber(t) || t.endsWith('.TA')) return 'ישראל 🇮🇱'
  if (['gemel','hishtalmut','pension','mutual_fund','deposit','real_estate'].includes(h.assetType)) return 'ישראל 🇮🇱'
  if (h.currency === 'ILS') return 'ישראל 🇮🇱'
  if (h.currency === 'USD') return 'ארה"ב 🇺🇸'
  if (h.currency === 'EUR') return 'אירופה 🇪🇺'
  if (h.currency === 'GBP') return 'בריטניה 🇬🇧'
  return 'בינלאומי 🌐'
}
function normalizeTicker(ticker: string, currency: string) {
  const u = ticker.toUpperCase()
  if (currency === 'ILS' && u && !u.endsWith('.TA') && !isTasePaperNumber(u)) return u + '.TA'
  return u
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const router = useRouter()
  const [data, setData]           = useState<PortfolioData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('capital')
  const [form, setForm]           = useState<FormState>(defaultForm())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const [editPriceId, setEditPriceId]     = useState<string | null>(null)
  const [editPriceValue, setEditPriceValue] = useState('')

  const [addMoreTarget, setAddMoreTarget]     = useState<Holding | null>(null)
  const [addMoreQty, setAddMoreQty]           = useState('')
  const [addMorePrice, setAddMorePrice]       = useState('')
  const [addMoreSubmitting, setAddMoreSubmitting] = useState(false)
  const [addMoreError, setAddMoreError]       = useState<string | null>(null)

  const [editTarget, setEditTarget]           = useState<Holding | null>(null)
  const [editForm, setEditForm]               = useState<FormState>(defaultForm())
  const [editSubmitting, setEditSubmitting]   = useState(false)
  const [editError, setEditError]             = useState<string | null>(null)

  // Sector breakdown (fetched lazily after holdings load)
  const [sectorData, setSectorData]   = useState<{ name: string; value: number; percentage: number }[] | null>(null)
  const [sectorLoading, setSectorLoading] = useState(false)

  // AI scores from cache only (stock tickers → total score)
  const [aiScores, setAiScores] = useState<Record<string, number | null>>({})
  // Previous week's portfolio score (from localStorage for trend detection)
  const [prevWeekScore, setPrevWeekScore] = useState<number | null>(null)

  // ── Data fetch ────────────────────────────────────────────────────────────

  async function fetchPortfolio() {
    try {
      const res = await fetch('/api/portfolio')
      if (!res.ok) throw new Error('שגיאה בטעינת תיק')
      setData(await res.json())
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPortfolio() }, [])

  // Fetch sector breakdown after main data arrives
  useEffect(() => {
    if (!data?.holdings?.length) return
    setSectorLoading(true)
    fetch('/api/portfolio/sectors')
      .then(r => r.json())
      .then(json => { if (Array.isArray(json?.sectorData)) setSectorData(json.sectorData) })
      .catch(console.error)
      .finally(() => setSectorLoading(false))
  }, [data])

  // Fetch AI scores from cache only — single batch call
  useEffect(() => {
    if (!data?.holdings?.length) return
    const CAPITAL_TYPES = new Set(['stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'forex'])
    const tickers = [...new Set(
      data.holdings.filter(h => CAPITAL_TYPES.has(h.assetType)).map(h => h.ticker)
    )]
    if (!tickers.length) return

    fetch(`/api/portfolio/scores?tickers=${encodeURIComponent(tickers.join(','))}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { scores?: Record<string, number | null> } | null) => {
        if (d?.scores) setAiScores(d.scores)
      })
      .catch(console.error)
  }, [data])

  // ── Portfolio score localStorage (prev-week comparison) ───────────────────
  useEffect(() => {
    if (!data?.holdings?.length) return
    try {
      const stored = localStorage.getItem('iv_portfolio_score')
      if (stored) {
        const { score: s, timestamp: ts } = JSON.parse(stored) as { score: number; timestamp: number }
        const ageDays = (Date.now() - ts) / 86400000
        if (ageDays >= 4 && ageDays <= 14) setPrevWeekScore(s)
      }
    } catch { /* ignore */ }
  }, [data])

  // ── Form helpers ──────────────────────────────────────────────────────────

  const variant = getVariant(form.assetType)

  function setField(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  // Called when clicking a CATEGORY button — only resets assetType, keeps everything else
  function handleCategoryClick(catKey: string) {
    const group = getCategoryGroup(catKey)
    if (!group) return
    const firstType = group.types[0]
    const isILS = ['gemel','hishtalmut','pension','mutual_fund','real_estate','deposit'].includes(firstType)
    setSelectedCategory(catKey)
    setForm(f => ({ ...f, assetType: firstType, currency: isILS ? 'ILS' : f.currency }))
  }

  // Called when changing sub-type WITHIN a category — keeps all fields
  function handleAssetTypeChange(type: string) {
    const isILS = ['gemel','hishtalmut','pension','mutual_fund','real_estate','deposit'].includes(type)
    setForm(f => ({ ...f, assetType: type, currency: isILS ? 'ILS' : f.currency }))
  }

  function handleTickerChange(raw: string) {
    const u = raw.toUpperCase()
    const isTA     = u.endsWith('.TA')
    const isPaper  = isTasePaperNumber(u)
    const isCrypto = u.includes('-')   // BTC-USD, ETH-USD, etc. — never auto-ILS
    setForm(f => ({ ...f, ticker: u, currency: (isTA || isPaper) && !isCrypto ? 'ILS' : f.currency }))
  }

  function handleCurrencyChange(c: string) {
    setForm(f => {
      let ticker = f.ticker
      const isCrypto = ticker.includes('-')
      if (!isCrypto) {
        if (c === 'ILS' && ticker && !ticker.endsWith('.TA') && !isTasePaperNumber(ticker)) ticker += '.TA'
        else if (c !== 'ILS' && ticker.endsWith('.TA')) ticker = ticker.slice(0, -3)
      }
      return { ...f, currency: c, ticker }
    })
  }

  function markInvestmentScoreStale() {
    try { localStorage.setItem('iv_investment_score_stale', '1') } catch {}
  }

  // ── Add holding ───────────────────────────────────────────────────────────

  async function handleAddHolding(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      let ticker: string
      let quantity: number
      switch (variant) {
        case 'market': ticker = normalizeTicker(form.ticker, form.currency); quantity = parseFloat(form.quantity); break
        case 'fund':   ticker = form.ticker.replace(/\D/g, '') || form.ticker; quantity = parseFloat(form.quantity); break
        default:       ticker = autoTicker(form.assetType, form.accountNumber, form.managingBody, form.name); quantity = 1; break
      }

      const body: Record<string, unknown> = {
        ticker, name: form.name, assetType: form.assetType, currency: form.currency,
        purchaseDate: new Date(form.purchaseDate).toISOString(),
        quantity, avgPrice: parseFloat(form.avgPrice),
      }
      if (form.managingBody)     body.managingBody     = form.managingBody
      if (form.accountNumber)    body.accountNumber    = form.accountNumber
      if (form.track)            body.track            = form.track
      if (form.monthlyDeposit)   body.monthlyDeposit   = parseFloat(form.monthlyDeposit)
      if (form.depositFrequency) body.depositFrequency = form.depositFrequency
      if (form.interestRate)     body.interestRate     = parseFloat(form.interestRate)
      if (form.maturityDate)     body.maturityDate     = form.maturityDate

      const res  = await fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'הוספת האחזקה נכשלה')
      markInvestmentScoreStale()
      setShowAdd(false); setForm(defaultForm()); setSelectedCategory('capital'); await fetchPortfolio()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally { setSubmitting(false) }
  }

  // ── Manual price ──────────────────────────────────────────────────────────

  async function saveManualPrice(id: string) {
    const price = parseFloat(editPriceValue)
    if (!price || price <= 0) return
    await fetch(`/api/portfolio/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualPrice: price }),
    })
    setEditPriceId(null); setEditPriceValue(''); await fetchPortfolio()
  }

  async function clearManualPrice(id: string) {
    await fetch(`/api/portfolio/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualPrice: null }),
    })
    await fetchPortfolio()
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    await fetch('/api/portfolio', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
    markInvestmentScoreStale()
    await fetchPortfolio()
  }

  // ── Add more (market assets only) ─────────────────────────────────────────

  async function handleAddMore(e: React.FormEvent) {
    e.preventDefault()
    if (!addMoreTarget) return
    setAddMoreSubmitting(true); setAddMoreError(null)
    try {
      const res  = await fetch(`/api/portfolio/${addMoreTarget.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addedQuantity: parseFloat(addMoreQty), addedPrice: parseFloat(addMorePrice) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'העדכון נכשל')
      markInvestmentScoreStale()
      setAddMoreTarget(null); setAddMoreQty(''); setAddMorePrice(''); await fetchPortfolio()
    } catch (e) {
      setAddMoreError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally { setAddMoreSubmitting(false) }
  }

  // ── Edit holding ─────────────────────────────────────────────────────────

  function handleEditOpen(h: Holding) {
    setEditTarget(h)
    setEditError(null)
    setEditForm({
      assetType:        h.assetType,
      name:             h.name,
      currency:         h.currency,
      purchaseDate:     h.purchaseDate ? h.purchaseDate.split('T')[0] : today(),
      ticker:           h.ticker,
      quantity:         String(h.quantity),
      avgPrice:         String(h.avgPrice),
      managingBody:     h.managingBody ?? '',
      accountNumber:    h.accountNumber ?? '',
      track:            h.track ?? '',
      monthlyDeposit:   h.monthlyDeposit != null ? String(h.monthlyDeposit) : '',
      depositFrequency: h.depositFrequency ?? 'monthly',
      interestRate:     h.interestRate  != null ? String(h.interestRate)  : '',
      maturityDate:     h.maturityDate  ? new Date(h.maturityDate).toISOString().split('T')[0] : '',
    })
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditSubmitting(true)
    setEditError(null)
    try {
      const body: Record<string, unknown> = {
        name:        editForm.name,
        quantity:    parseFloat(editForm.quantity),
        avgPrice:    parseFloat(editForm.avgPrice),
        assetType:   editForm.assetType,
        currency:    editForm.currency,
        purchaseDate: new Date(editForm.purchaseDate).toISOString(),
      }
      if (editForm.managingBody)   body.managingBody   = editForm.managingBody
      if (editForm.accountNumber)  body.accountNumber  = editForm.accountNumber
      if (editForm.track)          body.track          = editForm.track
      if (editForm.monthlyDeposit) body.monthlyDeposit = parseFloat(editForm.monthlyDeposit)
      if (editForm.depositFrequency) body.depositFrequency = editForm.depositFrequency
      if (editForm.interestRate)   body.interestRate   = parseFloat(editForm.interestRate)
      if (editForm.maturityDate)   body.maturityDate   = editForm.maturityDate

      const res  = await fetch(`/api/portfolio/${editTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'העדכון נכשל')
      markInvestmentScoreStale()
      setEditTarget(null)
      await fetchPortfolio()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'שגיאה לא ידועה')
    } finally { setEditSubmitting(false) }
  }

  // ── Derived data (ALL hooks before any early return) ─────────────────────

  const holdings   = useMemo(() => data?.holdings ?? [], [data])
  const byCurrency = useMemo(() => data?.byCurrency ?? {}, [data])
  const currencies = useMemo(() => Object.keys(byCurrency), [byCurrency])

  const pieData       = useMemo(() => holdings.map(h => ({ name: h.ticker, label: h.name, value: h.value, currency: h.currency })), [holdings])
  const totalPieValue = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData])
  const barData       = useMemo(() => holdings.map(h => ({ ticker: h.ticker, pl: h.plAmount, currency: h.currency })), [holdings])

  const countryData = useMemo(() => {
    if (!holdings.length) return []
    const map: Record<string, number> = {}
    for (const h of holdings) {
      const c = getCountry(h)
      map[c] = (map[c] ?? 0) + h.value
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0)
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? Math.round(value / total * 1000) / 10 : 0,
      }))
  }, [holdings])

  const grouped = useMemo(() => {
    const g: Record<string, Holding[]> = {}
    for (const h of holdings) {
      const cat = getCategoryForType(h.assetType)
      if (!g[cat]) g[cat] = []
      g[cat].push(h)
    }
    return g
  }, [holdings])

  // Daily P&L per currency: sum(dailyChange * quantity) for market assets
  const dailyPLByCurrency = useMemo(() => {
    const map: Record<string, number> = {}
    for (const h of holdings) {
      const c = h.currency ?? 'USD'
      map[c] = (map[c] ?? 0) + (h.dailyChange ?? 0) * h.quantity
    }
    return map
  }, [holdings])

  // Weighted portfolio score from cached AI scores
  const portfolioScore = useMemo(() => {
    const scored = holdings.filter(h => aiScores[h.ticker] != null && !isMoneyMarketFund(h))
    if (scored.length < 3) return null
    const totalValue = scored.reduce((s, h) => s + (h.value ?? 0), 0)
    if (totalValue <= 0) return null
    const weighted = scored.reduce((s, h) => s + (aiScores[h.ticker]!) * (h.value ?? 0), 0)
    return {
      score:      Math.round(weighted / totalValue),
      scoredCount: scored.length,
      totalCount:  holdings.length,
    }
  }, [holdings, aiScores])

  // Save score to localStorage for next-week comparison
  useEffect(() => {
    if (!portfolioScore) return
    try {
      localStorage.setItem('iv_portfolio_score', JSON.stringify({ score: portfolioScore.score, timestamp: Date.now() }))
    } catch { /* ignore */ }
  }, [portfolioScore])

  const portfolioInsights = useMemo(() => {
    if (!holdings.length) return []
    const insights: string[] = []
    const totalValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0)

    // Concentration
    const maxH = holdings.reduce((a, b) => (a.value ?? 0) > (b.value ?? 0) ? a : b, holdings[0])
    if (maxH && totalValue > 0 && (maxH.value ?? 0) / totalValue > 0.4) {
      insights.push(`⚠️ ריכוזיות גבוהה ב-${maxH.name || maxH.ticker}`)
    }

    // No protective assets
    const hasProtection = holdings.some(h =>
      ['bond', 'deposit', 'cash', 'gemel', 'hishtalmut', 'pension'].includes(h.assetType)
    )
    if (!hasProtection) insights.push('⚠️ אין רכיב מגן בתיק')

    // All-green day
    const mktHoldings = holdings.filter(h =>
      ['stock', 'etf', 'mutual_fund', 'crypto', 'bond', 'forex'].includes(h.assetType)
    )
    if (mktHoldings.length > 0 && mktHoldings.every(h => (h.dailyChangePercent ?? 0) > 0)) {
      insights.push('✅ יום ירוק לכל האחזקות')
    }

    // Score trend vs last week
    if (prevWeekScore !== null && portfolioScore && portfolioScore.score < prevWeekScore) {
      insights.push('📉 ציון התיק ירד השבוע')
    }

    return insights
  }, [holdings, portfolioScore, prevWeekScore])

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
          <span className="text-zinc-400 text-sm">טוען תיק...</span>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">

      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 tracking-wider uppercase">תיק השקעות</h1>
            <p className="text-xs text-zinc-500 mt-0.5">אחזקות וביצועים</p>
          </div>
          <Button onClick={() => { setShowAdd(true); setFormError(null) }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 px-3 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> הוסף אחזקה
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        {pageError && (
          <div className="bg-red-950/50 border border-red-800 text-red-400 px-4 py-2 rounded text-sm">{pageError}</div>
        )}

        {/* ── Currency Summary ────────────────────────────────────── */}
        {currencies.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-6 text-center text-zinc-500 text-sm">
            אין אחזקות עדיין. הוסף פוזיציה ראשונה.
          </div>
        ) : (
          <div className="space-y-3">
            {currencies.map(c => {
              const g = byCurrency[c]
              const dailyPL  = dailyPLByCurrency[c] ?? 0
              const prevValue = g.totalValue - dailyPL
              const dailyPct  = prevValue > 0.001 ? (dailyPL / prevValue) * 100 : 0
              return (
                <div key={c}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">סיכום — {c}</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <SCard label="שווי כולל"     value={fmt(g.totalValue, c)} />
                    <SCard label="עלות / הושקע"  value={fmt(g.totalCost, c)} />
                    <SCard label={`רווח (${sym(c)})`} value={fmt(g.totalPL, c)}
                      positive={g.totalPL > 0} negative={g.totalPL < 0} />
                    <SCard label='רווח (%)' value={formatPercent(g.totalPLPercent)}
                      positive={g.totalPLPercent > 0} negative={g.totalPLPercent < 0} />
                  </div>
                  <div className="mt-2">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-700 mb-1.5">שינוי יומי</p>
                    <div className="grid grid-cols-2 gap-3">
                      <SCard label={`שינוי יומי (${sym(c)})`}
                        value={(dailyPL > 0 ? '+' : '') + fmt(dailyPL, c)}
                        positive={dailyPL > 0} negative={dailyPL < 0} />
                      <SCard label="שינוי יומי (%)"
                        value={formatPercent(dailyPct)}
                        positive={dailyPct > 0} negative={dailyPct < 0} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Portfolio Score Card ────────────────────────────────── */}
        {portfolioScore ? (
          <PortfolioScoreCard
            score={portfolioScore.score}
            scoredCount={portfolioScore.scoredCount}
            totalCount={portfolioScore.totalCount}
            insights={portfolioInsights}
          />
        ) : Object.values(aiScores).some(s => s !== null) && holdings.length >= 3 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-500">
            חשב ציונים לפחות ל-3 נכסים לקבלת ציון תיק
          </div>
        ) : null}

        {/* ── Holdings by category ────────────────────────────────── */}
        {CATEGORY_GROUPS.map(group => {
          const group_holdings = grouped[group.key]
          if (!group_holdings?.length) return null
          return (
            <section key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">{group.icon}</span>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{group.label}</h2>
                <span className="text-[10px] text-zinc-600 font-mono">{group_holdings.length} אחזקות</span>
              </div>

              {group.key === 'capital' && (
                <CapitalTable holdings={group_holdings}
                  editPriceId={editPriceId} editPriceValue={editPriceValue}
                  setEditPriceId={setEditPriceId} setEditPriceValue={setEditPriceValue}
                  saveManualPrice={saveManualPrice} clearManualPrice={clearManualPrice}
                  openAddMore={h => { setAddMoreTarget(h); setAddMoreQty(''); setAddMorePrice(''); setAddMoreError(null) }}
                  onDelete={handleDelete}
                  onEdit={handleEditOpen}
                  aiScores={aiScores}
                  onRowClick={ticker => router.push(`/stock/${encodeURIComponent(ticker)}`)} />
              )}

              {group.key === 'longterm' && (() => {
                const savings = group_holdings.filter(h => ['gemel','hishtalmut','pension'].includes(h.assetType))
                const deposits = group_holdings.filter(h => h.assetType === 'deposit')
                return (
                  <div className="space-y-3">
                    {savings.length > 0 && (
                      <LongtermTable holdings={savings}
                        editPriceId={editPriceId} editPriceValue={editPriceValue}
                        setEditPriceId={setEditPriceId} setEditPriceValue={setEditPriceValue}
                        saveManualPrice={saveManualPrice} clearManualPrice={clearManualPrice}
                        onDelete={handleDelete}
                        onEdit={handleEditOpen} />
                    )}
                    {deposits.length > 0 && (
                      <SimpleTable holdings={deposits}
                        editPriceId={editPriceId} editPriceValue={editPriceValue}
                        setEditPriceId={setEditPriceId} setEditPriceValue={setEditPriceValue}
                        saveManualPrice={saveManualPrice} clearManualPrice={clearManualPrice}
                        onDelete={handleDelete}
                        onEdit={handleEditOpen} />
                    )}
                  </div>
                )
              })()}

              {(group.key === 'realestate' || group.key === 'alternative') && (
                <SimpleTable holdings={group_holdings}
                  editPriceId={editPriceId} editPriceValue={editPriceValue}
                  setEditPriceId={setEditPriceId} setEditPriceValue={setEditPriceValue}
                  saveManualPrice={saveManualPrice} clearManualPrice={clearManualPrice}
                  onDelete={handleDelete}
                  onEdit={handleEditOpen} />
              )}
            </section>
          )
        })}

        {/* ── Charts ─────────────────────────────────────────────── */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">הקצאה</h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0] as { value: number; payload: { label: string; currency: string } }
                    const pct = totalPieValue > 0 ? (d.value / totalPieValue * 100).toFixed(1) : '0'
                    return (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 shadow-lg whitespace-nowrap">
                        <span className="font-medium">{d.payload.label}</span>
                        <span className="text-zinc-500 mx-1.5">|</span>
                        <span>{formatCurrency(d.value, d.payload.currency)}</span>
                        <span className="text-zinc-500 mx-1.5">|</span>
                        <span className="text-zinc-300">{pct}%</span>
                      </div>
                    )
                  }} />
                  <Legend wrapperStyle={{ fontSize:'11px', color:'#a1a1aa' }} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">רווח/הפסד לפי אחזקה</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top:5, right:10, left:10, bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="ticker" tick={{ fill:'#71717a', fontSize:11 }} axisLine={{ stroke:'#3f3f46' }} tickLine={false} />
                  <YAxis tick={{ fill:'#71717a', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
                  <Tooltip contentStyle={{ backgroundColor:'#18181b', border:'1px solid #3f3f46', borderRadius:'6px', color:'#e4e4e7', fontSize:'11px' }}
                    formatter={(v, _n, p) => [fmt(Number(v ?? 0), (p.payload as { currency?: string })?.currency ?? 'USD'), 'רו"ה']} />
                  <Bar dataKey="pl" radius={[3,3,0,0]}>
                    {barData.map((e, i) => <Cell key={i} fill={e.pl >= 0 ? '#22c55e' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Sector & Country Breakdown ───────────────────────────────────── */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Sector chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">פיזור לפי סקטורים</h2>
              {sectorLoading ? (
                <div className="flex items-center justify-center h-[280px]">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
                </div>
              ) : sectorData && sectorData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={sectorData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {sectorData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0] as { value: number; payload: { name: string; percentage: number } }
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 shadow-lg whitespace-nowrap">
                          <span className="font-medium">{d.payload.name}</span>
                          <span className="text-zinc-500 mx-1.5">|</span>
                          <span className="text-zinc-300">{d.payload.percentage}%</span>
                        </div>
                      )
                    }} />
                    <Legend wrapperStyle={{ fontSize:'11px', color:'#a1a1aa' }} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-zinc-600 text-xs">
                  אין נתוני סקטור
                </div>
              )}
            </div>

            {/* Country chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">פיזור לפי מדינות</h2>
              {countryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={countryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {countryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0] as { value: number; payload: { name: string; percentage: number } }
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 shadow-lg whitespace-nowrap">
                          <span className="font-medium">{d.payload.name}</span>
                          <span className="text-zinc-500 mx-1.5">|</span>
                          <span className="text-zinc-300">{d.payload.percentage}%</span>
                        </div>
                      )
                    }} />
                    <Legend wrapperStyle={{ fontSize:'11px', color:'#a1a1aa' }} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-zinc-600 text-xs">
                  אין נתונים
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add More Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!addMoreTarget} onOpenChange={o => { if (!o) { setAddMoreTarget(null); setAddMoreError(null) } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 font-mono text-base">הוסף עוד — {addMoreTarget?.ticker}</DialogTitle>
          </DialogHeader>
          {addMoreTarget && (
            <div className="text-xs text-zinc-500 -mt-2 mb-1 space-y-0.5">
              <p>כמות נוכחית: <span className="text-zinc-300">{addMoreTarget.quantity}</span></p>
              <p>מחיר ממוצע: <span className="text-zinc-300">{fmt(addMoreTarget.avgPrice, addMoreTarget.currency)}</span></p>
            </div>
          )}
          <form onSubmit={handleAddMore} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">כמות שקניתי</Label>
                <Input type="number" min="0" step="any" value={addMoreQty} onChange={e => setAddMoreQty(e.target.value)}
                  placeholder="10" required autoFocus
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">מחיר ששילמתי ({addMoreTarget ? sym(addMoreTarget.currency) : ''})</Label>
                <Input type="number" min="0" step="any" value={addMorePrice} onChange={e => setAddMorePrice(e.target.value)}
                  placeholder="150.00" required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
            </div>
            {addMoreTarget && addMoreQty && addMorePrice && (() => {
              const aq = parseFloat(addMoreQty), ap = parseFloat(addMorePrice)
              if (!aq || !ap || aq <= 0 || ap <= 0) return null
              const newQty = addMoreTarget.quantity + aq
              const newAvg = (addMoreTarget.quantity * addMoreTarget.avgPrice + aq * ap) / newQty
              return (
                <div className="bg-zinc-800/60 border border-zinc-700 rounded px-3 py-2 text-xs space-y-1">
                  <p className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px]">תוצאה צפויה</p>
                  <p>כמות חדשה: <span className="text-zinc-200 font-medium">{newQty.toFixed(4).replace(/\.?0+$/, '')}</span></p>
                  <p>מחיר ממוצע חדש: <span className="text-blue-400 font-medium">{fmt(newAvg, addMoreTarget.currency)}</span></p>
                </div>
              )
            })()}
            {addMoreError && <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{addMoreError}</p>}
            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={() => { setAddMoreTarget(null); setAddMoreError(null) }}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-8">ביטול</Button>
              <Button type="submit" disabled={addMoreSubmitting} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8">
                {addMoreSubmitting ? 'מעדכן...' : 'עדכן אחזקה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Holding Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) { setEditTarget(null); setEditError(null) } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 font-mono text-base">ערוך אחזקה — {editTarget?.ticker}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={handleEditSave} className="space-y-4 mt-1">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">שם</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">כמות</Label>
                  <Input type="number" min="0.000001" step="any" value={editForm.quantity}
                    onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                    required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מחיר ממוצע / עלות ({sym(editForm.currency)})</Label>
                  <Input type="number" min="0" step="any" value={editForm.avgPrice}
                    onChange={e => setEditForm(f => ({ ...f, avgPrice: e.target.value }))}
                    required className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מטבע</Label>
                  <Select value={editForm.currency} onValueChange={c => setEditForm(f => ({ ...f, currency: c }))}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{CURRENCY_LABELS[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">תאריך רכישה</Label>
                  <Input type="date" value={editForm.purchaseDate}
                    onChange={e => setEditForm(f => ({ ...f, purchaseDate: e.target.value }))}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                </div>
              </div>
              {/* Long-term savings extra fields */}
              {['gemel','hishtalmut','pension'].includes(editForm.assetType) && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">גוף מנהל</Label>
                      <Input value={editForm.managingBody}
                        onChange={e => setEditForm(f => ({ ...f, managingBody: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">מסלול</Label>
                      <Input value={editForm.track}
                        onChange={e => setEditForm(f => ({ ...f, track: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">הפקדה חודשית (₪)</Label>
                      <Input type="number" min="0" step="any" value={editForm.monthlyDeposit}
                        onChange={e => setEditForm(f => ({ ...f, monthlyDeposit: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">תדירות</Label>
                      <Select value={editForm.depositFrequency} onValueChange={v => setEditForm(f => ({ ...f, depositFrequency: v }))}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(DEPOSIT_FREQ_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
              {/* Deposit extra fields */}
              {editForm.assetType === 'deposit' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">ריבית (%)</Label>
                    <Input type="number" min="0" step="0.01" max="100" value={editForm.interestRate}
                      onChange={e => setEditForm(f => ({ ...f, interestRate: e.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs">תאריך פדיון</Label>
                    <Input type="date" value={editForm.maturityDate}
                      onChange={e => setEditForm(f => ({ ...f, maturityDate: e.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                  </div>
                </div>
              )}
              {editError && <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{editError}</p>}
              <DialogFooter className="pt-1">
                <Button type="button" variant="outline" onClick={() => { setEditTarget(null); setEditError(null) }}
                  className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-8">ביטול</Button>
                <Button type="submit" disabled={editSubmitting} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8">
                  {editSubmitting ? 'שומר...' : 'שמור שינויים'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Holding Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={o => { setShowAdd(o); if (!o) { setForm(defaultForm()); setSelectedCategory('capital'); setFormError(null) } }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 font-mono text-base">הוסף אחזקה</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddHolding} className="space-y-4 mt-1">

            {/* ── Category buttons ── */}
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs">קטגוריית השקעה</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORY_GROUPS.map(g => (
                  <button key={g.key} type="button"
                    onClick={() => handleCategoryClick(g.key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded text-xs font-semibold border transition-all ${
                      selectedCategory === g.key
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-900'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                    }`}>
                    <span>{g.icon}</span><span>{g.label}</span>
                  </button>
                ))}
              </div>

              {/* Sub-type dropdown — only for categories with meaningful choice */}
              {['capital','longterm'].includes(selectedCategory) && (
                <Select value={form.assetType} onValueChange={handleAssetTypeChange}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs">
                    <SelectValue placeholder="בחר סוג נכס" />
                  </SelectTrigger>
                  <SelectContent>
                    {(getCategoryGroup(selectedCategory)?.types ?? []).map(t => (
                      <SelectItem key={t} value={t} className="text-xs">{ASSET_TYPE_LABELS[t] ?? t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Alternative: compact inline type chips */}
              {selectedCategory === 'alternative' && (
                <div className="flex gap-1.5">
                  {(getCategoryGroup('alternative')?.types ?? []).map(t => (
                    <button key={t} type="button"
                      onClick={() => handleAssetTypeChange(t)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                        form.assetType === t
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                      }`}>
                      {ASSET_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Name field ── */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">
                {form.assetType === 'real_estate' ? 'כתובת / תיאור הנכס'
                  : ['gemel','hishtalmut'].includes(form.assetType) ? 'שם הקופה'
                  : form.assetType === 'pension' ? 'שם קרן הפנסיה'
                  : form.assetType === 'deposit' ? 'שם הפיקדון'
                  : ['gold','p2p','other','cash'].includes(form.assetType) ? 'שם הנכס'
                  : 'שם'}
              </Label>
              <Input value={form.name} onChange={e => setField('name', e.target.value)}
                placeholder={
                  form.assetType === 'real_estate' ? 'דירה ברחוב הרצל 10, תל אביב'
                    : ['gemel','hishtalmut'].includes(form.assetType) ? 'קופת גמל מיטב דש'
                    : form.assetType === 'pension' ? 'קרן פנסיה הראל'
                    : form.assetType === 'deposit' ? 'פיקדון בנק לאומי'
                    : form.assetType === 'mutual_fund' ? 'תכלית סל ת"א 35'
                    : ['gold','p2p','other'].includes(form.assetType) ? 'שם / תיאור'
                    : 'Apple Inc.'
                }
                required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
            </div>

            {/* ── שוק ההון: מניה / ETF / אג"ח / קריפטו / Forex ── */}
            {['stock','etf','bond','crypto','forex'].includes(form.assetType) && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">סמל</Label>
                  <Input value={form.ticker} onChange={e => handleTickerChange(e.target.value)}
                    placeholder={
                      form.assetType === 'crypto' ? 'BTC-USD'
                        : form.assetType === 'forex' ? 'EURUSD=X'
                        : form.currency === 'ILS' ? 'TEVA.TA'
                        : 'AAPL'
                    } required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs uppercase" />
                  {form.assetType === 'crypto' && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">BTC-USD · ETH-USD · SOL-USD · BNB-USD</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מטבע</Label>
                  <Select value={form.currency} onValueChange={handleCurrencyChange}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{CURRENCY_LABELS[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">כמות</Label>
                  <Input type="number" min="0" step="any" value={form.quantity} onChange={e => setField('quantity', e.target.value)}
                    placeholder="10" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מחיר ממוצע ({sym(form.currency)})</Label>
                  <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                    placeholder="185.50" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
              </div>
            </>)}

            {/* ── קרן נאמנות ── */}
            {form.assetType === 'mutual_fund' && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מספר קרן</Label>
                  <Input value={form.ticker} onChange={e => setField('ticker', e.target.value)}
                    placeholder="1143700" required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מטבע</Label>
                  <Select value={form.currency} onValueChange={v => setField('currency', v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{CURRENCY_LABELS[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">כמות יחידות</Label>
                  <Input type="number" min="0" step="any" value={form.quantity} onChange={e => setField('quantity', e.target.value)}
                    placeholder="500" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מחיר ממוצע ליחידה (₪)</Label>
                  <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                    placeholder="100.00" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
              </div>
            </>)}

            {/* ── קופת גמל / קרן השתלמות ── */}
            {['gemel','hishtalmut'].includes(form.assetType) && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">גוף מנהל</Label>
                  <Input value={form.managingBody} onChange={e => setField('managingBody', e.target.value)}
                    placeholder="מיטב דש / הראל / מנורה" required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מספר קופה</Label>
                  <Input value={form.accountNumber} onChange={e => setField('accountNumber', e.target.value)}
                    placeholder="123456789"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">מסלול השקעה</Label>
                <Input value={form.track} onChange={e => setField('track', e.target.value)}
                  placeholder="מניות עד גיל 50 / מסלול כללי"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">שווי נוכחי (₪)</Label>
                  <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                    placeholder="150,000" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">הפקדה חודשית (₪)</Label>
                  <Input type="number" min="0" step="any" value={form.monthlyDeposit} onChange={e => setField('monthlyDeposit', e.target.value)}
                    placeholder="1,500"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
              </div>
            </>)}

            {/* ── פנסיה ── */}
            {form.assetType === 'pension' && (<>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">גוף מנהל</Label>
                <Input value={form.managingBody} onChange={e => setField('managingBody', e.target.value)}
                  placeholder="הראל / מגדל / מנורה" required
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">מסלול</Label>
                <Input value={form.track} onChange={e => setField('track', e.target.value)}
                  placeholder="מסלול כללי / מסלול מניות"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">צבירה נוכחית (₪)</Label>
                <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                  placeholder="350,000" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
              </div>
            </>)}

            {/* ── פיקדון בנקאי ── */}
            {form.assetType === 'deposit' && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">בנק / מוסד</Label>
                  <Input value={form.managingBody} onChange={e => setField('managingBody', e.target.value)}
                    placeholder="בנק לאומי" required
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">ריבית שנתית (%)</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={form.interestRate} onChange={e => setField('interestRate', e.target.value)}
                    placeholder="4.5"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">תאריך סיום</Label>
                  <Input type="date" value={form.maturityDate} onChange={e => setField('maturityDate', e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">סכום הפיקדון (₪)</Label>
                  <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                    placeholder="50,000" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
              </div>
            </>)}

            {/* ── נדל"ן ── */}
            {form.assetType === 'real_estate' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">שווי נוכחי</Label>
                  <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                    placeholder="1,500,000" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מטבע</Label>
                  <Select value={form.currency} onValueChange={v => setField('currency', v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{CURRENCY_LABELS[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ── אלטרנטיבי: זהב / P2P / אחר ── */}
            {['gold','p2p','other','cash'].includes(form.assetType) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">שווי נוכחי</Label>
                  <Input type="number" min="0" step="any" value={form.avgPrice} onChange={e => setField('avgPrice', e.target.value)}
                    placeholder="10,000" required className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">מטבע</Label>
                  <Select value={form.currency} onValueChange={v => setField('currency', v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{CURRENCY_LABELS[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ── תאריך (always) ── */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">
                {form.assetType === 'deposit' ? 'תאריך פתיחה'
                  : form.assetType === 'real_estate' ? 'תאריך רכישה'
                  : 'תאריך קנייה'}
              </Label>
              <Input type="date" value={form.purchaseDate} onChange={e => setField('purchaseDate', e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-xs" />
            </div>

            {formError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded px-3 py-2">{formError}</p>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setForm(defaultForm()); setSelectedCategory('capital'); setFormError(null) }}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-100 text-xs h-8">ביטול</Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8">
                {submitting ? 'מוסיף...' : 'הוסף אחזקה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Portfolio Score Card ─────────────────────────────────────────────────────

function PortfolioScoreCard({ score, scoredCount, totalCount, insights }: {
  score: number; scoredCount: number; totalCount: number; insights: string[]
}) {
  const color = score >= 85 ? '#22c55e' : score >= 70 ? '#3b82f6' : score >= 55 ? '#f59e0b' : '#ef4444'
  const label = score >= 85 ? 'תיק מצוין 🌟' : score >= 70 ? 'תיק טוב ✅' : score >= 55 ? 'תיק בינוני ⚠️' : 'תיק בסיכון ❌'
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">ציון תיק כולל</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-bold font-mono" style={{ color }}>{score}</span>
            <span className="text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap"
              style={{ color, background: color + '18', border: `1px solid ${color}40` }}>
              {label}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1">מבוסס על {scoredCount}/{totalCount} אחזקות</p>
        </div>
        <div className="flex flex-col items-end justify-center gap-1.5 pt-1 shrink-0">
          <div className="h-2 w-32 rounded-full overflow-hidden bg-zinc-800">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${score}%`, background: color }} />
          </div>
          <p className="text-[10px] text-zinc-600">{score}/100</p>
        </div>
      </div>
      {insights.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
          {insights.map((ins, i) => (
            <span key={i} className="text-[11px] text-zinc-300 bg-zinc-800/80 border border-zinc-700 px-2.5 py-1 rounded-md">
              {ins}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SCard({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const color = positive ? 'text-green-400' : negative ? 'text-red-400' : 'text-zinc-100'
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
    </div>
  )
}

// ─── Shared inline price editor cell ─────────────────────────────────────────

interface PriceEditorProps {
  h: Holding
  editPriceId: string | null
  editPriceValue: string
  setEditPriceId: (id: string | null) => void
  setEditPriceValue: (v: string) => void
  saveManualPrice: (id: string) => void
  clearManualPrice: (id: string) => void
  label?: string
}

function PriceCell({ h, editPriceId, editPriceValue, setEditPriceId, setEditPriceValue, saveManualPrice, clearManualPrice, label }: PriceEditorProps) {
  if (editPriceId === h.id) {
    return (
      <div className="flex items-center gap-1">
        <input type="number" min="0" step="any" value={editPriceValue} autoFocus
          onChange={e => setEditPriceValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveManualPrice(h.id); if (e.key === 'Escape') { setEditPriceId(null); setEditPriceValue('') } }}
          className="w-24 bg-zinc-700 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none" />
        <button onClick={() => saveManualPrice(h.id)} className="text-green-400 hover:text-green-300"><Check className="h-3 w-3" /></button>
        <button onClick={() => { setEditPriceId(null); setEditPriceValue('') }} className="text-zinc-500 hover:text-zinc-300"><X className="h-3 w-3" /></button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 group">
      <span className={h.priceSource === 'cost' ? 'text-zinc-500' : 'text-zinc-300'}>{label ?? formatCurrency(h.currentPrice, h.currency)}</span>
      {h.priceSource === 'manual' && <span className="text-[9px] px-1 rounded bg-amber-900/50 text-amber-400 border border-amber-800/50">ידני</span>}
      {h.priceSource === 'cost' && <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">אין נתון</span>}
      <button onClick={() => { setEditPriceId(h.id); setEditPriceValue(String(h.manualPrice ?? h.currentPrice)) }}
        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-blue-400 transition-all" title="עדכן מחיר">
        <Pencil className="h-3 w-3" />
      </button>
      {h.priceSource === 'manual' && (
        <button onClick={() => clearManualPrice(h.id)}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all" title="הסר מחיר ידני">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// ─── Capital Market Table ────────────────────────────────────────────────────

interface TableCommonProps {
  holdings: Holding[]
  editPriceId: string | null
  editPriceValue: string
  setEditPriceId: (id: string | null) => void
  setEditPriceValue: (v: string) => void
  saveManualPrice: (id: string) => void
  clearManualPrice: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (h: Holding) => void
}

const NON_NAVIGABLE_TYPES = new Set(['cash', 'deposit', 'real_estate', 'gemel', 'hishtalmut', 'pension', 'gold', 'p2p', 'other'])

function isMoneyMarketFund(h: { assetType: string; name: string }): boolean {
  if (h.assetType !== 'mutual_fund') return false
  const lower = (h.name ?? '').toLowerCase()
  return lower.includes('כספי') || lower.includes('money market')
}

function CapitalTable({ holdings, editPriceId, editPriceValue, setEditPriceId, setEditPriceValue, saveManualPrice, clearManualPrice, onDelete, onEdit, openAddMore, aiScores, onRowClick }: TableCommonProps & { openAddMore: (h: Holding) => void; aiScores?: Record<string, number | null>; onRowClick?: (ticker: string) => void }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">

      {/* ── Mobile cards (shown below md) ── */}
      <div className="md:hidden divide-y divide-zinc-800">
        {holdings.map(h => {
          const isNavigable = !NON_NAVIGABLE_TYPES.has(h.assetType) && !!onRowClick
          const sc = isMoneyMarketFund(h) ? null : (aiScores?.[h.ticker] ?? null)
          const scColor = sc != null ? (sc >= 75 ? '#22c55e' : sc >= 60 ? '#eab308' : sc >= 40 ? '#f97316' : '#ef4444') : null
          return (
            <div
              key={h.id}
              className={`p-4 ${isNavigable ? 'cursor-pointer active:bg-zinc-800/70' : ''}`}
              onClick={isNavigable ? (e) => {
                if ((e.target as HTMLElement).closest('button, input')) return
                onRowClick(h.ticker)
              } : undefined}
            >
              {/* Row 1: ticker + type + score */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-blue-400">{h.ticker}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                    {ASSET_TYPE_LABELS[h.assetType] ?? h.assetType}
                  </span>
                </div>
                {isMoneyMarketFund(h) ? (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
                    שמרני
                  </span>
                ) : sc != null && scColor ? (
                  <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
                    style={{ background: scColor + '18', color: scColor, border: `1px solid ${scColor}40` }}>
                    {sc}
                  </span>
                ) : isNavigable ? (
                  <button
                    onClick={e => { e.stopPropagation(); onRowClick?.(h.ticker) }}
                    className="text-[11px] text-zinc-500 hover:text-blue-400 border border-zinc-700 px-2 py-0.5 rounded transition-colors"
                  >
                    חשב ציון
                  </button>
                ) : null}
              </div>
              {/* Row 2: name */}
              <p className="text-sm text-zinc-400 mb-2 truncate">{h.name}</p>
              {/* Row 3: price + P&L */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold text-zinc-200">{formatCurrency(h.currentPrice, h.currency)}</span>
                {h.dailyChangePercent !== 0 && (
                  <span className={`text-xs font-medium ${h.dailyChangePercent > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {h.dailyChangePercent > 0 ? '+' : ''}{formatPercent(h.dailyChangePercent)} יומי
                  </span>
                )}
                <span className={`text-xs font-medium ${h.plPercent > 0 ? 'text-green-400' : h.plPercent < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                  {h.plPercent > 0 ? '+' : ''}{formatPercent(h.plPercent)}
                </span>
              </div>
              {/* Row 4: quantity + value */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  כמות: <span className="text-zinc-400">{h.quantity}</span>
                  &nbsp;·&nbsp;
                  שווי: <span className="text-zinc-300 font-medium">{formatCurrency(h.value, h.currency)}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); openAddMore(h) }}
                    className="text-zinc-600 hover:text-blue-400 transition-colors" title="הוסף עוד">
                    <PlusCircle className="h-4 w-4" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); onEdit(h) }}
                    className="text-zinc-600 hover:text-amber-400 transition-colors" title="ערוך">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); onDelete(h.id) }}
                    className="text-zinc-600 hover:text-red-400 transition-colors" title="מחק">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop/tablet table (hidden below md) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              {['סמל','שם','סוג','מטבע','כמות','מחיר ממוצע','מחיר נוכחי','שווי','רו"ה','רו"ה %','יומי ₪','יומי %','ציון AI',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => {
              const isNavigable = !NON_NAVIGABLE_TYPES.has(h.assetType) && !!onRowClick
              return (
                <tr
                  key={h.id}
                  className={`border-b border-zinc-800/50 transition-colors ${isNavigable ? 'hover:bg-zinc-800/50 cursor-pointer' : 'hover:bg-zinc-800/30'}`}
                  onClick={isNavigable ? (e) => {
                    if ((e.target as HTMLElement).closest('button, input')) return
                    onRowClick(h.ticker)
                  } : undefined}
                >
                  <td className="px-3 py-3 font-bold text-blue-400">{h.ticker}</td>
                  <td className="px-3 py-3 text-zinc-300 max-w-[120px] truncate">{h.name}</td>
                  <td className="px-3 py-3 text-zinc-400">{ASSET_TYPE_LABELS[h.assetType] ?? h.assetType}</td>
                  <td className="px-3 py-3"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400">{h.currency}</span></td>
                  <td className="px-3 py-3 text-zinc-300">{h.quantity}</td>
                  <td className="px-3 py-3 text-zinc-300">{formatCurrency(h.avgPrice, h.currency)}</td>
                  <td className="px-3 py-3">
                    <PriceCell h={h} editPriceId={editPriceId} editPriceValue={editPriceValue}
                      setEditPriceId={setEditPriceId} setEditPriceValue={setEditPriceValue}
                      saveManualPrice={saveManualPrice} clearManualPrice={clearManualPrice} />
                  </td>
                  <td className="px-3 py-3 text-zinc-100 font-medium">{formatCurrency(h.value, h.currency)}</td>
                  <td className={`px-3 py-3 font-medium ${h.plAmount > 0 ? 'text-green-400' : h.plAmount < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{formatCurrency(h.plAmount, h.currency)}</td>
                  <td className={`px-3 py-3 font-medium ${h.plPercent > 0 ? 'text-green-400' : h.plPercent < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{formatPercent(h.plPercent)}</td>
                  <td className={`px-3 py-3 font-medium ${h.dailyChange > 0 ? 'text-green-400' : h.dailyChange < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                    {h.dailyChange !== 0 ? `${h.dailyChange > 0 ? '+' : ''}${formatCurrency(h.dailyChange * h.quantity, h.currency)}` : '—'}
                  </td>
                  <td className={`px-3 py-3 font-medium ${h.dailyChangePercent > 0 ? 'text-green-400' : h.dailyChangePercent < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                    {h.dailyChangePercent !== 0 ? `${h.dailyChangePercent > 0 ? '+' : ''}${formatPercent(h.dailyChangePercent)}` : '—'}
                  </td>
                  <td className="px-3 py-3">
                    {(() => {
                      if (isMoneyMarketFund(h)) {
                        return (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                            style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
                            שמרני
                          </span>
                        )
                      }
                      const sc = aiScores?.[h.ticker]
                      if (sc != null) {
                        const color = sc >= 75 ? '#22c55e' : sc >= 60 ? '#eab308' : sc >= 40 ? '#f97316' : '#ef4444'
                        return (
                          <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
                            style={{ background: color + '18', color, border: `1px solid ${color}40` }}>
                            {sc}
                          </span>
                        )
                      }
                      if (!isNavigable) return <span className="text-zinc-700 text-[10px]">—</span>
                      return (
                        <span className="flex items-center gap-1">
                          <span className="text-zinc-700">—</span>
                          <button
                            onClick={e => { e.stopPropagation(); onRowClick?.(h.ticker) }}
                            className="text-[10px] text-zinc-600 hover:text-blue-400 border border-zinc-700 hover:border-blue-500 px-1 rounded transition-colors"
                          >
                            חשב
                          </button>
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openAddMore(h)} className="text-zinc-600 hover:text-blue-400 transition-colors" title="הוסף עוד"><PlusCircle className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onEdit(h)} className="text-zinc-600 hover:text-amber-400 transition-colors" title="ערוך"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onDelete(h.id)} className="text-zinc-600 hover:text-red-400 transition-colors" title="מחק"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Long-term Savings Table ─────────────────────────────────────────────────

function LongtermTable({ holdings, editPriceId, editPriceValue, setEditPriceId, setEditPriceValue, saveManualPrice, clearManualPrice, onDelete, onEdit }: TableCommonProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              {['שם','סוג','גוף מנהל','מסלול','הושקע','שווי נוכחי','רווח','הפקדה',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-3 py-3">
                  <div>
                    <p className="font-bold text-zinc-200">{h.name}</p>
                    {h.accountNumber && <p className="text-[10px] text-zinc-600">מס׳ {h.accountNumber}</p>}
                  </div>
                </td>
                <td className="px-3 py-3 text-zinc-400">{ASSET_TYPE_LABELS[h.assetType] ?? h.assetType}</td>
                <td className="px-3 py-3 text-zinc-300">{h.managingBody ?? '—'}</td>
                <td className="px-3 py-3 text-zinc-400 max-w-[100px] truncate">{h.track ?? '—'}</td>
                <td className="px-3 py-3 text-zinc-300">{formatCurrency(h.avgPrice, h.currency)}</td>
                <td className="px-3 py-3">
                  {editPriceId === h.id ? (
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" step="any" autoFocus
                        value={editPriceValue} onChange={e => setEditPriceValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveManualPrice(h.id); if (e.key === 'Escape') { setEditPriceId(null); setEditPriceValue('') } }}
                        className="w-28 bg-zinc-700 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none" />
                      <button type="button" onClick={() => saveManualPrice(h.id)} className="text-green-400 hover:text-green-300"><Check className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => { setEditPriceId(null); setEditPriceValue('') }} className="text-zinc-500 hover:text-zinc-300"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={h.priceSource === 'cost' ? 'text-zinc-500' : 'text-zinc-200 font-medium'}>
                        {formatCurrency(h.currentPrice, h.currency)}
                      </span>
                      <button type="button"
                        onClick={() => { setEditPriceId(h.id); setEditPriceValue(String(h.manualPrice ?? h.currentPrice)) }}
                        className="px-2 py-0.5 rounded text-[10px] font-medium border border-zinc-600 text-zinc-400 hover:border-blue-500 hover:text-blue-300 hover:bg-blue-600/10 transition-colors whitespace-nowrap">
                        עדכן שווי
                      </button>
                    </div>
                  )}
                </td>
                <td className={`px-3 py-3 font-medium ${h.plAmount > 0 ? 'text-green-400' : h.plAmount < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                  {formatCurrency(h.plAmount, h.currency)}
                  {h.plPercent !== 0 && <span className="text-[10px] mr-1 opacity-70">({formatPercent(h.plPercent)})</span>}
                </td>
                <td className="px-3 py-3 text-zinc-400">
                  {h.monthlyDeposit ? `${formatCurrency(h.monthlyDeposit, 'ILS')} / ${DEPOSIT_FREQ_LABELS[h.depositFrequency ?? 'monthly'] ?? h.depositFrequency}` : '—'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onEdit(h)} className="text-zinc-600 hover:text-amber-400 transition-colors" title="ערוך"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => onDelete(h.id)} className="text-zinc-600 hover:text-red-400 transition-colors" title="מחק"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Simple Table (real estate / alternative) ─────────────────────────────────

function SimpleTable({ holdings, editPriceId, editPriceValue, setEditPriceId, setEditPriceValue, saveManualPrice, clearManualPrice, onDelete, onEdit }: TableCommonProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              {['שם','סוג','מטבע','עלות / השקעה','שווי נוכחי','רווח','פרטים נוספים',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-right text-zinc-500 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-3 py-3 font-bold text-zinc-200">{h.name}</td>
                <td className="px-3 py-3 text-zinc-400">{ASSET_TYPE_LABELS[h.assetType] ?? h.assetType}</td>
                <td className="px-3 py-3"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400">{h.currency}</span></td>
                <td className="px-3 py-3 text-zinc-300">{formatCurrency(h.avgPrice, h.currency)}</td>
                <td className="px-3 py-3">
                  <PriceCell h={h} editPriceId={editPriceId} editPriceValue={editPriceValue}
                    setEditPriceId={setEditPriceId} setEditPriceValue={setEditPriceValue}
                    saveManualPrice={saveManualPrice} clearManualPrice={clearManualPrice}
                    label={formatCurrency(h.currentPrice, h.currency)} />
                </td>
                <td className={`px-3 py-3 font-medium ${h.plAmount > 0 ? 'text-green-400' : h.plAmount < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                  {formatCurrency(h.plAmount, h.currency)}
                  {h.plPercent !== 0 && <span className="text-[10px] mr-1 opacity-70">({formatPercent(h.plPercent)})</span>}
                </td>
                <td className="px-3 py-3 text-zinc-500 text-[10px]">
                  {h.assetType === 'deposit' && h.interestRate && <span>ריבית {h.interestRate}%</span>}
                  {h.assetType === 'deposit' && h.maturityDate && <span className="mr-2">סיום {new Date(h.maturityDate).toLocaleDateString('he-IL')}</span>}
                  {h.managingBody && <span>{h.managingBody}</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEdit(h)} className="text-zinc-600 hover:text-amber-400 transition-colors" title="ערוך"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onDelete(h.id)} className="text-zinc-600 hover:text-red-400 transition-colors" title="מחק"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
