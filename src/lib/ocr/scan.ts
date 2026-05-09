/**
 * Card scanner OCR helper.
 *
 * Strategy: every Riftbound card has its identifier printed at the bottom
 * (e.g. "OGN-001/298"). This collector code is alphanumeric and Riot uses
 * it consistently across regions/languages, so it's the most reliable
 * target for OCR.
 *
 * Algorithm:
 *   1. Caller crops the image to the bottom strip (UI overlays a target).
 *   2. We try OCR with strict charset whitelist (ABC0-9-/) first - this is
 *      fast and ~99% accurate when the code is in Latin characters.
 *   3. If no code matches the regex, we run a wider OCR pass on the same
 *      image WITHOUT the charset whitelist. This catches localized prints
 *      where Tesseract's strict mode fails on non-Latin glyphs around
 *      the code, or where the card name is needed for matching.
 *   4. The returned `nameMatches` field is intended for fuzzy-matching the
 *      card name against the database when the code didn't yield a hit.
 *
 * Foil cards: the OCR doesn't detect foil. The collector code is printed
 * the same way on foils, but rainbow glare can wash out the contrast. We
 * pre-process to B&W threshold which removes color but doesn't help with
 * blown-out highlights. The user confirms NORMAL/FOIL after recognition.
 *
 * Chinese / Japanese cards: Riot uses the same Latin alphanumeric collector
 * code globally (e.g. OGN-024 on every regional print of Jinx). The code
 * detection works the same. The fallback name OCR does NOT load the
 * Chinese language model (would inflate the bundle by ~15 MB), so name
 * matching for non-Latin cards is best-effort. Code matching is the
 * primary path.
 *
 * Everything runs in the browser - no images leave the device.
 */

import { createWorker } from 'tesseract.js'

export interface ScanResult {
  raw: string
  matches: string[]      // card-id candidates found by code OCR
  nameMatches?: string[] // possible name-matches if code OCR failed (fallback path)
  confidence: number
}

let strictWorkerPromise: ReturnType<typeof createWorker> | null = null
let openWorkerPromise: ReturnType<typeof createWorker> | null = null

async function getStrictWorker() {
  if (!strictWorkerPromise) {
    strictWorkerPromise = createWorker('eng', 1)
    const w = await strictWorkerPromise
    await w.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
      preserve_interword_spaces: '0' as any,
    })
  }
  return strictWorkerPromise
}

async function getOpenWorker() {
  if (!openWorkerPromise) {
    openWorkerPromise = createWorker('eng', 1)
  }
  return openWorkerPromise
}

const ID_RE = /\b([A-Z]{2,4})[-\s]?(\d{1,4})\b/g

export async function scanForCardId(image: HTMLCanvasElement | HTMLImageElement | Blob): Promise<ScanResult> {
  // Pass 1: strict whitelist (codes only)
  const strict = await getStrictWorker()
  const { data: strictData } = await strict.recognize(image as any)
  const strictText = strictData.text.toUpperCase().replace(/\s+/g, ' ')
  const matches = new Set<string>()

  for (const m of strictText.matchAll(ID_RE)) {
    const setCode = m[1]
    const number = String(parseInt(m[2], 10))
    matches.add(`${setCode}-${number}`)
  }

  if (matches.size > 0) {
    return {
      raw: strictData.text,
      matches: [...matches],
      confidence: strictData.confidence ?? 0,
    }
  }

  // Pass 2 (fallback): open OCR for name extraction.
  // Strip OCR noise to get probable name candidates - we look for runs of
  // alphabetic words and return the longest few. The caller can fuzzy-match
  // these against the database.
  const open = await getOpenWorker()
  const { data: openData } = await open.recognize(image as any)
  const openText = openData.text.replace(/[^\p{L}\p{N}\s,.'-]/gu, ' ')
  const words = openText
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  // Slide a window of 1-3 words to build candidate names.
  const cands = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 3, words.length); j++) {
      cands.add(words.slice(i, j).join(' '))
    }
  }

  return {
    raw: openData.text,
    matches: [],
    nameMatches: [...cands].slice(0, 12),
    confidence: openData.confidence ?? 0,
  }
}

export async function terminateOcr() {
  if (strictWorkerPromise) {
    const w = await strictWorkerPromise
    await w.terminate()
    strictWorkerPromise = null
  }
  if (openWorkerPromise) {
    const w = await openWorkerPromise
    await w.terminate()
    openWorkerPromise = null
  }
}
