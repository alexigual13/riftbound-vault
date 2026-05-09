/**
 * Auto-alert reconciliation for for-sale items.
 *
 * For each InventoryItem where forSale=true and saleAlertEnabled=true:
 *   - Make sure there's a "PRICE_DROP_PERCENT 5%" alert active so the user
 *     gets notified if the market moves down (their listing might be too high).
 *   - Make sure there's a "PRICE_RISE_PERCENT 5%" alert active so they know
 *     if they listed too cheap.
 *
 * If the user marks an item as no longer for sale OR disables the
 * sale-alert toggle, we archive the auto-created alerts (we don't delete
 * them so the user keeps the history).
 *
 * We tag the auto-created alerts with `note: 'auto:for-sale'` so we can
 * tell them apart from manually-created ones.
 */

import { prisma } from './prisma'

const AUTO_TAG = 'auto:for-sale'
const DEFAULT_PCT = 5

export async function reconcileSaleAlerts(userId?: string) {
  const where = userId ? { userId } : {}
  const sellItems = await prisma.inventoryItem.findMany({
    where: { ...where, forSale: true, saleAlertEnabled: true },
  })

  let created = 0
  let archived = 0

  // Step 1: ensure each for-sale item has its two auto-alerts active.
  for (const item of sellItems) {
    for (const type of ['PRICE_DROP_PERCENT', 'PRICE_RISE_PERCENT'] as const) {
      const existing = await prisma.alert.findFirst({
        where: {
          userId: item.userId,
          cardId: item.cardId,
          type,
          note: AUTO_TAG,
        },
      })
      if (existing) {
        // Reactivate if it was archived
        if (existing.status === 'ARCHIVED') {
          await prisma.alert.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE', triggeredAt: null, triggeredPrice: null },
          })
        }
        continue
      }
      // Take latest price as baseline.
      const latest = await prisma.priceSnapshot.findFirst({
        where: { cardId: item.cardId, source: 'TCGPLAYER' },
        orderBy: { capturedAt: 'desc' },
      })
      const baseline =
        latest?.marketPrice?.toNumber() ??
        latest?.midPrice?.toNumber() ??
        latest?.lowPrice?.toNumber() ??
        null
      if (baseline == null) continue
      await prisma.alert.create({
        data: {
          userId: item.userId,
          cardId: item.cardId,
          type,
          source: 'TCGPLAYER',
          baselinePrice: baseline,
          thresholdPercent: DEFAULT_PCT,
          currency: 'USD',
          note: AUTO_TAG,
        },
      })
      created++
    }
  }

  // Step 2: archive auto-alerts whose item is no longer for-sale or has saleAlertEnabled=false.
  const autoAlerts = await prisma.alert.findMany({
    where: { ...where, note: AUTO_TAG, status: { in: ['ACTIVE', 'TRIGGERED'] } },
  })
  for (const alert of autoAlerts) {
    const item = await prisma.inventoryItem.findFirst({
      where: { userId: alert.userId, cardId: alert.cardId, forSale: true, saleAlertEnabled: true },
    })
    if (!item) {
      await prisma.alert.update({ where: { id: alert.id }, data: { status: 'ARCHIVED' } })
      archived++
    }
  }

  return { created, archived }
}
