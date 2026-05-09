/**
 * Alert evaluation. Run on every price sync. An alert is "triggered" the
 * first time its condition is met; we leave it triggered (with a timestamp)
 * so the user has a clear notification list. They can re-arm it manually.
 */

import { prisma } from './prisma'
import { sendPushToUser } from './push'
import type { Alert, PriceSnapshot } from '@prisma/client'

export interface AlertEvaluation {
  alert: Alert
  shouldTrigger: boolean
  currentPrice: number | null
  baseline: number | null
  reason?: string
}

function priceForSource(snap: PriceSnapshot): number | null {
  // Prefer market for TCGPlayer, trend for Cardmarket - those are the
  // numbers the tracker UIs typically show.
  const candidate =
    snap.marketPrice?.toNumber() ??
    snap.trendPrice?.toNumber() ??
    snap.midPrice?.toNumber() ??
    snap.lowPrice?.toNumber() ??
    null
  return candidate
}

export async function evaluateAlertsForCard(cardId: string): Promise<AlertEvaluation[]> {
  const alerts = await prisma.alert.findMany({
    where: { cardId, status: 'ACTIVE' },
  })
  if (alerts.length === 0) return []

  const evaluations: AlertEvaluation[] = []

  for (const alert of alerts) {
    const latest = await prisma.priceSnapshot.findFirst({
      where: { cardId, source: alert.source },
      orderBy: { capturedAt: 'desc' },
    })
    if (!latest) continue

    const current = priceForSource(latest)
    if (current == null) continue

    let shouldTrigger = false
    let reason = ''

    switch (alert.type) {
      case 'PRICE_BELOW': {
        const t = alert.thresholdPrice?.toNumber() ?? 0
        if (current <= t) {
          shouldTrigger = true
          reason = `Price ${current} ≤ ${t} ${alert.currency}`
        }
        break
      }
      case 'PRICE_ABOVE': {
        const t = alert.thresholdPrice?.toNumber() ?? 0
        if (current >= t) {
          shouldTrigger = true
          reason = `Price ${current} ≥ ${t} ${alert.currency}`
        }
        break
      }
      case 'PRICE_DROP_PERCENT': {
        const baseline = alert.baselinePrice?.toNumber() ?? 0
        const pct = alert.thresholdPercent?.toNumber() ?? 0
        if (baseline > 0) {
          const change = ((current - baseline) / baseline) * 100
          if (change <= -pct) {
            shouldTrigger = true
            reason = `Price dropped ${change.toFixed(1)}% from baseline ${baseline}`
          }
        }
        break
      }
      case 'PRICE_RISE_PERCENT': {
        const baseline = alert.baselinePrice?.toNumber() ?? 0
        const pct = alert.thresholdPercent?.toNumber() ?? 0
        if (baseline > 0) {
          const change = ((current - baseline) / baseline) * 100
          if (change >= pct) {
            shouldTrigger = true
            reason = `Price rose ${change.toFixed(1)}% from baseline ${baseline}`
          }
        }
        break
      }
    }

    evaluations.push({
      alert,
      shouldTrigger,
      currentPrice: current,
      baseline: alert.baselinePrice?.toNumber() ?? null,
      reason,
    })

    // Persist trigger state.
    const wasNewlyTriggered = shouldTrigger && !alert.triggeredAt
    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        lastCheckedAt: new Date(),
        ...(wasNewlyTriggered
          ? {
              status: 'TRIGGERED',
              triggeredAt: new Date(),
              triggeredPrice: current,
            }
          : {}),
      },
    })

    // Fire push notification on the transition from active -> triggered.
    if (wasNewlyTriggered) {
      const card = await prisma.card.findUnique({ where: { id: alert.cardId } })
      await sendPushToUser(alert.userId, {
        title: `🔔 ${card?.name ?? 'Alerta'} - ${reason}`,
        body: `Precio actual: ${current.toFixed(2)} ${alert.currency}`,
        url: `/cards/${alert.cardId}`,
        tag: `alert-${alert.id}`,
      })
    }
  }

  return evaluations
}

export async function evaluateAllActiveAlerts(): Promise<{
  checked: number
  triggered: number
}> {
  const cards = await prisma.alert.findMany({
    where: { status: 'ACTIVE' },
    distinct: ['cardId'],
    select: { cardId: true },
  })

  let triggered = 0
  for (const { cardId } of cards) {
    const evals = await evaluateAlertsForCard(cardId)
    triggered += evals.filter((e) => e.shouldTrigger).length
  }
  return { checked: cards.length, triggered }
}
