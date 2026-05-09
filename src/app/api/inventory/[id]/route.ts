

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reconcileSaleAlerts } from '@/lib/sale-alerts'
import { getUserId } from '@/lib/auth'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const item = await prisma.inventoryItem.findUnique({ where: { id: params.id } })
  if (!item || item.userId !== USER_ID) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.inventoryItem.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const item = await prisma.inventoryItem.findUnique({ where: { id: params.id } })
  if (!item || item.userId !== USER_ID) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.inventoryItem.update({
    where: { id: params.id },
    data: {
      quantity: body.quantity ?? item.quantity,
      condition: body.condition ?? item.condition,
      finish: body.finish ?? item.finish,
      language: body.language ?? item.language,
      notes: body.notes ?? item.notes,
      acquiredPrice: body.acquiredPrice ?? item.acquiredPrice,
      // For-sale fields
      ...(body.forSale !== undefined ? { forSale: body.forSale, saleListedAt: body.forSale ? (item.saleListedAt ?? new Date()) : null } : {}),
      ...(body.salePrice !== undefined ? { salePrice: body.salePrice } : {}),
      ...(body.saleCurrency !== undefined ? { saleCurrency: body.saleCurrency } : {}),
      ...(body.saleNotes !== undefined ? { saleNotes: body.saleNotes } : {}),
      ...(body.saleAlertEnabled !== undefined ? { saleAlertEnabled: body.saleAlertEnabled } : {}),
    },
  })
  // If for-sale flags changed, reconcile auto-alerts so they're created/archived appropriately.
  if (body.forSale !== undefined || body.saleAlertEnabled !== undefined) {
    await reconcileSaleAlerts(USER_ID)
  }
  return NextResponse.json(updated)
}
