/**
 * RiftScribe API client - free, no auth required.
 * Docs: https://riftscribe.gg/api-docs
 *
 * We use this as the primary card catalog source.
 *
 * Pagination note: RiftScribe caps page_size at 100 server-side regardless
 * of what you request. We loop until we get an empty page.
 */

const BASE = process.env.RIFTSCRIBE_API_BASE || 'https://riftscribe.gg/api'
const PAGE_SIZE = 100 // matches RiftScribe's server-side cap

export interface RiftScribeCard {
  id: string
  set_id: string
  collector_number: string
  name: string
  rarity?: string
  faction?: string
  type?: string
  cost?: number
  power?: number
  text?: string
  flavor_text?: string
  artist?: string
  image_url?: string
  tcgplayer_id?: string
  cardmarket_id?: string
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
  qs.set('page_size', String(params.page_size ?? PAGE_SIZE))

  const url = `${BASE}/cards?${qs.toString()}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RiftboundVault/0.4 (open-source personal collection tracker)',
    },
  })
  if (!res.ok) throw new Error(`RiftScribe ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.cards ?? data.results ?? data.data ?? [])
}

export async function fetchAllCards(): Promise<RiftScribeCard[]> {
  const all: RiftScribeCard[] = []
  let page = 1
  // Hard limit to avoid runaway loops if the API misbehaves
  const MAX_PAGES = 20

  while (page <= MAX_PAGES) {
    process.stdout.write(`  …fetching page ${page} (have ${all.length})\r`)
    const batch = await listCards({ page, page_size: PAGE_SIZE })
    if (batch.length === 0) break
    all.push(...batch)
    // Only stop if the page came back smaller than ANY plausible page size.
    // RiftScribe caps at 100, but defensive: stop only when truly under the cap.
    if (batch.length < PAGE_SIZE) break
    page++
    await new Promise((r) => setTimeout(r, 200))
  }
  process.stdout.write('\n')
  return all
}

export async function getCard(id: string): Promise<RiftScribeCard | null> {
  const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RiftboundVault/0.4 (open-source personal collection tracker)',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`RiftScribe ${res.status}`)
  return res.json()
}
