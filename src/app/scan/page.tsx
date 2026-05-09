'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Camera, ScanLine, Plus, RefreshCw, X, Sparkles } from 'lucide-react'
import { scanForCardId } from '@/lib/ocr/scan'
import { detectFoilFromVideo } from '@/lib/ocr/foil-detect'
import Link from 'next/link'

interface MatchedCard {
  id: string
  name: string
  setCode: string
  imageUrl: string | null
  rarity: string | null
}

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [streamOn, setStreamOn] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanned, setScanned] = useState<{ id: string; card: MatchedCard | null; isFoil: boolean; foilConfidence: number } | null>(null)
  const [history, setHistory] = useState<{ id: string; card: MatchedCard | null }[]>([])

  useEffect(() => {
    return () => stopStream()
    // eslint-disable-next-line
  }, [])

  async function startStream() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStreamOn(true)
    } catch (e: any) {
      setError(`No se puede acceder a la cámara: ${e.message ?? e}`)
    }
  }

  function stopStream() {
    const video = videoRef.current
    const stream = video?.srcObject as MediaStream | null
    if (stream) stream.getTracks().forEach((t) => t.stop())
    if (video) video.srcObject = null
    setStreamOn(false)
  }

  async function captureAndScan() {
    if (!videoRef.current || !canvasRef.current) return
    setScanning(true)
    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const w = video.videoWidth
      const h = video.videoHeight

      // Run foil detection on the full card area BEFORE we B&W-threshold for OCR.
      // This needs the original color frame - so we run it first while the
      // current video frame is still color.
      const foil = detectFoilFromVideo(video)

      // We only care about the bottom strip where the card id lives.
      // Crop the bottom 18% of the frame, full width.
      const cropY = Math.floor(h * 0.82)
      const cropH = Math.floor(h * 0.18)
      canvas.width = w
      canvas.height = cropH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, cropY, w, cropH, 0, 0, w, cropH)

      // Upscale and high-contrast for better OCR
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = imgData.data
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3
        const bw = v > 140 ? 255 : 0
        d[i] = d[i + 1] = d[i + 2] = bw
      }
      ctx.putImageData(imgData, 0, 0)

      const result = await scanForCardId(canvas)

      // Pass 1: code matched - best case
      if (result.matches.length > 0) {
        const id = result.matches[0]
        const res = await fetch(`/api/cards?q=${encodeURIComponent(id)}`)
        const cards: MatchedCard[] = res.ok ? await res.json() : []
        const card = cards.find((c) => c.id === id) ?? cards[0] ?? null
        setScanned({ id, card, isFoil: foil.isFoilLikely, foilConfidence: foil.confidence })
        setHistory((h) => [{ id, card }, ...h.slice(0, 9)])
        return
      }

      // Pass 2: fallback to name OCR. Try each candidate against the API.
      if (result.nameMatches && result.nameMatches.length > 0) {
        for (const candidate of result.nameMatches) {
          if (candidate.length < 3) continue
          const res = await fetch(`/api/cards?q=${encodeURIComponent(candidate)}`)
          if (!res.ok) continue
          const cards: MatchedCard[] = await res.json()
          if (cards.length > 0) {
            const card = cards[0]
            setScanned({ id: card.id, card, isFoil: foil.isFoilLikely, foilConfidence: foil.confidence })
            setHistory((h) => [{ id: card.id, card }, ...h.slice(0, 9)])
            return
          }
        }
        setError(`No he reconocido la carta. Texto detectado: "${result.nameMatches[0] ?? '?'}". Acerca la cámara o añade a mano.`)
        return
      }

      setError('No he podido leer ni el código ni el nombre. Acerca más la cámara y mejora la luz.')
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setScanning(false)
    }
  }

  async function addToInventory() {
    if (!scanned?.card) return
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: scanned.card.id, quantity: 1, finish: scanned.isFoil ? 'FOIL' : 'NORMAL' }),
    })
    if (res.ok) {
      setError(null)
      setScanned(null)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl">Escáner</h1>
        <p className="text-muted-foreground">
          Apunta con la cámara a la parte inferior de la carta (donde está el código tipo OGN-001).
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="relative aspect-video bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {!streamOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <Camera className="h-10 w-10 text-muted-foreground" />
              <Button onClick={startStream}>
                <Camera className="h-4 w-4" /> Activar cámara
              </Button>
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                Funciona en navegadores modernos en HTTPS o en localhost. En el móvil, instala
                la app desde el menú "Añadir a pantalla de inicio".
              </p>
            </div>
          )}

          {streamOn && (
            <>
              {/* Overlay: target zone for the card id */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-[10%] bottom-[8%] h-[12%] rounded border-2 border-primary/80 shadow-[0_0_60px_rgba(245,158,11,0.5)]" />
                <div className="absolute inset-x-[10%] bottom-[20%] text-center text-[11px] uppercase tracking-widest text-primary">
                  Coloca el código aquí
                </div>
              </div>

              <div className="absolute right-2 top-2">
                <Button size="icon" variant="ghost" onClick={stopStream}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="absolute inset-x-0 bottom-2 flex justify-center">
                <Button size="lg" onClick={captureAndScan} disabled={scanning}>
                  {scanning ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Leyendo…
                    </>
                  ) : (
                    <>
                      <ScanLine className="h-4 w-4" /> Capturar
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-5 text-sm">{error}</CardContent>
        </Card>
      )}

      {scanned && (
        <Card>
          <CardHeader>
            <CardTitle>Detectado: {scanned.id}</CardTitle>
            <CardDescription>
              {scanned.card ? `Reconocida: ${scanned.card.name}` : 'No coincide con ninguna carta en la base de datos'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scanned.card && (
              <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scanned.isFoil}
                    onChange={(e) => setScanned({ ...scanned, isFoil: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <Sparkles className={`h-4 w-4 ${scanned.isFoil ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="font-medium">Es una versión foil</span>
                </label>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">
                  {scanned.foilConfidence > 0.55
                    ? `✓ Detectado automáticamente como foil (confianza ${Math.round(scanned.foilConfidence * 100)}%). Confírmalo o desmárcalo.`
                    : scanned.foilConfidence > 0.35
                    ? `Posible foil — confianza ${Math.round(scanned.foilConfidence * 100)}%. Marca si lo es.`
                    : `No parece foil (confianza ${Math.round(scanned.foilConfidence * 100)}%). Marca solo si lo es.`}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {scanned.card && (
                <>
                  <Button onClick={addToInventory}>
                    <Plus className="h-4 w-4" /> Añadir al inventario
                  </Button>
                  <Link href={`/cards/${scanned.card.id}`}>
                    <Button variant="secondary">Ver carta</Button>
                  </Link>
                </>
              )}
              <Button variant="ghost" onClick={() => setScanned(null)}>
                Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escaneos recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {history.map((h, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{h.id}</span>
                  <span>{h.card?.name ?? '—'}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
