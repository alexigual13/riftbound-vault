'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { format } from 'date-fns'

interface Point {
  t: string
  v: number | null
}

interface Props {
  tcg: Point[]
  cm: Point[]
}

export function PriceHistoryChart({ tcg, cm }: Props) {
  // Merge into a single timeline keyed by date.
  const map = new Map<string, { date: string; tcgplayer: number | null; cardmarket: number | null }>()
  for (const p of tcg) {
    const key = p.t.slice(0, 10)
    map.set(key, { date: key, tcgplayer: p.v, cardmarket: map.get(key)?.cardmarket ?? null })
  }
  for (const p of cm) {
    const key = p.t.slice(0, 10)
    const e = map.get(key) ?? { date: key, tcgplayer: null, cardmarket: null }
    e.cardmarket = p.v
    map.set(key, e)
  }
  const data = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No hay datos de precio. Ejecuta <code className="px-1 text-accent">npm run sync:prices</code>.
      </div>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v) => format(new Date(v), 'd MMM')}
          />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
            }}
            labelFormatter={(v) => format(new Date(v as string), 'd MMM yyyy')}
            formatter={(v: any, name) => [
              v == null ? '—' : `${Number(v).toFixed(2)}`,
              name === 'tcgplayer' ? 'TCGPlayer (USD)' : 'Cardmarket (EUR)',
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="tcgplayer"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            connectNulls
            name="TCGPlayer (USD)"
          />
          <Line
            type="monotone"
            dataKey="cardmarket"
            stroke="hsl(280 80% 60%)"
            strokeWidth={2}
            dot={false}
            connectNulls
            name="Cardmarket (EUR)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
