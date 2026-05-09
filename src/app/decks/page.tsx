import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Layers } from 'lucide-react'

export default async function DecksPage() {
  const USER_ID = await getUserId()
  const decks = await prisma.deck.findMany({
    where: { userId: USER_ID },
    include: {
      legendCard: true,
      chosenChampionCard: true,
      _count: { select: { cards: true } },
    },
    orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Mazos</h1>
          <p className="text-muted-foreground">{decks.length} mazos guardados</p>
        </div>
        <Link href="/decks/new">
          <Button>
            <Plus className="h-4 w-4" /> Nuevo mazo
          </Button>
        </Link>
      </header>

      {decks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-lg">Aún no tienes mazos</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Crea tu primer mazo eligiendo un Legend. La validación de reglas Riftbound (40 cartas, 12 runas, 3 battlefields, dominios) es automática.
            </p>
            <Link href="/decks/new">
              <Button>
                <Plus className="h-4 w-4" /> Crear primer mazo
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <Link key={d.id} href={`/decks/${d.id}`} className="group">
              <Card className="h-full transition hover:border-accent/60">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{d.name}</CardTitle>
                    <Badge variant={d.isLegal ? 'success' : 'warning'}>
                      {d.isLegal ? 'Legal' : 'Editando'}
                    </Badge>
                  </div>
                  {d.legendCard ? (
                    <CardDescription>
                      {d.legendCard.name}
                      {d.legendCard.domain && ` · ${d.legendCard.domain}`}
                    </CardDescription>
                  ) : (
                    <CardDescription>Sin Legend</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {d._count.cards} entradas · {d.format}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
