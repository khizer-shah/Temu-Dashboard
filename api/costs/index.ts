// /api/costs
//   GET    -> all cost entries              [db.getCostRegistry]
//   POST   { costs } -> bulk upsert          [db.saveCostEntries]
//   DELETE -> clear the ledger               [db.clearCostRegistry]
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { chunk, methodNotAllowed, readBody } from '../_lib/util'

interface CostBody {
  skuKey: string
  sku: string
  unitCost: number
  currency?: string | null
  source: string
  updatedAt: number
}

function toData(c: CostBody) {
  return {
    sku: c.sku ?? '',
    unitCost: c.unitCost ?? 0,
    currency: c.currency ?? null,
    source: c.source ?? 'invoice',
    updatedAt: c.updatedAt ?? 0,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const costs = await prisma.costEntry.findMany()
    return res.status(200).json(costs)
  }

  if (req.method === 'POST') {
    const { costs } = readBody<{ costs: CostBody[] }>(req.body)
    const list = (Array.isArray(costs) ? costs : []).filter((c) => c?.skuKey)
    for (const batch of chunk(list, 100)) {
      await prisma.$transaction(
        batch.map((c) => {
          const data = toData(c)
          return prisma.costEntry.upsert({
            where: { skuKey: c.skuKey },
            create: { skuKey: c.skuKey, ...data },
            update: data,
          })
        }),
      )
    }
    return res.status(200).json({ saved: list.length })
  }

  if (req.method === 'DELETE') {
    await prisma.costEntry.deleteMany({})
    return res.status(204).end()
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
}
