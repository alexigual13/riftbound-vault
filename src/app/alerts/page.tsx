

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { format } from 'date-fns'
import { getUserId } from '@/lib/auth'
import { PushSubscribeButton } from '@/components/push-subscribe-button'

export default async function AlertsPage() {
  const USER_ID = await getUserId()
  const alerts = await prisma.alert.findMany({
    where: { userId: USER_ID },
    include: { card: true },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
  })

  const triggered = alerts.filter((a) => a.status === 'TRIGGERED')
  const active = alerts.filter((a) => a.status === 'ACTIVE')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Alertas</h1>
          <p className="text-muted-foreground">
            Crea alertas desde la página de detalle de cualquier carta.
          </p>
        </div>
        <PushSubscribeButton />
      </header>

      {triggered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activadas ({triggered.length})</CardTitle>
            <CardDescription>Estas condiciones se han cumplido</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {triggered.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3"
                >
                  <div>
                    <Link href={`/cards/${a.cardId}`} className="font-medium hover:text-accent">
                      {a.card.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.card.id} ·{' '}
                      {a.thresholdPrice
                        ? `${a.type.replace('PRICE_', '')} ${a.thresholdPrice} ${a.currency}`
                        : `${a.type.replace('PRICE_', '')} ${a.thresholdPercent}%`}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="warning">{formatPrice(a.triggeredPrice?.toNumber(), a.currency)}</Badge>
                    {a.triggeredAt && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {format(a.triggeredAt, 'd MMM yyyy, HH:mm')}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activas ({active.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay alertas configuradas todavía.
            </p>
          ) : (
            <ul className="space-y-2">
              {active.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-border/40 p-3">
                  <div>
                    <Link href={`/cards/${a.cardId}`} className="font-medium hover:text-accent">
                      {a.card.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.card.id} ·{' '}
                      {a.thresholdPrice
                        ? `${a.type.replace('PRICE_', '').replace('_', ' ')} ${a.thresholdPrice} ${a.currency}`
                        : `${a.type.replace('PRICE_', '').replace('_', ' ')} ${a.thresholdPercent}%`}{' '}
                      ({a.source})
                    </p>
                  </div>
                  <Badge variant="outline">{a.lastCheckedAt ? `Última: ${format(a.lastCheckedAt, 'd MMM HH:mm')}` : 'Sin chequear'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
