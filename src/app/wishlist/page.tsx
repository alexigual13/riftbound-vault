

import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatPrice } from '@/lib/utils'
import Link from 'next/link'
import { getUserId } from '@/lib/auth'

export default async function WishlistPage() {
  const USER_ID = await getUserId()
  const items = await prisma.wishlistItem.findMany({
    where: { userId: USER_ID },
    include: {
      card: {
        include: {
          prices: { orderBy: { capturedAt: 'desc' }, take: 1, where: { source: 'TCGPLAYER' } },
        },
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Wishlist</h1>
        <p className="text-muted-foreground">
          Cartas que quieres adquirir. El sync de precios prioriza estas para que tus alertas vayan
          al día.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{items.length} en lista</CardTitle>
          <CardDescription>
            Añade cartas a la wishlist desde la página de detalle (función v0.2 — el endpoint API ya
            está listo en{' '}
            <code className="text-accent">/api/wishlist</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aún no has añadido nada a la wishlist.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((w) => {
                const current = w.card.prices[0]?.marketPrice?.toNumber() ?? null
                const target = w.targetPrice?.toNumber() ?? null
                const reached = current != null && target != null && current <= target
                return (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/40 p-3"
                  >
                    <div>
                      <Link href={`/cards/${w.cardId}`} className="font-medium hover:text-accent">
                        {w.card.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{w.card.id}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className={reached ? 'text-emerald-400' : ''}>
                        Actual: {formatPrice(current, 'USD')}
                      </p>
                      <p className="text-xs text-muted-foreground">Objetivo: {formatPrice(target, w.currency)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
