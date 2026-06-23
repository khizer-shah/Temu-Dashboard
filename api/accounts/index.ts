// /api/accounts
//   GET  -> list all accounts (sorted by createdAt)   [replaces db.getAccounts]
//   POST -> upsert one account                         [replaces db.putAccount]
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { methodNotAllowed, readBody } from '../_lib/util'

interface AccountBody {
  id: string
  sellerName: string
  createdAt: number
  updatedAt: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const accounts = await prisma.account.findMany({ orderBy: { createdAt: 'asc' } })
    return res.status(200).json(accounts)
  }

  if (req.method === 'POST') {
    const a = readBody<AccountBody>(req.body)
    if (!a?.id) return res.status(400).json({ error: 'Missing account id' })
    const data = {
      sellerName: a.sellerName,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }
    const saved = await prisma.account.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    })
    return res.status(200).json(saved)
  }

  return methodNotAllowed(res, ['GET', 'POST'])
}
