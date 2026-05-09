'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import type { Alert } from '@prisma/client'
import { Trash2 } from 'lucide-react'

export function CreateAlertForm({
  cardId,
  existingAlerts,
}: {
  cardId: string
  existingAlerts: Alert[]
}) {
  const router = useRouter()
  const [type, setType] = useState<'PRICE_BELOW' | 'PRICE_ABOVE' | 'PRICE_DROP_PERCENT' | 'PRICE_RISE_PERCENT'>(
    'PRICE_BELOW',
  )
  const [source, setSource] = useState<'TCGPLAYER' | 'CARDMARKET'>('TCGPLAYER')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const isPercent = type.includes('PERCENT')
  const currency = source === 'TCGPLAYER' ? 'USD' : 'EUR'

  async function submit() {
    if (!value) return
    setBusy(true)
    const body: any = { cardId, type, source, currency }
    if (isPercent) body.thresholdPercent = Number(value)
    else body.thresholdPrice = Number(value)

    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (res.ok) {
      setValue('')
      router.refresh()
    } else {
      alert('Error: ' + (await res.text()))
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta alerta?')) return
    const res = await fetch(`/api/alerts/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="PRICE_BELOW">Cuando baje a</option>
          <option value="PRICE_ABOVE">Cuando suba a</option>
          <option value="PRICE_DROP_PERCENT">Cuando caiga %</option>
          <option value="PRICE_RISE_PERCENT">Cuando suba %</option>
        </select>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value as any)}
        >
          <option value="TCGPLAYER">TCGPlayer (USD)</option>
          <option value="CARDMARKET">Cardmarket (EUR)</option>
        </select>
        <Input
          type="number"
          step="0.01"
          className="w-28"
          placeholder={isPercent ? '%' : currency}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button onClick={submit} disabled={busy || !value}>
          Crear
        </Button>
      </div>

      {existingAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Alertas existentes</p>
          <ul className="space-y-1.5">
            {existingAlerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-secondary/40 px-3 py-2 text-sm"
              >
                <span>
                  <Badge variant={a.status === 'TRIGGERED' ? 'warning' : 'outline'}>{a.status}</Badge>
                  <span className="ml-2">
                    {a.type.replace('PRICE_', '').replace('_', ' ')}{' '}
                    {a.thresholdPrice
                      ? `${a.thresholdPrice} ${a.currency}`
                      : `${a.thresholdPercent}%`}{' '}
                    ({a.source})
                  </span>
                </span>
                <Button size="icon" variant="ghost" onClick={() => remove(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
