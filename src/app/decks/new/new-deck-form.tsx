'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LegendOption {
  id: string
  name: string
  domain: string | null
}

export function NewDeckForm({ legends }: { legends: LegendOption[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [legendId, setLegendId] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, legendCardId: legendId || null }),
    })
    setBusy(false)
    if (res.ok) {
      const deck = await res.json()
      router.push(`/decks/${deck.id}`)
    } else {
      alert('Error: ' + (await res.text()))
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Nombre
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi Jinx aggro" />
      </label>
      <label className="block text-sm">
        Legend
        <select
          className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
          value={legendId}
          onChange={(e) => setLegendId(e.target.value)}
        >
          <option value="">— Sin Legend (puedes asignarlo después) —</option>
          {legends.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.domain ? ` (${l.domain})` : ''}
            </option>
          ))}
        </select>
        {legends.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No se encontraron Legends. Sincroniza el catálogo (`npm run sync:cards`).
          </p>
        )}
      </label>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!name || busy}>
          {busy ? 'Creando…' : 'Crear y abrir editor'}
        </Button>
      </div>
    </div>
  )
}
