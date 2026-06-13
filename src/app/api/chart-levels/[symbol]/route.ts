import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type LevelType = 'entry' | 'stop' | 'target'
const VALID_TYPES: LevelType[] = ['entry', 'stop', 'target']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { symbol } = await params
  const sym = symbol.toUpperCase()

  const rows = await prisma.chartLevel.findMany({
    where: { userId: session.user.id, symbol: sym },
  })

  const result: Record<LevelType, number | null> = { entry: null, stop: null, target: null }
  for (const r of rows) {
    if ((VALID_TYPES as string[]).includes(r.type)) {
      result[r.type as LevelType] = r.price
    }
  }
  return NextResponse.json(result)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { symbol } = await params
  const sym = symbol.toUpperCase()

  let body: { type?: unknown; price?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { type, price } = body
  if (typeof type !== 'string' || !(VALID_TYPES as string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
  }

  const level = await prisma.chartLevel.upsert({
    where: { userId_symbol_type: { userId: session.user.id, symbol: sym, type } },
    create: { userId: session.user.id, symbol: sym, type, price },
    update: { price },
  })
  return NextResponse.json(level)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { symbol } = await params
  const sym = symbol.toUpperCase()
  const type = new URL(req.url).searchParams.get('type')

  if (!type || !(VALID_TYPES as string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  await prisma.chartLevel.deleteMany({
    where: { userId: session.user.id, symbol: sym, type },
  })
  return NextResponse.json({ ok: true })
}
