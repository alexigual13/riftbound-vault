import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json([])

  // Match by id (e.g. "OGN-1") or by name (case-insensitive contains).
  const cards = await prisma.card.findMany({
    where: {
      OR: [
        { id: { contains: q.toUpperCase() } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      setCode: true,
      imageUrl: true,
      rarity: true,
      domain: true,
      type: true,
    },
    take: 25,
    orderBy: [{ setCode: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(cards)
}
