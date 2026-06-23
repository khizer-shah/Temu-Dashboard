// /api/products
//   GET    -> all products                 [db.getProducts]
//   POST   { products } -> bulk upsert      [db.saveProducts]  (the "upload" path)
//   DELETE -> clear the catalog             [db.clearProducts]
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { chunk, methodNotAllowed, readBody } from '../_lib/util'

interface ProductBody {
  skuKey: string
  sku: string
  productName: string
  costPrice: number
  targetListingPrice: number
  currency?: string | null
  source: string
  updatedAt: number
}

function toData(p: ProductBody) {
  return {
    sku: p.sku ?? '',
    productName: p.productName ?? '',
    costPrice: p.costPrice ?? 0,
    targetListingPrice: p.targetListingPrice ?? 0,
    currency: p.currency ?? null,
    source: p.source ?? 'invoice',
    updatedAt: p.updatedAt ?? 0,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const products = await prisma.product.findMany()
    return res.status(200).json(products)
  }

  if (req.method === 'POST') {
    const { products } = readBody<{ products: ProductBody[] }>(req.body)
    const list = (Array.isArray(products) ? products : []).filter((p) => p?.skuKey)
    for (const batch of chunk(list, 100)) {
      await prisma.$transaction(
        batch.map((p) => {
          const data = toData(p)
          return prisma.product.upsert({
            where: { skuKey: p.skuKey },
            create: { skuKey: p.skuKey, ...data },
            update: data,
          })
        }),
      )
    }
    return res.status(200).json({ saved: list.length })
  }

  if (req.method === 'DELETE') {
    await prisma.product.deleteMany({})
    return res.status(204).end()
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
}
