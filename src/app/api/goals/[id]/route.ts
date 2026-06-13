import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { validationError } from '@/lib/schemas'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name:             z.string().min(1).max(100).trim().optional(),
  targetAmount:     z.number().positive().optional(),
  currentAmount:    z.number().min(0).optional(),
  monthlyDeposit:   z.number().min(0).optional(),
  depositFrequency: z.enum(['monthly', 'quarterly', 'yearly', 'onetime']).optional(),
  targetDate:       z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  expectedReturn:   z.number().min(0).max(30).optional(),
  currency:         z.enum(['ILS', 'USD']).optional(),
  icon:             z.string().min(1).max(10).optional(),
  status:           z.enum(['active', 'completed']).optional(),
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

  const goal = await prisma.goal.findFirst({ where: { id, userId } })
  if (!goal) return NextResponse.json({ error: 'מטרה לא נמצאה' }, { status: 404 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const { targetDate, ...rest } = parsed.data

  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...rest,
      ...(targetDate ? { targetDate: new Date(targetDate) } : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { id } = await params
  const goal = await prisma.goal.findFirst({ where: { id, userId } })
  if (!goal) return NextResponse.json({ error: 'מטרה לא נמצאה' }, { status: 404 })

  await prisma.goal.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
