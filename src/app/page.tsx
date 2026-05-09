import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { getUserId } from '@/lib/auth'
import Link from 'next/link'
import { Bell, Library, Layers, TrendingUp, TrendingDown } from 'lucide-react'


async function getStats() {
  const USER_ID = await getUserId()
  const [
    cardsTotal,
    inventoryItems,
    inventorySum,
    activeAlerts,
    triggeredAlerts,
    decks,
  ] = await Promise.all([
    prisma.card.count(),
    prisma.inventoryItem.aggregate({ where: { userId: USER_ID }, _sum: { quantity: true } }),
    prisma.inventoryItem.findMany({
      where: { userId: USER_ID },
      include: {
        card: {
          include: {
            prices: { orderBy: { capturedAt: 'desc' }, take: 1, where: { source: 'TCGPLAYER' } },
          },
        },
      },
    }),
    prisma.alert.count({ where: { userId: USER_ID, status: 'ACTIVE' } }),
    prisma.alert.findMany({
      where: { userId: USER_ID, status: 'TRIGGERED' },
      include: { card: true },
      orderBy: { triggeredAt: 'desc' },
      take: 5,
    }),
    prisma.deck.count({ where: { userId: USER_ID } }),
  ])

  // Compute total inventory value at latest TCGPlayer market price (USD).
  let totalValue = 0
  for (const item of inventoryItems) {
    const price = item.card.prices[0]?.marketPrice?.toNumber() ?? 0
    totalValue += price * item.quantity
  }

  return {
    cardsTotal,
    uniqueCards: inventoryItems.length,
    totalCards: inventorySum._sum.quantity ?? 0,
    totalValue,
    activeAlerts,
    triggeredAlerts,
    decks,
  }
}

async function getTopMovers() {
  const USER_ID = await getUserId()
  // Last 7 days vs latest snapshot per card (TCGPlayer market price).
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const inventoryCards = await prisma.inventoryItem.findMany({
    where: { userId: USER_ID },
    distinct: ['cardId'],
    select: { cardId: true },
  })
  const ids = inventoryCards.map((c) => c.cardId)
  if (ids.length === 0) return []

  const snaps = await prisma.priceSnapshot.findMany({
    where: { cardId: { in: ids }, source: 'TCGPLAYER', capturedAt: { gte: since } },
    orderBy: { capturedAt: 'asc' },
  })

  const byCard = new Map<string, { first: number; last: number }>()
  for (const s of snaps) {
    const p = s.marketPrice?.toNumber() ?? null
    if (p == null) continue
    const e = byCard.get(s.cardId)
    if (!e) byCard.set(s.cardId, { first: p, last: p })
    else byCard.set(s.cardId, { first: e.first, last: p })
  }

  const movers = await Promise.all(
    [...byCard.entries()].map(async ([cardId, { first, last }]) => {
      const card = await prisma.card.findUnique({ where: { id: cardId } })
      const change = first ? ((last - first) / first) * 100 : 0
      return { card, change, last, first }
    }),
  )
  return movers
    .filter((m) => m.card)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6)
}

export default async function DashboardPage() {
  const stats = await getStats()
  const movers = await getTopMovers()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Dashboard</h1>
        <p className="text-muted-foreground">Bienvenido a tu colección de Riftbound.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor estimado</CardDescription>
            <CardTitle className="text-3xl">{formatPrice(stats.totalValue, 'USD')}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Precio TCGPlayer (USD), Near Mint
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cartas en colección</CardDescription>
            <CardTitle className="text-3xl">{stats.totalCards}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {stats.uniqueCards} únicas / {stats.cardsTotal} disponibles
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alertas activas</CardDescription>
            <CardTitle className="text-3xl">{stats.activeAlerts}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {stats.triggeredAlerts.length} activadas recientes
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mazos guardados</CardDescription>
            <CardTitle className="text-3xl">{stats.decks}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/decks" className="text-accent hover:underline">Gestionar mazos →</Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-accent" /> Movimientos (7 días)
            </CardTitle>
            <CardDescription>Cartas tuyas con mayor cambio de precio</CardDescription>
          </CardHeader>
          <CardContent>
            {movers.length === 0 ? (
              <EmptyState icon={Library} title="Sin datos todavía" body="Sincroniza precios para ver tendencias." />
            ) : (
              <ul className="space-y-3">
                {movers.map((m) => (
                  <li key={m.card!.id} className="flex items-center justify-between gap-3">
                    <Link href={`/cards/${m.card!.id}`} className="flex-1 truncate hover:text-accent">
                      <span className="text-xs text-muted-foreground">{m.card!.id} · </span>
                      {m.card!.name}
                    </Link>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatPrice(m.last, 'USD')}
                    </span>
                    <Badge variant={m.change >= 0 ? 'success' : 'danger'}>
                      {m.change >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                      {m.change.toFixed(1)}%
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-accent" /> Alertas activadas
            </CardTitle>
            <CardDescription>Tus condiciones que se han cumplido</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.triggeredAlerts.length === 0 ? (
              <EmptyState icon={Bell} title="Nada que reportar" body="Configura alertas para recibir avisos." />
            ) : (
              <ul className="space-y-3">
                {stats.triggeredAlerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <Link href={`/cards/${a.cardId}`} className="flex-1 truncate hover:text-accent">
                      <span className="text-xs text-muted-foreground">{a.cardId} · </span>
                      {a.card.name}
                    </Link>
                    <Badge variant="warning">{a.type.replace('PRICE_', '').replace('_', ' ')}</Badge>
                    <span className="text-sm tabular-nums">{formatPrice(a.triggeredPrice?.toNumber(), a.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
