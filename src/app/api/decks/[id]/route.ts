import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  format: z.string().optional(),
  legendCardId: z.string().nullable().optional(),
  chosenChampionCardId: z.string().nullable().optional(),
  isLegal: z.boolean().optional(),
  cards: z
    .array(
      z.object({
        cardId: z.string(),
        quantity: z.number().int().positive(),
        section: z.enum(['MAIN', 'RUNE', 'BATTLEFIELD', 'SIDEBOARD']),
      }),
    )
    .optional(),
})

async function ownDeck(id: string, userId: string) {
  const d = await prisma.deck.findFirst({ where: { id, userId } })
  return d
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const deck = await ownDeck(params.id, USER_ID)
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = updateSchema.parse(await req.json())

  // If `cards` is provided, replace the whole deck contents in a transaction.
  await prisma.$transaction(async (tx) => {
    await tx.deck.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.format !== undefined ? { format: body.format } : {}),
        ...(body.legendCardId !== undefined ? { legendCardId: body.legendCardId } : {}),
        ...(body.chosenChampionCardId !== undefined ? { chosenChampionCardId: body.chosenChampionCardId } : {}),
        ...(body.isLegal !== undefined ? { isLegal: body.isLegal } : {}),
      },
    })
    if (body.cards) {
      await tx.deckCard.deleteMany({ where: { deckId: params.id } })
      if (body.cards.length > 0) {
        await tx.deckCard.createMany({
          data: body.cards.map((c) => ({
            deckId: params.id,
            cardId: c.cardId,
            quantity: c.quantity,
            section: c.section,
          })),
        })
      }
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const deck = await ownDeck(params.id, USER_ID)
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.deck.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const deck = await prisma.deck.findFirst({
    where: { id: params.id, userId: USER_ID },
    include: { cards: { include: { card: true } }, legendCard: true, chosenChampionCard: true },
  })
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(deck)
}
