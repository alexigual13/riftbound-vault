/**
 * Sync prices for every card with a known external id.
 *
 *   - TCGPlayer: bulk-fetch via TCGCSV (1 request per set, fast)
 *   - Cardmarket: per-card via cardmarket-api.com (skipped if no API key)
 *
 * Run with: npm run sync:prices
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { listGroups, listProducts, getPricesByProductId } from '../src/lib/sources/tcgcsv'
import { fetchCardmarketPriceBundle, isCardmarketEnabled } from '../src/lib/sources/cardmarket'
import { evaluateAllActiveAlerts } from '../src/lib/alerts'
import { reconcileSaleAlerts } from '../src/lib/sale-alerts'

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

      // Match products to our cards by tcgplayerId.
      const cards = await prisma.card.findMany({
        where: { tcgplayerId: { in: products.map((p) => String(p.productId)) } },
        select: { id: true, tcgplayerId: true },
      })
      const byTcg = new Map(cards.map((c) => [c.tcgplayerId!, c.id]))

      // ALSO try a name-based fallback for cards we haven't matched yet.
      // RiftScribe doesn't always include tcgplayer_id, so this auto-links them.
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

        // Normal print
        if (entry.normal) {
          await prisma.priceSnapshot.create({
            data: {
              cardId,
              source: 'TCGPLAYER',
              currency: 'USD',
              finish: 'NORMAL',
              condition: 'NEAR_MINT', // TCGCSV gives NM as default
              sellerType: 'ANY',
              marketPrice: entry.normal.marketPrice ?? null,
              lowPrice: entry.normal.lowPrice ?? null,
              midPrice: entry.normal.midPrice ?? null,
              highPrice: entry.normal.highPrice ?? null,
            },
          })
          total++
        }
        // Foil print
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
      console.log(`  ${g.name}: matched ${[...byTcg.values()].length}/${products.length}`)
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

async function syncCardmarket() {
  console.log('\n→ Cardmarket')
  if (!isCardmarketEnabled()) {
    console.log('  ⊘ Skipped (no CARDMARKET_API_KEY)')
    return
  }

  const log = await prisma.syncLog.create({
    data: { source: 'cardmarket-api', kind: 'prices', status: 'running' },
  })

  try {
    // Free tier = 100 req/day. Prioritize cards in inventory + wishlist.
    const ownedIds = await prisma.inventoryItem.findMany({
      distinct: ['cardId'],
      select: { cardId: true },
    })
    const wishedIds = await prisma.wishlistItem.findMany({
      distinct: ['cardId'],
      select: { cardId: true },
    })
    const cardIds = new Set([...ownedIds, ...wishedIds].map((c) => c.cardId))
    const cards = await prisma.card.findMany({
      where: { id: { in: [...cardIds] } },
      take: 90, // leave headroom under the 100/day cap
    })

    let total = 0
    for (const card of cards) {
      const bundle = await fetchCardmarketPriceBundle({
        cardmarketId: card.cardmarketId ?? undefined,
        name: card.name,
        setCode: card.setCode,
      })
      if (!bundle) continue

      // Save one PriceSnapshot per slice we received.
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
      // gentle rate limit
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
  await syncTcgplayer()
  await syncCardmarket()
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
