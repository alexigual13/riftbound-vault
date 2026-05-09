import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  legendCardId: z.string().nullable().optional(),
  description: z.string().optional(),
  format: z.string().default('standard'),
})

export async function POST(req: NextRequest) {
  const USER_ID = await getUserId()
  const body = createSchema.parse(await req.json())
  const deck = await prisma.deck.create({
    data: {
      userId: USER_ID,
      name: body.name,
      description: body.description,
      format: body.format,
      legendCardId: body.legendCardId ?? null,
    },
  })
  return NextResponse.json(deck)
}

export async function GET() {
  const USER_ID = await getUserId()
  const decks = await prisma.deck.findMany({
    where: { userId: USER_ID },
    include: { legendCard: true, _count: { select: { cards: true } } },
    orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
  })
  return NextResponse.json(decks)
}
