'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, BellOff } from 'lucide-react'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
}

export function PushSubscribeButton() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      setSupported(true)
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {})
    }
  }, [])

  async function subscribe() {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Permiso de notificaciones denegado')
        return
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
      })
      const json = sub.toJSON() as any
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        }),
      })
      if (res.ok) setSubscribed(true)
      else setError('No se pudo guardar la suscripción')
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function unsubscribe() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Notificaciones push no disponibles en este navegador (o falta configurar VAPID).
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {subscribed ? (
        <Button variant="secondary" onClick={unsubscribe} disabled={busy} size="sm">
          <BellOff className="h-4 w-4" /> Desactivar notificaciones
        </Button>
      ) : (
        <Button onClick={subscribe} disabled={busy} size="sm">
          <Bell className="h-4 w-4" /> Activar notificaciones push
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">
        En iOS necesitas instalar la app como PWA primero ("Añadir a pantalla de inicio").
      </p>
    </div>
  )
}
