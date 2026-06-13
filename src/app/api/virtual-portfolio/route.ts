import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { yahooFinance } from '@/lib/yahoo-finance'
import { gemini, GEMINI_MODEL } from '@/lib/gemini'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const USD_TO_ILS = 3.7  // fixed approximation

interface VPHolding {
  ticker: string
  name: string
  quantity: number
  avgPriceILS: number  // always in ILS
}

// ─── Live price helper ────────────────────────────────────────────────────────

async function fetchPriceILS(symbol: string): Promise<{ priceILS: number; name: string; changePercent: number } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = await yahooFinance.quote(symbol, {}, { validateResult: false }) as any
    if (!q?.regularMarketPrice) return null
    const currency = (q.currency ?? 'USD') as string
    const price = q.regularMarketPrice as number
    const priceILS = currency === 'ILS' || symbol.endsWith('.TA') ? price : price * USD_TO_ILS
    return {
      priceILS,
      name: (q.shortName ?? q.longName ?? symbol) as string,
      changePercent: (q.regularMarketChangePercent ?? 0) as number,
    }
  } catch {
    return null
  }
}

// ─── AI trade comment ─────────────────────────────────────────────────────────

async function aiComment(action: string, symbol: string, name: string, priceILS: number, quantity: number): Promise<string> {
  const total = priceILS * quantity
  try {
    const prompt = `משתמש זה עתה ${action === 'buy' ? 'קנה' : 'מכר'} ${quantity} יחידות של ${name} (${symbol}) ב-₪${priceILS.toFixed(2)} לכל אחת (סה"כ ₪${total.toFixed(0)}).
כתוב משפט אחד בלבד בעברית: הערה חינוכית קצרה על העסקה. כלל נסיבה לא להמליץ לקנות/למכור. רק תצפית.`
    const res = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 120,
        temperature: 0.3,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingBudget: 0 } as any,
      },
    })
    return (res.text ?? '').trim()
  } catch {
    return action === 'buy'
      ? `קנית ${quantity} יחידות של ${symbol} ב-₪${priceILS.toFixed(2)} — עקוב אחרי ההשקעה שלך.`
      : `מכרת ${quantity} יחידות של ${symbol} ב-₪${priceILS.toFixed(2)}.`
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  let vp = await prisma.virtualPortfolio.findUnique({ where: { userId } })
  if (!vp) {
    vp = await prisma.virtualPortfolio.create({ data: { userId, cashILS: 100000, holdings: '[]' } })
  }

  const holdings: VPHolding[] = JSON.parse(vp.holdings ?? '[]')

  // Fetch live prices in parallel
  const priceResults = await Promise.allSettled(
    holdings.map(h => fetchPriceILS(h.ticker))
  )

  let totalHoldingsValue = 0
  const enriched = holdings.map((h, i) => {
    const priceData = priceResults[i].status === 'fulfilled' ? priceResults[i].value : null
    const currentPriceILS = priceData?.priceILS ?? h.avgPriceILS
    const value = currentPriceILS * h.quantity
    const plAmount = (currentPriceILS - h.avgPriceILS) * h.quantity
    const plPercent = h.avgPriceILS > 0 ? (currentPriceILS - h.avgPriceILS) / h.avgPriceILS * 100 : 0
    totalHoldingsValue += value
    return {
      ...h,
      currentPriceILS,
      value,
      plAmount,
      plPercent,
      changePercent: priceData?.changePercent ?? 0,
    }
  })

  const totalValue = vp.cashILS + totalHoldingsValue
  const totalReturn = totalValue - 100000
  const totalReturnPct = totalReturn / 100000 * 100

  return NextResponse.json({
    cashILS: vp.cashILS,
    holdings: enriched,
    totalValue,
    totalReturn,
    totalReturnPct,
    startingValue: 100000,
  })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'ai')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const body = await req.json() as { action?: string; symbol?: string; quantity?: number }
  const { action, symbol, quantity } = body

  // ── Reset ──────────────────────────────────────────────────────────────────
  if (action === 'reset') {
    await prisma.virtualPortfolio.upsert({
      where:  { userId },
      create: { userId, cashILS: 100000, holdings: '[]' },
      update: { cashILS: 100000, holdings: '[]' },
    })
    return NextResponse.json({ success: true, message: 'התיק אופס ל-₪100,000' })
  }

  if (!symbol || !quantity || quantity <= 0 || !['buy', 'sell'].includes(action ?? '')) {
    return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 })
  }

  // ── Fetch live price ───────────────────────────────────────────────────────
  const priceData = await fetchPriceILS(symbol.toUpperCase())
  if (!priceData) {
    return NextResponse.json({ error: `לא נמצא מחיר עבור ${symbol}` }, { status: 422 })
  }
  const { priceILS, name } = priceData

  // ── Load VP ────────────────────────────────────────────────────────────────
  let vp = await prisma.virtualPortfolio.findUnique({ where: { userId } })
  if (!vp) {
    vp = await prisma.virtualPortfolio.create({ data: { userId, cashILS: 100000, holdings: '[]' } })
  }
  const holdings: VPHolding[] = JSON.parse(vp.holdings ?? '[]')

  if (action === 'buy') {
    const cost = priceILS * quantity
    if (vp.cashILS < cost) {
      return NextResponse.json({ error: `אין מספיק מזומן — נדרש ₪${cost.toFixed(0)}, יש ₪${vp.cashILS.toFixed(0)}` }, { status: 400 })
    }

    const existing = holdings.find(h => h.ticker === symbol.toUpperCase())
    if (existing) {
      const totalQty = existing.quantity + quantity
      existing.avgPriceILS = (existing.avgPriceILS * existing.quantity + priceILS * quantity) / totalQty
      existing.quantity = totalQty
    } else {
      holdings.push({ ticker: symbol.toUpperCase(), name, quantity, avgPriceILS: priceILS })
    }

    await Promise.all([
      prisma.virtualPortfolio.update({ where: { userId }, data: { cashILS: vp.cashILS - cost, holdings: JSON.stringify(holdings) } }),
      prisma.virtualTrade.create({ data: { userId, symbol: symbol.toUpperCase(), action: 'buy', price: priceILS, quantity } }),
    ])
  } else {
    const existing = holdings.find(h => h.ticker === symbol.toUpperCase())
    if (!existing || existing.quantity < quantity) {
      return NextResponse.json({ error: `אין מספיק יחידות של ${symbol}` }, { status: 400 })
    }

    const proceeds = priceILS * quantity
    existing.quantity -= quantity
    const updatedHoldings = holdings.filter(h => h.quantity > 0)

    await Promise.all([
      prisma.virtualPortfolio.update({ where: { userId }, data: { cashILS: vp.cashILS + proceeds, holdings: JSON.stringify(updatedHoldings) } }),
      prisma.virtualTrade.create({ data: { userId, symbol: symbol.toUpperCase(), action: 'sell', price: priceILS, quantity } }),
    ])
  }

  const comment = await aiComment(action!, symbol.toUpperCase(), name, priceILS, quantity)

  return NextResponse.json({ success: true, priceILS, name, comment })
}
