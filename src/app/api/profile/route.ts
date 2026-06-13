import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { profileNameSchema, validationError } from '@/lib/schemas'

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const body = await req.json()
  const parsed = profileNameSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 })
  const { name } = parsed.data
  const user = await prisma.user.update({ where: { id: userId }, data: { name } })
  return NextResponse.json({ name: user.name })
}
