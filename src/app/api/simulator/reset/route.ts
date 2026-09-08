import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { buildAccountPayload } from '@/lib/simulator'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rl = await rateLimit(userId, 'default')
  if (!rl.success) return rateLimitResponse(rl.reset)
  const account = await prisma.simulatorAccount.findUnique({ where: { userId } })
  if (account) {
    await prisma.simulatorTrade.deleteMany({ where: { accountId: account.id } })
    await prisma.simulatorAccount.update({ where: { id: account.id }, data: { balance: 10000 } })
  }
  const fresh = await prisma.simulatorAccount.upsert({
    where: { userId },
    create: { userId, balance: 10000 },
    update: {},
    include: { trades: { orderBy: { timestamp: 'desc' } } },
  })
  return NextResponse.json(await buildAccountPayload(fresh))
}
