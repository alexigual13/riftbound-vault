'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { validateDeck, DECK_RULES } from '@/lib/deck-rules'
import type { ValidationResult } from '@/lib/deck-rules'
import { Plus, Minus, Search, Trash2, Save, AlertCircle, CheckCircle2 } from 'lucide-react'

interface CardLite {
  id: string
  name: string
  setCode: string
  type: string | null
  rarity: string | null
  domain: string | null
  cost: number | null
  imageUrl: string | null
}

interface DeckLike {
  id: string
  name: string
  description: string | null
  format: string
  legendCardId: string | null
  chosenChampionCardId: string | null
  legendCard: CardLite | null
  chosenChampionCard: CardLite | null
  cards: { id: string; cardId: string; quantity: number; section: 'MAIN' | 'RUNE' | 'BATTLEFIELD' | 'SIDEBOARD'; card: CardLite }[]
}

type Section = 'MAIN' | 'RUNE' | 'BATTLEFIELD' | 'SIDEBOARD'

const SECTIONS: { key: Section; label: string; target: string }[] = [
  { key: 'MAIN', label: 'Main Deck', target: '40' },
  { key: 'RUNE', label: 'Runas', target: '12' },
  { key: 'BATTLEFIELD', label: 'Battlefields', target: '3' },
  { key: 'SIDEBOARD', label: 'Sideboard', target: '0/8' },
]

