import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/watchlist/debug — returns all DB items for current user, then deletes them.
// Remove this route before shipping to production.

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionUserId = session.user.id

  // All items for this user in DB
  const items = await prisma.watchlistItem.findMany({ where: { userId: sessionUserId } })

  // All items across ALL users (for cross-checking user IDs)
  const allItems = await prisma.watchlistItem.findMany({
    select: { id: true, ticker: true, userId: true, addedAt: true },
  })

  // Delete all items for this user
  const deleted = await prisma.watchlistItem.deleteMany({ where: { userId: sessionUserId } })

  return NextResponse.json({
    sessionUserId,
    userItems: items,
    deletedCount: deleted.count,
    allItemsInDb: allItems,
  })
}
