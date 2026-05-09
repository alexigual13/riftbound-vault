/**
 * Web Push helpers.
 *
 * Generate VAPID keys ONCE per project:
 *
 *   npx web-push generate-vapid-keys
 *
 * Store the result in env:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY  (sent to the browser)
 *   - VAPID_PRIVATE_KEY             (server only)
 *   - VAPID_SUBJECT                 (mailto:you@example.com)
 *
 * If keys are missing, push is silently disabled and the rest of the app keeps working.
 */

import webpush from 'web-push'
import { prisma } from './prisma'

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

let configured = false
function configure() {
  if (configured) return PUBLIC.length > 0 && PRIVATE.length > 0
  if (PUBLIC && PRIVATE) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE)
    configured = true
    return true
  }
  return false
}

export function isPushEnabled() {
  return PUBLIC.length > 0 && PRIVATE.length > 0
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
) {
  if (!configure()) return
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })

  const json = JSON.stringify(payload)
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json,
      )
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastUsedAt: new Date() },
      })
    } catch (err: any) {
      // 410 / 404 = subscription expired - clean it up.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } })
      } else {
        console.warn('Push send failed:', err.statusCode, err.body)
      }
    }
  }
}
