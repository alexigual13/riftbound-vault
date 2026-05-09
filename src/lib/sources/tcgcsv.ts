/**
 * TCGCSV - free, public mirror of TCGplayer's product/price data.
 * Docs: https://tcgcsv.com/
 *
 * Structure: categories -> groups (sets) -> products (cards) + prices.
 * Riftbound is a category; each set is a group; each card has a productId
 * which we store as Card.tcgplayerId for joining.
 */

import { parse } from 'csv-parse/sync'

const BASE = process.env.TCGCSV_BASE || 'https://tcgcsv.com'
const CATEGORY_ID = process.env.TCGPLAYER_CATEGORY_ID || '89'

export interface TcgGroup {
  groupId: number
  name: string         // e.g. "Origins"
  abbreviation?: string // e.g. "OGN"
  publishedOn?: string
  modifiedOn?: string
  categoryId: number
}

export interface TcgProduct {
  productId: number
  name: string
  cleanName?: string
  imageUrl?: string
  groupId: number
  url?: string
  modifiedOn?: string
  extendedData?: { name: string; displayName?: string; value: string }[]
}

export interface TcgPrice {
  productId: number
  lowPrice: number | null
  midPrice: number | null
  highPrice: number | null
  marketPrice: number | null
  directLowPrice: number | null
  subTypeName: string  // "Normal" | "Foil"
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`TCGCSV ${res.status} on ${path}`)
  const data = await res.json()
  // TCGCSV wraps results in { results: [...] }
  return (data?.results ?? data) as T
}

export async function listGroups(): Promise<TcgGroup[]> {
  return fetchJson<TcgGroup[]>(`/tcgplayer/${CATEGORY_ID}/groups`)
}

export async function listProducts(groupId: number): Promise<TcgProduct[]> {
  return fetchJson<TcgProduct[]>(`/tcgplayer/${CATEGORY_ID}/${groupId}/products`)
}

export async function listPrices(groupId: number): Promise<TcgPrice[]> {
  return fetchJson<TcgPrice[]>(`/tcgplayer/${CATEGORY_ID}/${groupId}/prices`)
}

/**
 * Convenience helper: returns a Map keyed by productId with both normal and foil prices.
 */
export async function getPricesByProductId(
  groupId: number,
): Promise<Map<number, { normal?: TcgPrice; foil?: TcgPrice }>> {
  const prices = await listPrices(groupId)
  const map = new Map<number, { normal?: TcgPrice; foil?: TcgPrice }>()
  for (const p of prices) {
    const entry = map.get(p.productId) ?? {}
    if (p.subTypeName?.toLowerCase().includes('foil')) entry.foil = p
    else entry.normal = p
    map.set(p.productId, entry)
  }
  return map
}
