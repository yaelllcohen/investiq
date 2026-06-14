import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { z } from 'zod'
import { validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const completeSchema = z.object({
  lessonId: z.string().min(1).max(100).trim(),
  score: z.number().int().min(0).max(100).optional(),
})

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
  const parsed = completeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const { lessonId, score } = parsed.data

  await prisma.lessonProgress.upsert({
    where:  { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, completed: true, score: score ?? null, completedAt: new Date() },
    update: { completed: true, score: score ?? null, completedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
