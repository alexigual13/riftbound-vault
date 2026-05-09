import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { DeckEditor } from '@/components/deck-editor'

export default async function DeckPage({ params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const deck = await prisma.deck.findFirst({
    where: { id: params.id, userId: USER_ID },
    include: {
      cards: { include: { card: true } },
      legendCard: true,
      chosenChampionCard: true,
    },
  })
  if (!deck) return notFound()

  // Pre-load all cards once for the picker (much faster than searching the DB on every keystroke).
  const allCards = await prisma.card.findMany({
    select: {
      id: true,
      name: true,
      setCode: true,
      type: true,
      rarity: true,
      domain: true,
      cost: true,
      imageUrl: true,
    },
    orderBy: [{ setCode: 'asc' }, { name: 'asc' }],
  })

  return <DeckEditor deck={deck as any} allCards={allCards} />
}
