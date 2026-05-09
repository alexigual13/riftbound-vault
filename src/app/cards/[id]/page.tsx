

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatPercent } from '@/lib/utils'
import { PriceHistoryChart } from '@/components/price-history-chart'
import { CreateAlertForm } from '@/components/create-alert-form'
import { getUserId } from '@/lib/auth'

export default async function CardDetailPage({ params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const id = decodeURIComponent(params.id)
  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      prices: { orderBy: { capturedAt: 'asc' } },
      inventory: { where: { userId: USER_ID } },
      alerts: { where: { userId: USER_ID } },
    },
  })
  if (!card) return notFound()

  const tcgPrices = card.prices.filter((p) => p.source === 'TCGPLAYER')
  const cmPrices = card.prices.filter((p) => p.source === 'CARDMARKET')
  // Latest aggregate snapshots for headline cards
  const latestTcg = tcgPrices.filter((p) => p.finish === 'NORMAL').pop() ?? tcgPrices[tcgPrices.length - 1]
  const latestCmAgg = cmPrices
    .filter((p) => p.condition == null && p.language == null && p.sellerCountry == null)
    .pop()
  // Latest granular snapshots (each combination is recorded as a separate row in the same sync run)
  const latestSyncTime = cmPrices[cmPrices.length - 1]?.capturedAt
  const latestCmSlices = latestSyncTime
    ? cmPrices.filter(
        (p) => p.capturedAt.getTime() === latestSyncTime.getTime() && (p.condition != null || p.language != null || p.sellerCountry != null || p.sellerType !== 'ANY' && p.sellerType != null),
      )
    : []

  // Compute 7d / 30d change vs latest
  const tcgChange = computeChange(tcgPrices.filter((p) => p.finish === 'NORMAL').map((p) => ({ at: p.capturedAt, v: p.marketPrice?.toNumber() ?? null })))
  const cmChange = computeChange(
    cmPrices
      .filter((p) => p.condition == null && p.language == null)
      .map((p) => ({ at: p.capturedAt, v: p.trendPrice?.toNumber() ?? null })),
  )

  const inv = card.inventory.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-[744/1039] overflow-hidden rounded-lg border border-border/60 bg-secondary">
            {card.imageUrl ? (
              <Image src={card.imageUrl} alt={card.name} fill sizes="280px" className="object-cover" priority />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center">{card.name}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {card.rarity && <Badge>{card.rarity}</Badge>}
            {card.domain && <Badge variant="secondary">{card.domain}</Badge>}
            {card.type && <Badge variant="outline">{card.type}</Badge>}
            <Badge variant="outline">×{inv} en inventario</Badge>
          </div>
        </div>

        <div className="space-y-4">
          <header>
            <p className="text-sm text-muted-foreground">{card.id} · {card.setCode}</p>
            <h1 className="text-3xl">{card.name}</h1>
            {card.artist && <p className="text-sm text-muted-foreground">Ilustración: {card.artist}</p>}
          </header>

          {card.rules && (
            <Card>
              <CardContent className="pt-5 text-sm leading-relaxed">{card.rules}</CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <PriceCard
              label="TCGPlayer (USD)"
              price={latestTcg?.marketPrice?.toNumber()}
              currency="USD"
              change7d={tcgChange.d7}
              change30d={tcgChange.d30}
              available={tcgPrices.length > 0}
            />
            <PriceCard
              label="Cardmarket (EUR)"
              price={latestCmAgg?.trendPrice?.toNumber() ?? latestCmAgg?.lowPrice?.toNumber()}
              currency="EUR"
              change7d={cmChange.d7}
              change30d={cmChange.d30}
              available={cmPrices.length > 0}
            />
          </div>

          {/* Granular Cardmarket breakdown */}
          {latestCmSlices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Desglose Cardmarket</CardTitle>
                <CardDescription>
                  Precio mínimo según condición, idioma, país y tipo de vendedor (último sync)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {latestCmSlices.map((s, i) => {
                  const tags: string[] = []
                  if (s.condition) tags.push(s.condition.replace('_', ' '))
                  if (s.finish) tags.push(s.finish === 'FOIL' ? 'Foil' : 'Normal')
                  if (s.language) tags.push(`idioma ${s.language.toUpperCase()}`)
                  if (s.sellerCountry) tags.push(`vendedor ${s.sellerCountry}`)
                  if (s.sellerType && s.sellerType !== 'ANY') tags.push(s.sellerType.toLowerCase())
                  const v = s.lowPrice?.toNumber() ?? s.trendPrice?.toNumber()
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">{tags.join(' · ') || 'agregado'}</span>
                      <span className="tabular-nums">{formatPrice(v ?? null, 'EUR')}</span>
                    </div>
                  )
                })}
                <p className="pt-2 text-[10px] text-muted-foreground">
                  Los campos disponibles dependen de lo que exponga cardmarket-api.com.
                  Si te faltan combinaciones, ese servicio aún no las ofrece.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historial de precios</CardTitle>
              <CardDescription>Comparativa entre fuentes</CardDescription>
            </CardHeader>
            <CardContent>
              <PriceHistoryChart
                tcg={tcgPrices.filter((p) => p.finish === 'NORMAL').map((p) => ({ t: p.capturedAt.toISOString(), v: p.marketPrice?.toNumber() ?? null }))}
                cm={cmPrices.filter((p) => p.condition == null && p.language == null && p.sellerCountry == null).map((p) => ({ t: p.capturedAt.toISOString(), v: p.trendPrice?.toNumber() ?? p.lowPrice?.toNumber() ?? null }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crear alerta</CardTitle>
              <CardDescription>Recibe aviso cuando el precio cumpla la condición</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateAlertForm cardId={card.id} existingAlerts={card.alerts} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PriceCard(props: {
  label: string
  price: number | undefined | null
  currency: string
  change7d: number | null
  change30d: number | null
  available: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{props.label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {props.available ? formatPrice(props.price ?? null, props.currency) : '—'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex gap-3 text-xs">
        {props.change7d != null && (
          <Badge variant={props.change7d >= 0 ? 'success' : 'danger'}>
            7d {formatPercent(props.change7d)}
          </Badge>
        )}
        {props.change30d != null && (
          <Badge variant={props.change30d >= 0 ? 'success' : 'danger'}>
            30d {formatPercent(props.change30d)}
          </Badge>
        )}
        {!props.available && <span className="text-muted-foreground">Sin datos todavía</span>}
      </CardContent>
    </Card>
  )
}

function computeChange(series: { at: Date; v: number | null }[]) {
  const last = series.filter((s) => s.v != null).pop()
  if (!last || last.v == null) return { d7: null, d30: null }
  // Capture into a local primitive so TS narrowing survives the closure.
  const lastValue = last.v
  const lastTime = last.at.getTime()
  function findClosest(daysAgo: number) {
    const target = lastTime - daysAgo * 24 * 3600 * 1000
    let closest: { at: Date; v: number | null } | null = null
    let bestDiff = Infinity
    for (const s of series) {
      if (s.v == null) continue
      const d = Math.abs(s.at.getTime() - target)
      if (d < bestDiff) {
        bestDiff = d
        closest = s
      }
    }
    if (!closest || closest.v == null) return null
    return ((lastValue - closest.v) / closest.v) * 100
  }
  return { d7: findClosest(7), d30: findClosest(30) }
}
