import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)

  const body = await req.json() as { lessonId?: string; score?: number }
  const { lessonId, score } = body
  if (!lessonId) return NextResponse.json({ error: 'lessonId required' }, { status: 400 })

  await prisma.lessonProgress.upsert({
    where:  { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, completed: true, score: score ?? null, completedAt: new Date() },
    update: { completed: true, score: score ?? null, completedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
