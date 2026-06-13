import { PrismaClient } from '@/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const dbUrl = (process.env.DATABASE_URL ?? 'file:./prisma/dev.db').replace('file:', '')
const adapter = new PrismaBetterSqlite3({ url: dbUrl })

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
