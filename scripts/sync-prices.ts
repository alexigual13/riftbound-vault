/**
 * Sync prices for every card with a known external id.
 *
 * Modes (controlled by --source flag):
 *   --source TCGPLAYER  → only TCGPlayer (fast, ~10s, no rate limit issues)
 *   --source CARDMARKET → only Cardmarket (slower, capped at 45 cards/run to fit in free tier)
 *   --source ALL        → both (default, used when running manually)
 *
 * Always runs at the end:
 *   - Reconcile for-sale auto-alerts
 *   - Evaluate all active alerts
 *
 * Run with:
 *   npm run sync:prices                  (legacy, runs ALL)
 *   npm run sync:prices -- --source TCGPLAYER
 *   npm run sync:prices -- --source CARDMARKET
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { listGroups, listProducts, getPricesByProductId } from '../src/lib/sources/tcgcsv'
import { fetchCardmarketPriceBundle, isCardmarketEnabled } from '../src/lib/sources/cardmarket'
import { evaluateAllActiveAlerts } from '../src/lib/alerts'
import { reconcileSaleAlerts } from '../src/lib/sale-alerts'

// ─── argv parsing ─────────────────────────────────────────────────
function parseSource(): 'TCGPLAYER' | 'CARDMARKET' | 'ALL' {
  const idx = process.argv.indexOf('--source')
  if (idx === -1) return 'ALL'
  const val = (process.argv[idx + 1] ?? '').toUpperCase()
  if (val === 'TCGPLAYER' || val === 'CARDMARKET' || val === 'ALL') return val
  console.warn(`Unknown --source value '${val}', defaulting to ALL`)
  return 'ALL'
}

async function syncTcgplayer() {
  console.log('\n→ TCGPlayer (TCGCSV)')
  const log = await prisma.syncLog.create({
    data: { source: 'tcgcsv', kind: 'prices', status: 'running' },
  })

  try {
    const groups = await listGroups()
    console.log(`  Found ${groups.length} groups`)
    let total = 0

    for (const g of groups) {
      const products = await listProducts(g.groupId)
      const priceMap = await getPricesByProductId(g.groupId)

      const cards = await prisma.card.findMany({
        where: { tcgplayerId: { in: products.map((p) => String(p.productId)) } },
        select: { id: true, tcgplayerId: true },
      })
      const byTcg = new Map(cards.map((c) => [c.tcgplayerId!, c.id]))

      const unmatched = products.filter((p) => !byTcg.has(String(p.productId)))
      if (unmatched.length) {
        const localCards = await prisma.card.findMany({
          where: { tcgplayerId: null, setCode: g.abbreviation ?? undefined },
          select: { id: true, name: true, collectorNumber: true },
        })
        const byName = new Map(localCards.map((c) => [c.name.toLowerCase(), c]))
        for (const p of unmatched) {
          const match = byName.get(p.cleanName?.toLowerCase() ?? p.name.toLowerCase())
          if (match) {
            await prisma.card.update({
              where: { id: match.id },
              data: { tcgplayerId: String(p.productId) },
            })
            byTcg.set(String(p.productId), match.id)
          }
        }
      }

      for (const p of products) {
        const cardId = byTcg.get(String(p.productId))
        if (!cardId) continue
        const entry = priceMap.get(p.productId)
        if (!entry?.normal && !entry?.foil) continue

        if (entry.normal) {
          await prisma.priceSnapshot.create({
            data: {
              cardId,
              source: 'TCGPLAYER',
              currency: 'USD',
              finish: 'NORMAL',
              condition: 'NEAR_MINT',
              sellerType: 'ANY',
              marketPrice: entry.normal.marketPrice ?? null,
              lowPrice: entry.normal.lowPrice ?? null,
              midPrice: entry.normal.midPrice ?? null,
              highPrice: entry.normal.highPrice ?? null,
            },
          })
          total++
        }
        if (entry.foil) {
          await prisma.priceSnapshot.create({
            data: {
              cardId,
              source: 'TCGPLAYER',
              currency: 'USD',
              finish: 'FOIL',
              condition: 'NEAR_MINT',
              sellerType: 'ANY',
              marketPrice: entry.foil.marketPrice ?? null,
              lowPrice: entry.foil.lowPrice ?? null,
              midPrice: entry.foil.midPrice ?? null,
              highPrice: entry.foil.highPrice ?? null,
              foilPrice: entry.foil.marketPrice ?? null,
            },
          })
          total++
        }
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'success', itemCount: total, endedAt: new Date() },
    })
    console.log(`  ✓ ${total} TCGPlayer snapshots saved`)
  } catch (err: any) {
    console.error('  ✗ TCGPlayer sync failed:', err.message)
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', endedAt: new Date(), message: err.message },
    })
  }
}

/**
 * Cardmarket sync — uses a rotating queue strategy:
 * picks the cards with the OLDEST last Cardmarket snapshot first, so over
 * time every watched card gets refreshed without exceeding the free tier
 * limit of 100 requests per day.
 *
 * Configurable via env CARDMARKET_BATCH_SIZE (default 45). Twice a day
 * = 90 requests/day = comfortably under the 100 limit.
 */
