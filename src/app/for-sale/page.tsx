import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatPercent } from '@/lib/utils'
import { Tag, TrendingUp, TrendingDown } from 'lucide-react'

export default async function ForSalePage() {
  const USER_ID = await getUserId()
  const items = await prisma.inventoryItem.findMany({
    where: { userId: USER_ID, forSale: true },
    include: {
      card: {
        include: {
          prices: {
            where: { source: 'TCGPLAYER', finish: 'NORMAL' },
            orderBy: { capturedAt: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { saleListedAt: 'desc' },
  })

  const totalListedValue = items.reduce(
    (s, i) => s + (i.salePrice ? i.salePrice.toNumber() * i.quantity : 0),
    0,
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">En venta</h1>
        <p className="text-muted-foreground">
          {items.length} entradas listadas · valor pedido: {formatPrice(totalListedValue, 'EUR')}
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Tag className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-lg">Sin cartas listadas para venta</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Marca cualquier carta de tu inventario como "Disponible para venta" para verla aquí.
              La app monitoriza el mercado y te avisa si tu precio se queda fuera de rango.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const market = item.card.prices[0]?.marketPrice?.toNumber() ?? null
            const sale = item.salePrice?.toNumber() ?? null
            // Compare your sale price (EUR) to TCGPlayer market (USD).
            // Best-effort: assume ~1 USD = ~0.92 EUR. For real apps, use a live FX rate.
            const marketEur = market != null ? market * 0.92 : null
            const delta = marketEur != null && sale != null ? ((sale - marketEur) / marketEur) * 100 : null

            return (
              <Card key={item.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded">
                    {item.card.imageUrl ? (
                      <Image
                        src={item.card.imageUrl}
                        alt={item.card.name}
                        fill
                        sizes="60px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-secondary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/cards/${item.cardId}`} className="font-medium hover:text-accent">
                      {item.card.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {item.cardId} · {item.condition} · {item.finish === 'FOIL' ? 'Foil' : 'Normal'} · {item.language.toUpperCase()} · ×{item.quantity}
                    </p>
                    {item.saleNotes && <p className="text-xs italic text-muted-foreground">{item.saleNotes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg tabular-nums">
                      {formatPrice(sale, item.saleCurrency ?? 'EUR')}
                    </p>
                    {marketEur != null && (
                      <p className="text-[10px] text-muted-foreground">
                        Mercado ~{formatPrice(marketEur, 'EUR')}
                      </p>
                    )}
                    {delta != null && (
                      <Badge variant={Math.abs(delta) < 5 ? 'success' : delta > 0 ? 'warning' : 'danger'} className="mt-1">
                        {delta > 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                        {formatPercent(delta)} vs mercado
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo funciona</CardTitle>
          <CardDescription>
            Cuando marcas una carta como "Disponible para venta" con la opción "Avisarme si el mercado se mueve ±5%" activada,
            la app crea automáticamente dos alertas (subida y bajada) que se evalúan en cada sync de precios.
            Si el mercado se mueve más de un 5% desde el momento en que listaste la carta, recibes notificación push
            para que reconsideres tu precio. Las alertas se archivan automáticamente cuando quitas la carta de venta.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
