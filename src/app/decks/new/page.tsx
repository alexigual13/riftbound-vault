import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { NewDeckForm } from './new-deck-form'

export default async function NewDeckPage() {
  // Heuristic: legends are cards with type containing "Legend"
  const legends = await prisma.card.findMany({
    where: {
      OR: [{ type: { contains: 'Legend', mode: 'insensitive' } }],
    },
    orderBy: [{ name: 'asc' }],
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl">Nuevo mazo</h1>
        <p className="text-muted-foreground">Elige Legend; el resto lo editas en el editor.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Detalles</CardTitle>
          <CardDescription>El Legend define los dominios disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewDeckForm legends={legends.map((l) => ({ id: l.id, name: l.name, domain: l.domain }))} />
        </CardContent>
      </Card>
    </div>
  )
}
