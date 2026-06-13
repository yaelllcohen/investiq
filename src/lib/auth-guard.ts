import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new UnauthorizedError()
  }
  return session.user as { id: string; name?: string | null; email?: string | null; image?: string | null }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function handleAuthError(error: unknown): NextResponse | null {
  if (error instanceof UnauthorizedError) {
    return unauthorizedResponse()
  }
  return null
}
