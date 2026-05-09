

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getUserId } from '@/lib/auth'

const schema = z.object({
  cardId: z.string(),
  type: z.enum(['PRICE_BELOW', 'PRICE_ABOVE', 'PRICE_DROP_PERCENT', 'PRICE_RISE_PERCENT']),
  source: z.enum(['TCGPLAYER', 'CARDMARKET']).default('TCGPLAYER'),
  thresholdPrice: z.number().nullable().optional(),
  thresholdPercent: z.number().nullable().optional(),
  currency: z.string().default('USD'),
  note: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const USER_ID = await getUserId()
  const body = schema.parse(await req.json())
  const isPercent = body.type.includes('PERCENT')

  // For percent alerts we need a baseline = latest known price.
  let baselinePrice: number | null = null
  if (isPercent) {
    const latest = await prisma.priceSnapshot.findFirst({
      where: { cardId: body.cardId, source: body.source },
      orderBy: { capturedAt: 'desc' },
    })
    baselinePrice =
      latest?.marketPrice?.toNumber() ??
      latest?.trendPrice?.toNumber() ??
      latest?.lowPrice?.toNumber() ??
      null
  }

  const alert = await prisma.alert.create({
    data: {
      userId: USER_ID,
      cardId: body.cardId,
      type: body.type,
      source: body.source,
      thresholdPrice: body.thresholdPrice ?? null,
      thresholdPercent: body.thresholdPercent ?? null,
      baselinePrice,
      currency: body.currency,
      note: body.note,
    },
  })
  return NextResponse.json(alert)
}

export async function GET() {
  const USER_ID = await getUserId()
  const alerts = await prisma.alert.findMany({
    where: { userId: USER_ID },
    include: { card: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(alerts)
}
