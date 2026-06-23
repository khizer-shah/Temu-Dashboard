// /api/health — diagnostic endpoint. Always returns 200 with JSON describing
// whether env vars are present and whether the database is reachable, so a
// failing deploy can be diagnosed with a single curl instead of opaque 500s.
//
// Safe to keep in production; it leaks no secrets (only booleans + error text).
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DIRECT_URL: Boolean(process.env.DIRECT_URL),
    node: process.version,
  }
  try {
    // Dynamic import so a throwing PrismaClient constructor (e.g. missing engine
    // or missing DATABASE_URL) is caught here instead of crashing the function.
    const { prisma } = await import('../server/prisma.js')
    const accounts = await prisma.account.count()
    return res.status(200).json({ ok: true, env, db: 'reachable', accounts })
  } catch (err) {
    return res.status(200).json({
      ok: false,
      env,
      db: 'unreachable',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
