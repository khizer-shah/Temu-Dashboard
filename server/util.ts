// Small helpers shared across the serverless API routes.
import type { VercelResponse } from '@vercel/node'

/** Split an array into fixed-size chunks (for batched DB transactions). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Standard 405 for an unsupported method. */
export function methodNotAllowed(res: VercelResponse, allow: string[]): void {
  res.setHeader('Allow', allow.join(', '))
  res.status(405).json({ error: 'Method Not Allowed' })
}

/** Coerce Vercel's req.body (object when JSON, or a raw string) into an object. */
export function readBody<T = Record<string, unknown>>(body: unknown): T {
  if (body == null) return {} as T
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as T
    } catch {
      return {} as T
    }
  }
  return body as T
}
