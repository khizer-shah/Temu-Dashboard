// /api/orders
//   GET    ?accountId=...           -> items for an account   [db.getItemsForAccount]
//   POST   { accountId, items }     -> bulk upsert items       [db.saveItems]
//   DELETE ?accountId=...           -> clear an account's items[db.clearItemsForAccount]
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Prisma } from '@prisma/client'
import { prisma } from '../_lib/prisma'
import { chunk, methodNotAllowed, readBody } from '../_lib/util'

/** Shape of an order item as sent by the client (matches src/lib/types.ts OrderItem). */
interface OrderItemBody {
  id: string
  orderId: string
  orderItemId: string
  status: string
  fulfillmentMode: string
  productName: string
  variation: string
  sku: string
  qtyPurchased: number
  qtyShipped: number
  qtyToShip: number
  qtyCanceled: number
  revenue: number
  goodsBasePrice: number
  shippingCost: number
  taxTotal: number
  discount: number
  carrier: string
  trackingNumber: string
  settlementStatus: string
  city: string
  state: string
  country: string
  purchaseDate: unknown | null
  purchaseDateRaw: string
  awaitingShipment: boolean
  raw: Record<string, unknown>
}

/** Map a client order item to the Prisma scalar payload (excludes id/accountId). */
function toData(it: OrderItemBody) {
  return {
    orderId: it.orderId ?? '',
    orderItemId: it.orderItemId ?? '',
    status: it.status ?? '',
    fulfillmentMode: it.fulfillmentMode ?? '',
    productName: it.productName ?? '',
    variation: it.variation ?? '',
    sku: it.sku ?? '',
    qtyPurchased: it.qtyPurchased ?? 0,
    qtyShipped: it.qtyShipped ?? 0,
    qtyToShip: it.qtyToShip ?? 0,
    qtyCanceled: it.qtyCanceled ?? 0,
    revenue: it.revenue ?? 0,
    goodsBasePrice: it.goodsBasePrice ?? 0,
    shippingCost: it.shippingCost ?? 0,
    taxTotal: it.taxTotal ?? 0,
    discount: it.discount ?? 0,
    carrier: it.carrier ?? '',
    trackingNumber: it.trackingNumber ?? '',
    settlementStatus: it.settlementStatus ?? '',
    city: it.city ?? '',
    state: it.state ?? '',
    country: it.country ?? '',
    purchaseDate: (it.purchaseDate ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    purchaseDateRaw: it.purchaseDateRaw ?? '',
    awaitingShipment: Boolean(it.awaitingShipment),
    raw: (it.raw ?? {}) as Prisma.InputJsonValue,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const accountId = Array.isArray(req.query.accountId) ? req.query.accountId[0] : req.query.accountId
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' })
    const items = await prisma.orderItem.findMany({ where: { accountId } })
    return res.status(200).json(items)
  }

  if (req.method === 'POST') {
    const { accountId, items } = readBody<{ accountId: string; items: OrderItemBody[] }>(req.body)
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' })
    const list = Array.isArray(items) ? items : []

    // Chunked upserts keep re-uploads idempotent without one giant transaction.
    for (const batch of chunk(list, 100)) {
      await prisma.$transaction(
        batch.map((it) => {
          const data = toData(it)
          return prisma.orderItem.upsert({
            where: { id: it.id },
            create: { id: it.id, accountId, ...data },
            update: { accountId, ...data },
          })
        }),
      )
    }
    return res.status(200).json({ saved: list.length })
  }

  if (req.method === 'DELETE') {
    const accountId = Array.isArray(req.query.accountId) ? req.query.accountId[0] : req.query.accountId
    if (!accountId) return res.status(400).json({ error: 'Missing accountId' })
    await prisma.orderItem.deleteMany({ where: { accountId } })
    return res.status(204).end()
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
}