async function syncCardmarket() {
  console.log('\n→ Cardmarket')
  if (!isCardmarketEnabled()) {
    console.log('  ⊘ Skipped (no CARDMARKET_API_KEY)')
    return
  }

  const BATCH_SIZE = parseInt(process.env.CARDMARKET_BATCH_SIZE ?? '45', 10)

  const log = await prisma.syncLog.create({
    data: { source: 'cardmarket-api', kind: 'prices', status: 'running' },
  })

  try {
    // Cards we care about: in inventory, wishlist, or marked for sale.
    const ownedIds = await prisma.inventoryItem.findMany({
      distinct: ['cardId'],
      select: { cardId: true },
    })
    const wishedIds = await prisma.wishlistItem.findMany({
      distinct: ['cardId'],
      select: { cardId: true },
    })
    const watchedCardIds = [...new Set([...ownedIds, ...wishedIds].map((c) => c.cardId))]

    if (watchedCardIds.length === 0) {
      console.log('  ⊘ No watched cards (no inventory or wishlist yet)')
      await prisma.syncLog.update({
        where: { id: log.id },
        data: { status: 'success', itemCount: 0, endedAt: new Date() },
      })
      return
    }

    // For each watched card, find when we last got a Cardmarket snapshot.
    // Pick the BATCH_SIZE oldest (or never-fetched) ones.
    const lastSnaps = await prisma.priceSnapshot.groupBy({
      by: ['cardId'],
      where: { cardId: { in: watchedCardIds }, source: 'CARDMARKET' },
      _max: { capturedAt: true },
    })
    const lastMap = new Map(lastSnaps.map((s) => [s.cardId, s._max.capturedAt!]))

    const sorted = [...watchedCardIds].sort((a, b) => {
      const aTime = lastMap.get(a)?.getTime() ?? 0 // never fetched = 0 = highest priority
      const bTime = lastMap.get(b)?.getTime() ?? 0
      return aTime - bTime
    })
    const batch = sorted.slice(0, BATCH_SIZE)
    console.log(`  Picking ${batch.length} oldest of ${watchedCardIds.length} watched cards`)

    const cards = await prisma.card.findMany({ where: { id: { in: batch } } })

    let total = 0
    for (const card of cards) {
      const bundle = await fetchCardmarketPriceBundle({
        cardmarketId: card.cardmarketId ?? undefined,
        name: card.name,
        setCode: card.setCode,
      })
      if (!bundle) continue

      for (const slice of bundle.slices) {
        await prisma.priceSnapshot.create({
          data: {
            cardId: card.id,
            source: 'CARDMARKET',
            currency: 'EUR',
            condition: slice.condition ?? null,
            finish: slice.finish ?? null,
            language: slice.language ?? null,
            sellerType: slice.sellerType ?? 'ANY',
            sellerCountry: slice.sellerCountry ?? null,
            marketPrice: slice.marketPrice ?? null,
            lowPrice: slice.lowPrice ?? null,
            trendPrice: slice.trendPrice ?? null,
            avg1d: slice.avg1d ?? null,
            avg7d: slice.avg7d ?? null,
            avg30d: slice.avg30d ?? null,
          },
        })
        total++
      }
      await new Promise((r) => setTimeout(r, 800))
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'success', itemCount: total, endedAt: new Date() },
    })
    console.log(`  ✓ ${total} Cardmarket snapshots saved`)
  } catch (err: any) {
    console.error('  ✗ Cardmarket sync failed:', err.message)
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', endedAt: new Date(), message: err.message },
    })
  }
}

async function main() {
  const source = parseSource()
  console.log(`Sync mode: ${source}`)

  if (source === 'TCGPLAYER' || source === 'ALL') await syncTcgplayer()
  if (source === 'CARDMARKET' || source === 'ALL') await syncCardmarket()

  console.log('\n→ Reconciling for-sale auto-alerts')
  const sale = await reconcileSaleAlerts()
  console.log(`  ✓ ${sale.created} created, ${sale.archived} archived`)

  console.log('\n→ Evaluating alerts')
  const result = await evaluateAllActiveAlerts()
  console.log(`  ✓ Checked ${result.checked} cards, triggered ${result.triggered} alerts`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
