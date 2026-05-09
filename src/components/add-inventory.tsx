'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface CardSearchResult {
  id: string
  name: string
  setCode: string
  imageUrl: string | null
  rarity: string | null
}

export function AddInventoryButton() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CardSearchResult[]>([])
  const [selected, setSelected] = useState<CardSearchResult | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [finish, setFinish] = useState<'NORMAL' | 'FOIL'>('NORMAL')
  const [condition, setCondition] = useState('NEAR_MINT')
  const [language, setLanguage] = useState('en')
  const [acquiredPrice, setAcquiredPrice] = useState('')
  const [forSale, setForSale] = useState(false)
  const [salePrice, setSalePrice] = useState('')
  const [saleAlertEnabled, setSaleAlertEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function search() {
    if (q.trim().length < 2) return
    const res = await fetch(`/api/cards?q=${encodeURIComponent(q)}`)
    if (res.ok) setResults(await res.json())
  }

  async function add() {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: selected.id,
        quantity,
        finish,
        condition,
        language,
        acquiredPrice: acquiredPrice ? Number(acquiredPrice) : null,
        forSale,
        salePrice: forSale && salePrice ? Number(salePrice) : null,
        saleAlertEnabled: forSale && saleAlertEnabled,
      }),
    })
    setBusy(false)
    if (res.ok) {
      setOpen(false)
      setSelected(null)
      setQ('')
      setResults([])
      setQuantity(1)
      setAcquiredPrice('')
      setForSale(false)
      setSalePrice('')
      router.refresh()
    } else {
      alert('Error al añadir: ' + (await res.text()))
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Añadir
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl">
            <header className="mb-4">
              <h2 className="font-display text-xl">Añadir carta al inventario</h2>
              <p className="text-sm text-muted-foreground">
                Busca por nombre o por ID (ej. OGN-1, Yasuo).
              </p>
            </header>

            <div className="mb-3 flex gap-2">
              <Input
                placeholder="Buscar carta…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
              <Button onClick={search} variant="secondary">
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {results.length > 0 && !selected && (
              <ul className="mb-4 max-h-60 space-y-1 overflow-y-auto rounded-md border border-border/60">
                {results.map((c) => (
                  <li
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-accent/10"
                    onClick={() => setSelected(c)}
                  >
                    <span className="text-xs text-muted-foreground">{c.id}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.rarity}</span>
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <div className="space-y-3">
                <div className="rounded-md border border-border/60 p-3">
                  <p className="font-medium">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.id} · {selected.setCode} · {selected.rarity}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Cantidad
                    <Input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-sm">
                    Acabado
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
                      value={finish}
                      onChange={(e) => setFinish(e.target.value as any)}
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="FOIL">Foil</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Condición
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                    >
                      <option value="MINT">Mint (M)</option>
                      <option value="NEAR_MINT">Near Mint (NM)</option>
                      <option value="EXCELLENT">Excellent (EX)</option>
                      <option value="GOOD">Good (GD)</option>
                      <option value="PLAYED">Played (PL)</option>
                      <option value="POOR">Poor (PO)</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Idioma
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="it">Italiano</option>
                      <option value="pt">Português</option>
                      <option value="ja">日本語</option>
                      <option value="ko">한국어</option>
                      <option value="zh-Hans">简体中文</option>
                      <option value="zh-Hant">繁體中文</option>
                    </select>
                  </label>
                  <label className="text-sm col-span-2">
                    Pagado (€, opcional)
                    <Input
                      type="number"
                      step="0.01"
                      value={acquiredPrice}
                      onChange={(e) => setAcquiredPrice(e.target.value)}
                    />
                  </label>
                </div>

                {/* For-sale section */}
                <div className="rounded-md border border-border/40 bg-secondary/30 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forSale}
                      onChange={(e) => setForSale(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="font-medium">Marcar como disponible para venta</span>
                  </label>
                  {forSale && (
                    <div className="space-y-2 pl-6">
                      <label className="block text-sm">
                        Precio de venta (€)
                        <Input
                          type="number"
                          step="0.01"
                          value={salePrice}
                          onChange={(e) => setSalePrice(e.target.value)}
                          placeholder="Tu precio de listado"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saleAlertEnabled}
                          onChange={(e) => setSaleAlertEnabled(e.target.checked)}
                          className="h-3 w-3 accent-primary"
                        />
                        <span>Avisarme si el mercado se mueve ±5% mientras esté listada</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setSelected(null)}>
                    Cambiar carta
                  </Button>
                  <Button onClick={add} disabled={busy}>
                    {busy ? 'Añadiendo…' : 'Añadir'}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
