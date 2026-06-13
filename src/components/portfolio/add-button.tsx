'use client'

import { useState, useEffect } from 'react'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Currency = 'USD' | 'ILS' | 'EUR' | 'GBP'

const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'USD ($)',
  ILS: 'ILS / אגורות (₪)',
  EUR: 'EUR (€)',
  GBP: 'GBP (£)',
}

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  ILS: '₪',
  EUR: '€',
  GBP: '£',
}

interface AddToPortfolioButtonProps {
  ticker: string
  name: string
  currentPrice?: number
}

export default function AddToPortfolioButton({ ticker, name, currentPrice }: AddToPortfolioButtonProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const defaultCurrency: Currency = ticker.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD'

  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState(currentPrice?.toFixed(2) ?? '')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const [assetType, setAssetType] = useState('stock')
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)

  // Re-sync when dialog opens (in case ticker changed between renders)
  useEffect(() => {
    if (open) {
      setCurrency(ticker.toUpperCase().endsWith('.TA') ? 'ILS' : 'USD')
      setAvgPrice(currentPrice?.toFixed(2) ?? '')
      setStatus('idle')
      setErrorMsg('')
    }
  }, [open, ticker, currentPrice])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const qtyNum = parseFloat(quantity)
    const priceNum = parseFloat(avgPrice)

    if (!qtyNum || qtyNum <= 0) {
      setErrorMsg('הכמות חייבת להיות גדולה מ-0.')
      setStatus('error')
      return
    }
    if (!priceNum || priceNum <= 0) {
      setErrorMsg('המחיר חייב להיות גדול מ-0.')
      setStatus('error')
      return
    }

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          name,
          quantity: qtyNum,
          avgPrice: priceNum,
          purchaseDate: new Date(purchaseDate).toISOString(),
          assetType: assetType.toLowerCase(),
          currency,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errText = data?.error
          ?? (data?.details ? Object.values(data.details).flat().join(', ') : null)
          ?? `שגיאה ${res.status}`
        throw new Error(errText)
      }
      setStatus('success')
      setTimeout(() => {
        setOpen(false)
        setStatus('idle')
        setQuantity('')
        setAvgPrice(currentPrice?.toFixed(2) ?? '')
        setPurchaseDate(new Date().toISOString().split('T')[0])
        setAssetType('stock')
        setCurrency(defaultCurrency)
      }, 1200)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'משהו השתבש.')
      setStatus('error')
    }
  }

  const priceLabel = currency === 'ILS'
    ? 'מחיר קנייה ממוצע (אגורות / ₪)'
    : `מחיר קנייה ממוצע (${currency})`

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 border"
        style={{ borderColor: '#334155', color: '#e2e8f0', background: 'transparent' }}
      >
        <PlusCircle className="w-4 h-4" />
        הוסף לתיק
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: '#111827', borderColor: '#1e293b', color: '#e2e8f0' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#e2e8f0' }}>הוסף לתיק</DialogTitle>
            <DialogDescription style={{ color: '#64748b' }}>
              תעד את האחזקה שלך עבור{' '}
              <span className="font-semibold" style={{ color: '#3b82f6' }}>{ticker}</span> — {name}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Currency */}
            <div className="space-y-1.5">
              <Label style={{ color: '#94a3b8' }}>מטבע</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger style={{ background: '#0a0e1a', borderColor: '#1e293b', color: '#e2e8f0' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: '#111827', borderColor: '#1e293b' }}>
                  {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
                    <SelectItem key={c} value={c}>{CURRENCY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currency === 'ILS' && (
                <p className="text-xs" style={{ color: '#f59e0b' }}>
                  מניות ישראליות (TASE) נסחרות באגורות. 1 ₪ = 100 אג׳. הזן את המחיר כפי שמוצג בבורסה.
                </p>
              )}
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="qty" style={{ color: '#94a3b8' }}>כמות</Label>
              <Input
                id="qty"
                type="number"
                step="any"
                min="0.000001"
                placeholder="לדוגמה: 10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                style={{ background: '#0a0e1a', borderColor: '#1e293b', color: '#e2e8f0' }}
              />
            </div>

            {/* Average Price */}
            <div className="space-y-1.5">
              <Label htmlFor="price" style={{ color: '#94a3b8' }}>{priceLabel}</Label>
              <div className="relative">
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none select-none"
                  style={{ color: '#64748b' }}
                >
                  {CURRENCY_SYMBOL[currency]}
                </span>
                <Input
                  id="price"
                  type="number"
                  step="any"
                  min="0.000001"
                  placeholder={currency === 'ILS' ? 'לדוגמה: 1236' : 'לדוגמה: 150.00'}
                  value={avgPrice}
                  onChange={(e) => setAvgPrice(e.target.value)}
                  required
                  className="pr-8"
                  style={{ background: '#0a0e1a', borderColor: '#1e293b', color: '#e2e8f0' }}
                />
              </div>
            </div>

            {/* Purchase Date */}
            <div className="space-y-1.5">
              <Label htmlFor="date" style={{ color: '#94a3b8' }}>תאריך קנייה</Label>
              <Input
                id="date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
                style={{ background: '#0a0e1a', borderColor: '#1e293b', color: '#e2e8f0' }}
              />
            </div>

            {/* Asset Type */}
            <div className="space-y-1.5">
              <Label style={{ color: '#94a3b8' }}>סוג נכס</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger style={{ background: '#0a0e1a', borderColor: '#1e293b', color: '#e2e8f0' }}>
                  <SelectValue placeholder="בחר סוג" />
                </SelectTrigger>
                <SelectContent style={{ background: '#111827', borderColor: '#1e293b' }}>
                  <SelectItem value="stock">מניה</SelectItem>
                  <SelectItem value="etf">ETF</SelectItem>
                  <SelectItem value="crypto">קריפטו</SelectItem>
                  <SelectItem value="bond">אג&quot;ח</SelectItem>
                  <SelectItem value="otc">OTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Error */}
            {status === 'error' && errorMsg && (
              <p
                className="text-sm rounded-lg px-3 py-2"
                style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {errorMsg}
              </p>
            )}

            {/* Success */}
            {status === 'success' && (
              <p className="text-sm font-medium" style={{ color: '#22c55e' }}>
                האחזקה נוספה בהצלחה!
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={status === 'loading'}
                style={{ color: '#64748b' }}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                style={{ background: '#3b82f6', color: '#fff' }}
              >
                {status === 'loading' ? 'שומר...' : status === 'success' ? 'נשמר!' : 'הוסף אחזקה'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
