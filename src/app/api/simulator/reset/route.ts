import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

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
  return NextResponse.json({ success: true, balance: 10000 })
}
