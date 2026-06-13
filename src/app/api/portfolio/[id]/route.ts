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

  const parsed = manualPriceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const holding = await prisma.holding.findFirst({ where: { id, userId } })
  if (!holding) return NextResponse.json({ error: 'אחזקה לא נמצאה' }, { status: 404 })

  const updated = await prisma.holding.update({
    where: { id },
    data:  { manualPrice: parsed.data.manualPrice },
  })

  return NextResponse.json(updated)
}
