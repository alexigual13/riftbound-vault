// Riftbound Vault service worker - handles push notifications.
// Lives at /sw.js so it has scope over the entire app.

self.addEventListener('install', (event) => {
  // Activate immediately on install
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of any open pages right away
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Riftbound Vault', body: event.data.text() }
  }
  const title = payload.title || 'Alerta de precio'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'riftbound-alert',
    data: { url: payload.url || '/alerts' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
