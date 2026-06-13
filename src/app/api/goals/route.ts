import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { validationError } from '@/lib/schemas'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const goalSchema = z.object({
  name:             z.string().min(1).max(100).trim(),
  targetAmount:     z.number().positive(),
  currentAmount:    z.number().min(0).default(0),
  monthlyDeposit:   z.number().min(0).default(0),
  depositFrequency: z.enum(['monthly', 'quarterly', 'yearly', 'onetime']).default('monthly'),
  targetDate:       z.string().datetime({ offset: true }).or(z.string().date()),
  expectedReturn:   z.number().min(0).max(30).default(7),
  currency:         z.enum(['ILS', 'USD']),
  icon:             z.string().min(1).max(10).default('💰'),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(goals)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = goalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const { name, targetAmount, currentAmount, monthlyDeposit, depositFrequency, targetDate, expectedReturn, currency, icon } = parsed.data

  const goal = await prisma.goal.create({
    data: {
      userId, name, targetAmount, currentAmount, monthlyDeposit, depositFrequency,
      targetDate: new Date(targetDate), expectedReturn, currency, icon, status: 'active',
    },
  })
  return NextResponse.json(goal)
}