export function DeckEditor({ deck, allCards }: { deck: DeckLike; allCards: CardLite[] }) {
  const router = useRouter()
  const [name, setName] = useState(deck.name)
  const [description, setDescription] = useState(deck.description ?? '')
  const [section, setSection] = useState<Section>('MAIN')
  const [search, setSearch] = useState('')
  const [filterDomain, setFilterDomain] = useState('')
  const [cards, setCards] = useState(deck.cards)
  const [legendId, setLegendId] = useState(deck.legendCardId ?? '')
  const [championId, setChampionId] = useState(deck.chosenChampionCardId ?? '')
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  // Build deck bundle for validation
  const validation = useMemo<ValidationResult>(() => {
    const legend = allCards.find((c) => c.id === legendId) ?? null
    const champion = allCards.find((c) => c.id === championId) ?? null
    return validateDeck({
      ...deck,
      legendCardId: legendId || null,
      chosenChampionCardId: championId || null,
      legendCard: legend as any,
      chosenChampionCard: champion as any,
      cards: cards.map((c) => ({ ...c, card: c.card as any })) as any,
    } as any)
  }, [allCards, legendId, championId, cards, deck])

  const legendDomains = useMemo(() => {
    const legend = allCards.find((c) => c.id === legendId)
    if (!legend?.domain) return []
    return legend.domain.split(/[\/,;|]/).map((s) => s.trim()).filter(Boolean)
  }, [allCards, legendId])

  // Filter card picker by section + domain + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const wantsRune = section === 'RUNE'
    const wantsBattlefield = section === 'BATTLEFIELD'
    const wantsLegend = false
    return allCards
      .filter((c) => {
        const t = (c.type ?? '').toLowerCase()
        if (wantsRune && !t.includes('rune')) return false
        if (wantsBattlefield && !t.includes('battlefield')) return false
        if (!wantsRune && !wantsBattlefield && !wantsLegend) {
          // For MAIN / SIDEBOARD: hide runes, battlefields, legends
          if (t.includes('rune') || t.includes('battlefield') || t.includes('legend')) return false
        }
        if (filterDomain) {
          const d = (c.domain ?? '').toLowerCase()
          if (!d.includes(filterDomain.toLowerCase())) return false
        }
        if (q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false
        // For MAIN / SIDEBOARD: enforce legend domain
        if ((section === 'MAIN' || section === 'SIDEBOARD') && legendDomains.length > 0 && c.domain) {
          const cd = c.domain.split(/[\/,;|]/).map((s) => s.trim())
          if (!cd.every((d) => legendDomains.includes(d))) return false
        }
        return true
      })
      .slice(0, 60)
  }, [allCards, search, filterDomain, section, legendDomains])

  function adjust(cardId: string, delta: number) {
    setCards((prev) => {
      const existing = prev.find((c) => c.cardId === cardId && c.section === section)
      if (existing) {
        const newQty = existing.quantity + delta
        if (newQty <= 0) return prev.filter((c) => c.id !== existing.id)
        return prev.map((c) => (c.id === existing.id ? { ...c, quantity: newQty } : c))
      }
      if (delta <= 0) return prev
      const card = allCards.find((c) => c.id === cardId)
      if (!card) return prev
      return [
        ...prev,
        { id: `tmp-${Math.random()}`, cardId, quantity: delta, section, card },
      ]
    })
  }

  async function save() {
    setSaved(false)
    const body = {
      name,
      description,
      legendCardId: legendId || null,
      chosenChampionCardId: championId || null,
      isLegal: validation.legal,
      cards: cards.map((c) => ({ cardId: c.cardId, quantity: c.quantity, section: c.section })),
    }
    const res = await fetch(`/api/decks/${deck.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setSaved(true)
      startTransition(() => router.refresh())
      setTimeout(() => setSaved(false), 2000)
    } else {
      alert('Error: ' + (await res.text()))
    }
  }

  async function deleteDeck() {
    if (!confirm(`¿Borrar "${deck.name}"? Esta acción es definitiva.`)) return
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/decks')
  }

  // Lookups for legend + champion dropdowns
  const legends = allCards.filter((c) => (c.type ?? '').toLowerCase().includes('legend'))
  const champions = allCards.filter((c) => {
    const t = (c.type ?? '').toLowerCase()
    if (!t.includes('champion') && !t.includes('unit')) return false
    if (!legendId) return true
    const legend = allCards.find((c) => c.id === legendId)
    if (!legend) return true
    const legendName = legend.name.split(',')[0].trim().toLowerCase()
    return c.name.toLowerCase().startsWith(legendName)
  })

  const counts = validation.counts

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            className="h-auto border-0 bg-transparent px-0 font-display text-3xl tracking-wide"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            className="mt-1 h-auto border-0 bg-transparent px-0 text-sm text-muted-foreground"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {validation.legal ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Legal
            </Badge>
          ) : (
            <Badge variant="warning">
              <AlertCircle className="mr-1 h-3 w-3" /> {validation.issues.filter((i) => i.severity === 'error').length} errores
            </Badge>
          )}
          <Button onClick={save} disabled={pending}>
            <Save className="h-4 w-4" /> {saved ? 'Guardado' : pending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" size="icon" onClick={deleteDeck} title="Eliminar mazo">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Left: Deck contents */}
        <div className="space-y-4">
          {/* Legend & Champion */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Legend & Chosen Champion</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Legend
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
                  value={legendId}
                  onChange={(e) => setLegendId(e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {legends.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.domain ? `(${l.domain})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Chosen Champion
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
                  value={championId}
                  onChange={(e) => setChampionId(e.target.value)}
                  disabled={!legendId}
                >
                  <option value="">— Selecciona —</option>
                  {champions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.domain ? `(${c.domain})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          {/* Section tabs */}
          <div className="flex flex-wrap gap-1 rounded-md border border-border/40 p-1">
            {SECTIONS.map((s) => {
              const active = section === s.key
              const cnt = cards
                .filter((c) => c.section === s.key)
                .reduce((sum, c) => sum + c.quantity, 0)
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-accent/5')
                  }
                >
                  {s.label} <span className="ml-1 tabular-nums">({cnt}/{s.target})</span>
                </button>
              )
            })}
          </div>

          {/* Section contents */}
          <Card>
            <CardContent className="pt-5">
              {(() => {
                const inSection = cards.filter((c) => c.section === section)
                if (inSection.length === 0)
                  return (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Sin cartas todavía. Añade desde el panel de la derecha.
                    </p>
                  )
                return (
                  <ul className="divide-y divide-border/40">
                    {inSection.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-2">
                        {c.card.imageUrl && (
                          <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded">
                            <Image src={c.card.imageUrl} alt={c.card.name} fill sizes="40px" className="object-cover" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{c.card.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {c.cardId} · {c.card.type} {c.card.cost != null && `· coste ${c.card.cost}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => adjust(c.cardId, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums">{c.quantity}</span>
                          <Button size="icon" variant="ghost" onClick={() => adjust(c.cardId, +1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </CardContent>
          </Card>

          {/* Validation panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Validación</CardTitle>
              <CardDescription>
                Reglas: {DECK_RULES.MAIN_SIZE} main · {DECK_RULES.RUNE_SIZE} runas · {DECK_RULES.BATTLEFIELD_COUNT} battlefields · max {DECK_RULES.MAX_COPIES} copias
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validation.issues.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Mazo legal en formato {deck.format}.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {validation.issues.map((iss, i) => (
                    <li
                      key={i}
                      className={
                        'flex items-start gap-2 rounded-md border p-2 text-sm ' +
                        (iss.severity === 'error'
                          ? 'border-rose-500/30 bg-rose-500/5 text-rose-200'
                          : 'border-amber-500/30 bg-amber-500/5 text-amber-200')
                      }
                    >
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <span className="font-medium">{iss.message}</span>
                        {iss.detail && <span className="block text-xs opacity-80">{iss.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Card picker */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Añadir cartas a {SECTIONS.find((s) => s.key === section)?.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar por nombre o ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>
            {(section === 'MAIN' || section === 'SIDEBOARD') && (
              <>
                {legendDomains.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Filtrado a dominios del Legend: <strong>{legendDomains.join(' / ')}</strong>
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setFilterDomain('')}
                    className={
                      'rounded px-2 py-0.5 text-xs ' +
                      (filterDomain === '' ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground')
                    }
                  >
                    Todos
                  </button>
                  {(legendDomains.length > 0 ? legendDomains : ['Body', 'Calm', 'Chaos', 'Fury', 'Mind', 'Order']).map((d) => (
                    <button
                      key={d}
                      onClick={() => setFilterDomain(d)}
                      className={
                        'rounded px-2 py-0.5 text-xs ' +
                        (filterDomain === d ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground')
                      }
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
            <ul className="max-h-[55vh] divide-y divide-border/40 overflow-y-auto">
              {filtered.map((c) => {
                const inDeck = cards.find((cc) => cc.cardId === c.id && cc.section === section)
                return (
                  <li key={c.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {c.id} · {c.type} {c.cost != null && `· ${c.cost}P`} {c.domain && `· ${c.domain}`}
                      </p>
                    </div>
                    {inDeck && <span className="text-xs tabular-nums text-accent">×{inDeck.quantity}</span>}
                    <Button size="icon" variant="secondary" onClick={() => adjust(c.id, +1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">Sin resultados</li>
              )}
            </ul>
            <p className="text-center text-[10px] text-muted-foreground">
              Mostrando {filtered.length} de {allCards.length}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
