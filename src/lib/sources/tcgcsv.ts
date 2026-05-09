/**
 * TCGCSV - free, public mirror of TCGplayer's product/price data.
 * Docs: https://tcgcsv.com/
 *
 * Structure: categories -> groups (sets) -> products (cards) + prices.
 * Riftbound is a category; each set is a group; each card has a productId
 * which we store as Card.tcgplayerId for joining.
 *
 * Two important notes:
 *
 * 1. TCGCSV started rejecting requests without a User-Agent header (basic
 *    anti-bot protection). All fetches include one.
 *
 * 2. The Riftbound category ID is not stable across TCGCSV revisions. If
 *    the configured TCGPLAYER_CATEGORY_ID env var fails, we fall back to
 *    scanning all categories looking for one named "Riftbound" or similar.
 */

const BASE = process.env.TCGCSV_BASE || 'https://tcgcsv.com'
let CATEGORY_ID = process.env.TCGPLAYER_CATEGORY_ID || '89'

const UA = 'RiftboundVault/0.4 (open-source personal collection tracker)'

export interface TcgCategory {
  categoryId: number
  name: string
  displayName?: string
  popularity?: number
}

export interface TcgGroup {
  groupId: number
  name: string
  abbreviation?: string
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
  subTypeName: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
    },
  })
  if (!res.ok) {
    throw new Error(`TCGCSV ${res.status} on ${path}`)
  }
  const data = await res.json()
  return (data?.results ?? data) as T
}

/**
 * Find the Riftbound category by name. Used as a fallback when the
 * configured CATEGORY_ID returns an error.
 */
export async function findRiftboundCategoryId(): Promise<number | null> {
  try {
    const cats = await fetchJson<TcgCategory[]>('/tcgplayer/categories')
    const match = cats.find((c) => {
      const n = (c.name + ' ' + (c.displayName ?? '')).toLowerCase()
      return n.includes('riftbound')
    })
    return match?.categoryId ?? null
  } catch (e) {
    return null
  }
}

/**
 * Internal: resolve the active category ID, retrying with the dynamic
 * lookup if the configured one fails.
 */
async function withCategoryFallback<T>(fn: (catId: string) => Promise<T>): Promise<T> {
  try {
    return await fn(CATEGORY_ID)
  } catch (e: any) {
    if (!String(e.message ?? '').includes('TCGCSV')) throw e
    // Configured category failed; try dynamic lookup once.
    const found = await findRiftboundCategoryId()
    if (found && String(found) !== CATEGORY_ID) {
      console.warn(`  ⚠ TCGCSV category ${CATEGORY_ID} failed; using detected Riftbound id ${found}`)
      CATEGORY_ID = String(found)
      return fn(CATEGORY_ID)
    }
    throw e
  }
}

export async function listGroups(): Promise<TcgGroup[]> {
  return withCategoryFallback((id) => fetchJson<TcgGroup[]>(`/tcgplayer/${id}/groups`))
}

export async function listProducts(groupId: number): Promise<TcgProduct[]> {
  return withCategoryFallback((id) => fetchJson<TcgProduct[]>(`/tcgplayer/${id}/${groupId}/products`))
}

export async function listPrices(groupId: number): Promise<TcgPrice[]> {
  return withCategoryFallback((id) => fetchJson<TcgPrice[]>(`/tcgplayer/${id}/${groupId}/prices`))
}

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
