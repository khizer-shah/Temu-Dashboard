// Shared Prisma client for the serverless API routes.
//
// Lives OUTSIDE /api on purpose: files under /api each become an HTTP endpoint,
// and `_`-prefixed paths get special treatment by Vercel — neither is right for
// a shared helper. Vercel's dependency tracer still bundles this into each
// function that imports it.
//
// In serverless, reuse a single client across warm invocations (and across
// module reloads in dev) so we don't exhaust the database connection limit.
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
