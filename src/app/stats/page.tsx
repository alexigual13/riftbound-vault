

import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatPrice } from '@/lib/utils'
import { getUserId } from '@/lib/auth'

export default async function StatsPage() {
  const USER_ID = await getUserId()
  const items = await prisma.inventoryItem.findMany({
    where: { userId: USER_ID },
    include: {
      card: { include: { prices: { orderBy: { capturedAt: 'desc' }, take: 1, where: { source: 'TCGPLAYER' } } } },
    },
  })

  // By set
  const bySet = new Map<string, { unique: number; total: number; value: number }>()
  // By rarity
  const byRarity = new Map<string, { unique: number; total: number; value: number }>()
  // By domain
  const byDomain = new Map<string, { unique: number; total: number; value: number }>()
  // By language
  const byLanguage = new Map<string, { unique: number; total: number; value: number }>()
  // By finish
  const byFinish = new Map<string, { unique: number; total: number; value: number }>()
  let totalValue = 0
  let totalSpent = 0
  let forSaleCount = 0
  let forSaleValue = 0

  for (const i of items) {
    const price = i.card.prices[0]?.marketPrice?.toNumber() ?? 0
    const value = price * i.quantity
    totalValue += value
    totalSpent += i.acquiredPrice ? i.acquiredPrice.toNumber() * i.quantity : 0
    if (i.forSale) {
      forSaleCount += i.quantity
      forSaleValue += i.salePrice ? i.salePrice.toNumber() * i.quantity : 0
    }

    function bump(map: Map<string, { unique: number; total: number; value: number }>, key: string) {
      const e = map.get(key) ?? { unique: 0, total: 0, value: 0 }
      e.unique += 1
      e.total += i.quantity
      e.value += value
      map.set(key, e)
    }
    bump(bySet, i.card.setCode)
    bump(byRarity, i.card.rarity ?? 'Unknown')
    bump(byDomain, i.card.domain ?? 'Unknown')
    bump(byLanguage, i.language.toUpperCase())
    bump(byFinish, i.finish === 'FOIL' ? 'Foil' : 'Normal')
  }

  // Total cards in each set for completion %
  const setTotals = await prisma.card.groupBy({
    by: ['setCode'],
    _count: { id: true },
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Estadísticas</h1>
        <p className="text-muted-foreground">Una mirada a tu colección.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor estimado</CardDescription>
            <CardTitle className="text-3xl">{formatPrice(totalValue, 'USD')}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">A precio de mercado TCGPlayer</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total invertido</CardDescription>
            <CardTitle className="text-3xl">{formatPrice(totalSpent, 'EUR')}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Suma de "Pagado" en cada entrada</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>En venta</CardDescription>
            <CardTitle className="text-3xl">{forSaleCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Valor pedido: {formatPrice(forSaleValue, 'EUR')}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DistributionCard title="Por set" entries={bySet} setTotals={setTotals} />
        <DistributionCard title="Por rareza" entries={byRarity} />
        <DistributionCard title="Por dominio" entries={byDomain} />
        <DistributionCard title="Por idioma" entries={byLanguage} />
        <DistributionCard title="Por acabado" entries={byFinish} />
      </div>
    </div>
  )
}

function DistributionCard({
  title,
  entries,
  setTotals,
}: {
  title: string
  entries: Map<string, { unique: number; total: number; value: number }>
  setTotals?: { setCode: string; _count: { id: number } }[]
}) {
  const arr = [...entries.entries()].sort((a, b) => b[1].value - a[1].value)
  const totals = new Map(setTotals?.map((s) => [s.setCode, s._count.id]))
  const max = Math.max(1, ...arr.map((a) => a[1].value))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {arr.length === 0 && <p className="text-sm text-muted-foreground">Sin datos</p>}
        {arr.map(([k, v]) => {
          const setTotal = totals.get(k)
          const pct = setTotal ? Math.round((v.unique / setTotal) * 100) : null
          return (
            <div key={k}>
              <div className="flex justify-between text-sm">
                <span>
                  {k} {pct != null && <span className="text-xs text-muted-foreground">({pct}%)</span>}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {v.total} · {formatPrice(v.value, 'USD')}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-accent" style={{ width: `${(v.value / max) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
