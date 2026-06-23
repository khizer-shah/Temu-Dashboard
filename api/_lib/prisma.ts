// Shared Prisma client for the serverless API routes.
//
// Files/folders prefixed with `_` under /api are excluded from Vercel routing,
// so this is shared library code, not an HTTP endpoint.
//
// In serverless, each cold start can construct a new client; reuse a single
// instance across warm invocations (and across module reloads in dev) so we
// don't exhaust the database's connection limit.
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
