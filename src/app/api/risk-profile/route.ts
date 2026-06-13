import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { riskProfileSchema, validationError } from '@/lib/schemas'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const profile = await prisma.riskProfile.findUnique({ where: { userId } })
  return NextResponse.json(profile)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const body = await req.json()
  const parsed = riskProfileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const { score, label, answers } = parsed.data
  const profile = await prisma.riskProfile.upsert({
    where: { userId },
    update: { score, label, answers: JSON.stringify(answers) },
    create: { userId, score, label, answers: JSON.stringify(answers) },
  })
  return NextResponse.json(profile)
}
