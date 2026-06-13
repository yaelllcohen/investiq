import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { registerSchema, validationError } from '@/lib/schemas'

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
    const rl = await rateLimit(ip, 'register')
    if (!rl.success) return rateLimitResponse(rl.reset)

    const body = await req.json()
    const result = registerSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(validationError(result.error), { status: 400 })
    }

    const { name, email, password } = result.data
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }
    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { name, email, password: hashed, provider: 'credentials' },
    })
    return NextResponse.json({ id: user.id, email: user.email, name: user.name })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
