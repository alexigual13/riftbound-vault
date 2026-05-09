/**
 * Foil detection heuristic for the card scanner.
 *
 * Foils have three measurable signatures that don't appear (or appear much
 * less) on normal cards:
 *
 *   1. SATURATION VARIANCE — the rainbow/holographic effect means the same
 *      printed area shows wildly different hues at different points. We
 *      sample saturation across many pixels and compute its standard
 *      deviation. Higher = more rainbow-y.
 *
 *   2. SPECULAR HIGHLIGHTS — foils reflect light into bright concentrated
 *      patches that are simultaneously near-white AND saturated (a
 *      counterintuitive combo). Normal printed art rarely produces pixels
 *      that are both very bright and very saturated.
 *
 *   3. PEAK BRIGHTNESS — foils typically push some pixels above ~95%
 *      luminance because they reflect the light source directly. Matte
 *      printed cards rarely exceed ~85% on the printed art.
 *
 * We combine these three signals into a confidence score 0-1 and flag the
 * card as "likely foil" if confidence > 0.55.
 *
 * Caveats:
 *   - Works best with even ambient lighting and a slight card tilt so some
 *     of the holographic shimmer is captured. Dead-flat foils captured under
 *     pure overhead light may miss signal #1.
 *   - Normal cards with very saturated, complex artwork (rare) may produce
 *     false positives. The user can always uncheck.
 *   - This is heuristic, not ML. It's good enough to save the user a click
 *     ~85% of the time, and the worst case is they correct it manually.
 *
 * No dependencies, no external models — runs in pure browser JS.
 */

export interface FoilDetection {
  isFoilLikely: boolean
  confidence: number // 0..1
  signals: {
    maxBrightness: number
    saturationStdDev: number
    specularHighlightRatio: number // fraction of pixels that are "specular"
  }
}

const FOIL_THRESHOLD = 0.55

/**
 * Analyze the top 70% of the canvas (skips the bottom collector-code strip
 * which is usually plain text).
 */
export function detectFoilHeuristic(canvas: HTMLCanvasElement): FoilDetection {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { isFoilLikely: false, confidence: 0, signals: { maxBrightness: 0, saturationStdDev: 0, specularHighlightRatio: 0 } }
  }
  const w = canvas.width
  const h = canvas.height
  // Focus on the upper portion of the card art (skip the code strip)
  const analyzeH = Math.max(1, Math.floor(h * 0.7))
  const imgData = ctx.getImageData(0, 0, w, analyzeH)
  const d = imgData.data

  let maxBrightness = 0
  let totalSat = 0
  let totalSatSq = 0
  let count = 0
  let specularCount = 0

  // Sampling step — every 3 pixels keeps it fast (~30ms on a phone)
  const STEP = 3

  for (let y = 0; y < analyzeH; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      const i = (y * w + x) * 4
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const brightness = max / 255
      const saturation = max === 0 ? 0 : (max - min) / max

      if (brightness > maxBrightness) maxBrightness = brightness
      totalSat += saturation
      totalSatSq += saturation * saturation
      count++

      // Specular pixel: simultaneously very bright AND saturated
      if (brightness > 0.92 && saturation > 0.35) specularCount++
    }
  }

  if (count === 0) {
    return { isFoilLikely: false, confidence: 0, signals: { maxBrightness: 0, saturationStdDev: 0, specularHighlightRatio: 0 } }
  }

  const meanSat = totalSat / count
  const varSat = totalSatSq / count - meanSat * meanSat
  const stdSat = Math.sqrt(Math.max(0, varSat))
  const specRatio = specularCount / count

  // Score each signal, normalize to 0-1
  const stdScore = clamp01(stdSat / 0.28)
  const specScore = clamp01(specRatio / 0.012)
  const brightScore = clamp01((maxBrightness - 0.88) / 0.12)

  // Weighted combination (specular highlights are the strongest signal)
  const confidence = clamp01(stdScore * 0.4 + specScore * 0.45 + brightScore * 0.15)

  return {
    isFoilLikely: confidence > FOIL_THRESHOLD,
    confidence,
    signals: {
      maxBrightness,
      saturationStdDev: stdSat,
      specularHighlightRatio: specRatio,
    },
  }
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/**
 * Convenience helper for the scanner: pulls the relevant card area
 * (excludes the bottom code strip) from a video element into a temp
 * canvas, then runs the heuristic.
 */
export function detectFoilFromVideo(video: HTMLVideoElement): FoilDetection {
  const w = video.videoWidth
  const h = video.videoHeight
  if (w === 0 || h === 0) {
    return { isFoilLikely: false, confidence: 0, signals: { maxBrightness: 0, saturationStdDev: 0, specularHighlightRatio: 0 } }
  }
  const tmp = document.createElement('canvas')
  // Take the middle 70% of the frame horizontally and the top 60% vertically.
  // This usually corresponds to the card art when the user has a card framed
  // in the visor.
  const cropX = Math.floor(w * 0.15)
  const cropW = Math.floor(w * 0.7)
  const cropY = Math.floor(h * 0.1)
  const cropH = Math.floor(h * 0.55)
  tmp.width = cropW
  tmp.height = cropH
  const ctx = tmp.getContext('2d')!
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return detectFoilHeuristic(tmp)
}
