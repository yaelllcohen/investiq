import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const addMoreSchema = z.object({
  addedQuantity: z.number().positive().max(1_000_000),
  addedPrice:    z.number().positive().max(10_000_000_000),
})

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { id } = await params

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }) }

  const parsed = addMoreSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const { addedQuantity, addedPrice } = parsed.data

  const holding = await prisma.holding.findFirst({ where: { id, userId } })
  if (!holding) return NextResponse.json({ error: 'אחזקה לא נמצאה' }, { status: 404 })

  const newQuantity = holding.quantity + addedQuantity
  const newAvgPrice = (holding.quantity * holding.avgPrice + addedQuantity * addedPrice) / newQuantity

  const updated = await prisma.holding.update({
    where: { id },
    data:  { quantity: newQuantity, avgPrice: newAvgPrice },
  })

  return NextResponse.json(updated)
}

const manualPriceSchema = z.object({
  manualPrice: z.number().positive().max(10_000_000_000).nullable(),
})

const fullEditSchema = z.object({
  name:             z.string().min(1).max(200),
  quantity:         z.number().positive().max(1_000_000),
  avgPrice:         z.number().min(0).max(10_000_000_000),
  assetType:        z.string().max(50),
  currency:         z.enum(['USD', 'ILS', 'EUR', 'GBP']),
  purchaseDate:     z.string().optional(),
  managingBody:     z.string().max(200).optional().nullable(),
  accountNumber:    z.string().max(100).optional().nullable(),
  track:            z.string().max(200).optional().nullable(),
  monthlyDeposit:   z.number().min(0).max(10_000_000_000).optional().nullable(),
  depositFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional().nullable(),
  interestRate:     z.number().min(0).max(100).optional().nullable(),
  maturityDate:     z.string().optional().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const { id } = await params

  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 }) }

  const holding = await prisma.holding.findFirst({ where: { id, userId } })
  if (!holding) return NextResponse.json({ error: 'אחזקה לא נמצאה' }, { status: 404 })

  // Manual price update (body always contains the 'manualPrice' key, even when null)
  if ('manualPrice' in (body as Record<string, unknown>)) {
    const parsed = manualPriceSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
    const updated = await prisma.holding.update({
      where: { id },
      data:  { manualPrice: parsed.data.manualPrice },
    })
    return NextResponse.json(updated)
  }

  // Full holding edit
  const parsed = fullEditSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const d = parsed.data
  const updated = await prisma.holding.update({
    where: { id },
    data: {
      name:             d.name,
      quantity:         d.quantity,
      avgPrice:         d.avgPrice,
      assetType:        d.assetType,
      currency:         d.currency,
      ...(d.purchaseDate ? { purchaseDate: new Date(d.purchaseDate) } : {}),
      managingBody:     d.managingBody  ?? null,
      accountNumber:    d.accountNumber ?? null,
      track:            d.track         ?? null,
      monthlyDeposit:   d.monthlyDeposit   ?? null,
      depositFrequency: d.depositFrequency ?? null,
      interestRate:     d.interestRate  ?? null,
      maturityDate:     d.maturityDate ? new Date(d.maturityDate) : null,
    },
  })
  return NextResponse.json(updated)
}
