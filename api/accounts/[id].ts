// /api/accounts/:id
//   DELETE -> delete an account; its order items cascade via the FK
//             [replaces db.deleteAccount]
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { methodNotAllowed } from '../_lib/util'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE'])

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) return res.status(400).json({ error: 'Missing account id' })

  // onDelete: Cascade on OrderItem.account removes the account's items too.
  await prisma.account.delete({ where: { id } }).catch((err: unknown) => {
    // Deleting a non-existent account is a no-op for the client's purposes.
    if ((err as { code?: string })?.code !== 'P2025') throw err
  })

  return res.status(204).end()
}
