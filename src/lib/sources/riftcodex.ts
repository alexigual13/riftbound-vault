/**
 * Riftcodex API client - free, no auth required.
 * Docs: https://riftcodex.com/docs/endpoints/cards/
 *
 * Useful as a fallback and especially for the get-by-tcgplayer-id endpoint,
 * which lets us map TCGCSV product ids back to our Card.id.
 */

const BASE = process.env.RIFTCODEX_API_BASE || 'https://api.riftcodex.com'

export interface RiftcodexCard {
  id: string
  riftbound_id?: string  // e.g. "OGN-001"
  tcgplayer_id?: string
  name: string
  set_id?: string
  collector_number?: string
  rarity?: string
  domain?: string
  type?: string
  image_url?: string
  [k: string]: any
}

export async function getByTcgplayerId(tcgplayerId: string | number): Promise<RiftcodexCard | null> {
  const res = await fetch(`${BASE}/cards/tcgplayer/${tcgplayerId}`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Riftcodex ${res.status}`)
  return res.json()
}

export async function searchByName(name: string, fuzzy = true): Promise<RiftcodexCard[]> {
  const qs = new URLSearchParams({ name, [fuzzy ? 'fuzzy' : 'exact']: 'true' })
  const res = await fetch(`${BASE}/cards/search?${qs}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Riftcodex ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.results ?? data.data ?? [])
}
