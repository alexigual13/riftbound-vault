/**
 * Cardmarket prices via cardmarket-api.com (third-party scraper service).
 *
 * Returns a list of "price slices" — each one represents the price for a
 * specific combination of condition × language × seller type × country.
 * The sync script saves them as separate PriceSnapshot rows so we can
 * query e.g. "lowest Near Mint Spanish Pro seller for the Spanish
 * language version".
 *
 * Caveat: the third-party API may not expose every combination. We capture
 * what's available; absent fields stay null.
 *
 * Sign up at https://www.cardmarket-api.com to obtain a key, then put it
 * in CARDMARKET_API_KEY in your .env. If the key is missing this module
 * acts as a no-op so the rest of the app still works.
 */

const BASE = process.env.CARDMARKET_API_BASE || 'https://api.cardmarket-api.com'
const KEY = process.env.CARDMARKET_API_KEY || ''

export type Condition = 'MINT' | 'NEAR_MINT' | 'EXCELLENT' | 'GOOD' | 'PLAYED' | 'POOR'
export type SellerType = 'ANY' | 'PRIVATE' | 'PROFESSIONAL' | 'POWERSELLER'

export interface PriceSlice {
  condition?: Condition | null
  finish?: 'NORMAL' | 'FOIL' | null
  language?: string | null
  sellerType?: SellerType | null
  sellerCountry?: string | null
  marketPrice?: number | null
  lowPrice?: number | null
  trendPrice?: number | null
  avg1d?: number | null
  avg7d?: number | null
  avg30d?: number | null
}

export interface CardmarketBundle {
  cardmarketId?: string
  name?: string
  slices: PriceSlice[]
}

export function isCardmarketEnabled(): boolean {
  return KEY.length > 0
}

export async function fetchCardmarketPriceBundle(query: {
  cardmarketId?: string
  name?: string
  setCode?: string
}): Promise<CardmarketBundle | null> {
  if (!isCardmarketEnabled()) return null

  const params = new URLSearchParams()
  params.set('game', 'riftbound')
  if (query.cardmarketId) params.set('id', query.cardmarketId)
  if (query.name) params.set('name', query.name)
  if (query.setCode) params.set('set', query.setCode)

  const res = await fetch(`${BASE}/cards/search?${params.toString()}`, {
    headers: { 'X-API-Key': KEY, Accept: 'application/json' },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    console.warn(`Cardmarket API ${res.status} for`, query)
    return null
  }

  const data = await res.json()
  const first = Array.isArray(data?.data) ? data.data[0] : (Array.isArray(data) ? data[0] : data)
  if (!first) return null

  const cm = first.prices?.cardmarket ?? first.cardmarket ?? first.price ?? first
  const slices: PriceSlice[] = []

  // Aggregate (everyone)
  slices.push({
    condition: null,
    language: null,
    sellerType: 'ANY',
    sellerCountry: null,
    marketPrice: numOrNull(cm.average_price ?? cm.average),
    lowPrice: numOrNull(cm.low ?? cm.lowest_near_mint ?? cm.sell),
    trendPrice: numOrNull(cm.trend ?? cm.trendPrice),
    avg1d: numOrNull(cm['1d_average'] ?? cm.avg1),
    avg7d: numOrNull(cm['7d_average'] ?? cm.avg7),
    avg30d: numOrNull(cm['30d_average'] ?? cm.avg30),
  })

  // Foil
  const foilTrend = numOrNull(cm.foilTrend ?? cm.foil_trend ?? cm.trend_foil)
  if (foilTrend != null) {
    slices.push({
      finish: 'FOIL',
      sellerType: 'ANY',
      trendPrice: foilTrend,
      lowPrice: numOrNull(cm.foil_low ?? cm.lowest_foil),
    })
  }

  // Per-condition
  const conditionMap: [string, Condition][] = [
    ['mint', 'MINT'],
    ['near_mint', 'NEAR_MINT'],
    ['excellent', 'EXCELLENT'],
    ['good', 'GOOD'],
    ['played', 'PLAYED'],
    ['poor', 'POOR'],
  ]
  for (const [key, cond] of conditionMap) {
    const v = numOrNull(cm[`lowest_${key}`])
    if (v != null) slices.push({ condition: cond, sellerType: 'ANY', lowPrice: v })
  }

  // Per-seller-country (Spain prioritized)
  const countries = ['ES', 'DE', 'FR', 'IT', 'GB', 'NL', 'BE', 'PT']
  for (const c of countries) {
    const v = numOrNull(cm[`lowest_near_mint_${c}`] ?? cm[`lowest_${c}`])
    if (v != null) {
      slices.push({
        condition: 'NEAR_MINT',
        sellerCountry: c,
        sellerType: 'ANY',
        lowPrice: v,
      })
    }
  }

  // Per-seller-type
  const proLow = numOrNull(cm.lowest_professional ?? cm.pro_low)
  if (proLow != null) slices.push({ sellerType: 'PROFESSIONAL', condition: 'NEAR_MINT', lowPrice: proLow })
  const psLow = numOrNull(cm.lowest_powerseller ?? cm.powerseller_low)
  if (psLow != null) slices.push({ sellerType: 'POWERSELLER', condition: 'NEAR_MINT', lowPrice: psLow })

  // Spain × Pro × NM (the most useful for a Spanish buyer)
  const esPro = numOrNull(cm.lowest_professional_ES ?? cm.es_pro_low)
  if (esPro != null) {
    slices.push({
      sellerType: 'PROFESSIONAL',
      condition: 'NEAR_MINT',
      sellerCountry: 'ES',
      lowPrice: esPro,
    })
  }

  // Per-language
  const langMap: [string, string][] = [
    ['en', 'english'],
    ['de', 'german'],
    ['fr', 'french'],
    ['es', 'spanish'],
    ['it', 'italian'],
    ['ja', 'japanese'],
    ['zh-Hans', 'chinese_simplified'],
    ['zh-Hant', 'chinese_traditional'],
    ['ko', 'korean'],
  ]
  for (const [iso, key] of langMap) {
    const v = numOrNull(cm[`lowest_${key}`])
    if (v != null) {
      slices.push({ language: iso, condition: 'NEAR_MINT', sellerType: 'ANY', lowPrice: v })
    }
  }

  return {
    cardmarketId: first.cardmarketId ?? first.externalId ?? query.cardmarketId,
    name: first.name,
    slices,
  }
}

function numOrNull(v: any): number | null {
  if (v == null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// Backward-compat shim for older callers expecting flat shape.
export async function fetchCardmarketPrice(query: {
  cardmarketId?: string
  name?: string
  setCode?: string
}) {
  const bundle = await fetchCardmarketPriceBundle(query)
  if (!bundle) return null
  const aggregate = bundle.slices.find(
    (s) =>
      s.condition == null &&
      s.language == null &&
      (s.sellerType == null || s.sellerType === 'ANY') &&
      s.sellerCountry == null,
  )
  return aggregate
    ? {
        cardmarketId: bundle.cardmarketId,
        name: bundle.name,
        currency: 'EUR' as const,
        lowestNearMint: aggregate.lowPrice ?? null,
        trend: aggregate.trendPrice ?? null,
        avg7d: aggregate.avg7d ?? null,
        avg30d: aggregate.avg30d ?? null,
        foilTrend: bundle.slices.find((s) => s.finish === 'FOIL')?.trendPrice ?? null,
      }
    : null
}
