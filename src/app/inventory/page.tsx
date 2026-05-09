

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { AddInventoryButton } from '@/components/add-inventory'
import { getUserId } from '@/lib/auth'

async function getInventory() {
  const USER_ID = await getUserId()
  return prisma.inventoryItem.findMany({
    where: { userId: USER_ID },
    include: {
      card: {
        include: {
          prices: { orderBy: { capturedAt: 'desc' }, take: 2 },
        },
      },
    },
    orderBy: [{ card: { setCode: 'asc' } }, { card: { name: 'asc' } }],
  })
}

export default async function InventoryPage() {
  const items = await getInventory()
  const totalCards = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = items.reduce((s, i) => {
    const price = i.card.prices[0]?.marketPrice?.toNumber() ?? 0
    return s + price * i.quantity
  }, 0)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Inventario</h1>
          <p className="text-muted-foreground">
            {items.length} entradas · {totalCards} cartas · {formatPrice(totalValue, 'USD')}
          </p>
        </div>
        <AddInventoryButton />
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-lg">Tu colección está vacía</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Añade cartas manualmente desde el botón de arriba o usa el escáner móvil para
              registrarlas automáticamente con la cámara.
            </p>
            <div className="flex gap-2">
              <Link href="/scan" className="text-sm text-accent hover:underline">
                → Ir al escáner
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => {
            const price = item.card.prices[0]?.marketPrice?.toNumber() ?? null
            return (
              <Link key={item.id} href={`/cards/${item.cardId}`} className="group">
                <Card className="overflow-hidden transition hover:border-accent/60">
                  <div className="relative aspect-[744/1039] bg-secondary">
                    {item.card.imageUrl ? (
                      <Image
                        src={item.card.imageUrl}
                        alt={item.card.name}
                        fill
                        sizes="(max-width: 768px) 50vw, 200px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        {item.card.name}
                      </div>
                    )}
                    <div className="absolute right-1 top-1 flex flex-col gap-1">
                      <Badge variant="default">×{item.quantity}</Badge>
                      {item.finish === 'FOIL' && <Badge variant="warning">Foil</Badge>}
                      {item.forSale && <Badge variant="success">En venta</Badge>}
                    </div>
                  </div>
                  <CardContent className="p-2">
                    <p className="truncate text-xs font-medium">{item.card.name}</p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{item.card.id}</span>
                      <span className="tabular-nums">{formatPrice(price, 'USD')}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
