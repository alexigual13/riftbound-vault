

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getUserId } from '@/lib/auth'
import { reconcileSaleAlerts } from '@/lib/sale-alerts'

const createSchema = z.object({
  cardId: z.string(),
  quantity: z.number().int().min(1).default(1),
  finish: z.enum(['NORMAL', 'FOIL']).default('NORMAL'),
  condition: z.enum(['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'PLAYED', 'POOR']).default('NEAR_MINT'),
  language: z.string().default('en'),
  acquiredPrice: z.number().nullable().optional(),
  acquiredCurrency: z.string().default('EUR'),
  forSale: z.boolean().default(false),
  salePrice: z.number().nullable().optional(),
  saleCurrency: z.string().default('EUR'),
  saleNotes: z.string().optional(),
  saleAlertEnabled: z.boolean().default(false),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const USER_ID = await getUserId()
  const body = createSchema.parse(await req.json())

  // If the user already has the same card+condition+finish+language, increment.
  const existing = await prisma.inventoryItem.findUnique({
    where: {
      userId_cardId_condition_finish_language: {
        userId: USER_ID,
        cardId: body.cardId,
        condition: body.condition,
        finish: body.finish,
        language: body.language,
      },
    },
  })

  if (existing) {
    const updated = await prisma.inventoryItem.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + body.quantity,
        ...(body.acquiredPrice ? { acquiredPrice: body.acquiredPrice } : {}),
      },
    })
    return NextResponse.json(updated)
  }

  const created = await prisma.inventoryItem.create({
    data: {
      userId: USER_ID,
      cardId: body.cardId,
      quantity: body.quantity,
      finish: body.finish,
      condition: body.condition,
      language: body.language,
      acquiredPrice: body.acquiredPrice ?? null,
      acquiredCurrency: body.acquiredCurrency,
      forSale: body.forSale,
      salePrice: body.salePrice ?? null,
      saleCurrency: body.saleCurrency,
      saleListedAt: body.forSale ? new Date() : null,
      saleAlertEnabled: body.saleAlertEnabled,
      saleNotes: body.saleNotes,
      notes: body.notes,
    },
  })
  if (body.forSale) await reconcileSaleAlerts(USER_ID)
  return NextResponse.json(created)
}

export async function GET() {
  const USER_ID = await getUserId()
  const items = await prisma.inventoryItem.findMany({
    where: { userId: USER_ID },
    include: { card: true },
    orderBy: [{ card: { setCode: 'asc' } }, { card: { name: 'asc' } }],
  })
  return NextResponse.json(items)
}
