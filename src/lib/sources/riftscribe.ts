/**
 * RiftScribe API client - free, no auth required.
 * Docs: https://riftscribe.gg/api-docs
 *
 * We use this as the primary card catalog source.
 */

const BASE = process.env.RIFTSCRIBE_API_BASE || 'https://riftscribe.gg/api'

export interface RiftScribeCard {
  id: string                // e.g. "OGN-001-298"
  set_id: string            // "OGN"
  collector_number: string  // "001"
  name: string
  rarity?: string
  faction?: string          // domain in Riftbound terminology
  type?: string
  cost?: number
  power?: number
  text?: string
  flavor_text?: string
  artist?: string
  image_url?: string
  tcgplayer_id?: string
  cardmarket_id?: string
  // pass-through for any new fields
  [k: string]: any
}

export interface ListCardsParams {
  set?: string
  rarity?: string
  name?: string
  page?: number
  page_size?: number
}

export async function listCards(params: ListCardsParams = {}): Promise<RiftScribeCard[]> {
  const qs = new URLSearchParams()
  if (params.set) qs.set('set', params.set)
  if (params.rarity) qs.set('rarity', params.rarity)
  if (params.name) qs.set('name', params.name)
  qs.set('page', String(params.page ?? 1))
  qs.set('page_size', String(params.page_size ?? 200))

  const url = `${BASE}/cards?${qs.toString()}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`RiftScribe ${res.status}: ${await res.text()}`)
  const data = await res.json()
  // RiftScribe wraps results - handle both shapes defensively
  return Array.isArray(data) ? data : (data.cards ?? data.results ?? data.data ?? [])
}

export async function fetchAllCards(): Promise<RiftScribeCard[]> {
  const all: RiftScribeCard[] = []
  let page = 1
  while (true) {
    const batch = await listCards({ page, page_size: 200 })
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < 200) break
    page++
    // be polite
    await new Promise((r) => setTimeout(r, 200))
  }
  return all
}

export async function getCard(id: string): Promise<RiftScribeCard | null> {
  const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`RiftScribe ${res.status}`)
  return res.json()
}
