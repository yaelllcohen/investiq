import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { z } from 'zod'
import { validationError } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

const closeSchema = z.object({
  closePrice:   z.number().positive(),
  outcome:      z.string().max(2000).trim().optional(),
  followedPlan: z.boolean().nullable().optional(),
  movedStop:    z.enum(['yes', 'no', 'no_stop']).nullable().optional(),
  exitReason:   z.enum(['target', 'stop', 'thesis_change', 'emotion', 'other']).nullable().optional(),
  exitNotes:    z.string().max(2000).trim().optional(),
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
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 })
  }

  const parsed = closeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })

  const entry = await prisma.journalEntry.findFirst({ where: { id, userId } })
  if (!entry) return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 })

  const updated = await prisma.journalEntry.update({
    where: { id },
    data: {
      closePrice:   parsed.data.closePrice,
      outcome:      parsed.data.outcome ?? null,
      followedPlan: parsed.data.followedPlan ?? null,
      movedStop:    parsed.data.movedStop ?? null,
      exitReason:   parsed.data.exitReason ?? null,
      exitNotes:    parsed.data.exitNotes ?? null,
      status:       'closed',
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
  const entry = await prisma.journalEntry.findFirst({ where: { id, userId } })
  if (!entry) return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 })

  await prisma.journalEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
