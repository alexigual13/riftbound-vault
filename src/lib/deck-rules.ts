/**
 * Riftbound deck legality rules.
 *
 * Source: official deckbuilding primer + Origins ruleset.
 *
 *   - Main Deck:  exactly 40 cards (Chosen Champion counts toward the 40)
 *   - Rune Deck:  exactly 12 cards
 *   - Battlefields: exactly 3 unique cards
 *   - Sideboard:  exactly 0 OR exactly 8 cards (Bo3 only)
 *   - Max 3 copies of any unique card across MAIN + SIDEBOARD
 *   - 1 Legend (separate, defines 2 domains)
 *   - 1 Chosen Champion Unit (must match Legend's name + one of its colors)
 *   - All Main Deck and Sideboard cards must be in the Legend's domain colors
 *     (multi-color cards: BOTH colors must be in the Legend's domains)
 */

import type { Card, Deck, DeckCard, DeckSection } from '@prisma/client'

export interface DeckBundle extends Deck {
  cards: (DeckCard & { card: Card })[]
  legendCard: Card | null
  chosenChampionCard: Card | null
}

export interface ValidationIssue {
  code:
    | 'NO_LEGEND'
    | 'NO_CHAMPION'
    | 'CHAMPION_NAME_MISMATCH'
    | 'CHAMPION_DOMAIN_MISMATCH'
    | 'MAIN_DECK_SIZE'
    | 'RUNE_DECK_SIZE'
    | 'BATTLEFIELD_COUNT'
    | 'BATTLEFIELD_DUPLICATES'
    | 'SIDEBOARD_SIZE'
    | 'COPY_LIMIT'
    | 'DOMAIN_VIOLATION'
  severity: 'error' | 'warning'
  message: string
  detail?: string
}

export interface ValidationResult {
  legal: boolean
  issues: ValidationIssue[]
  counts: {
    main: number
    rune: number
    battlefield: number
    sideboard: number
  }
}

const MAIN_SIZE = 40
const RUNE_SIZE = 12
const BATTLEFIELD_COUNT = 3
const SIDEBOARD_OPTIONS = [0, 8]
const MAX_COPIES = 3

export function validateDeck(deck: DeckBundle): ValidationResult {
  const issues: ValidationIssue[] = []
  const main = deck.cards.filter((c) => c.section === 'MAIN')
  const rune = deck.cards.filter((c) => c.section === 'RUNE')
  const bf = deck.cards.filter((c) => c.section === 'BATTLEFIELD')
  const side = deck.cards.filter((c) => c.section === 'SIDEBOARD')

  const mainCount = main.reduce((s, c) => s + c.quantity, 0)
  const runeCount = rune.reduce((s, c) => s + c.quantity, 0)
  const bfCount = bf.reduce((s, c) => s + c.quantity, 0)
  const sideCount = side.reduce((s, c) => s + c.quantity, 0)

  // Legend
  if (!deck.legendCard) {
    issues.push({ code: 'NO_LEGEND', severity: 'error', message: 'Falta seleccionar un Legend.' })
  }

  // Chosen Champion
  if (!deck.chosenChampionCard) {
    issues.push({ code: 'NO_CHAMPION', severity: 'error', message: 'Falta el Chosen Champion.' })
  } else if (deck.legendCard) {
    const legendName = deck.legendCard.name.split(',')[0].trim().toLowerCase()
    const champName = deck.chosenChampionCard.name.split(',')[0].trim().toLowerCase()
    if (legendName !== champName) {
      issues.push({
        code: 'CHAMPION_NAME_MISMATCH',
        severity: 'error',
        message: 'El Chosen Champion no coincide con el Legend.',
        detail: `Legend: "${deck.legendCard.name}", Champion: "${deck.chosenChampionCard.name}".`,
      })
    }
    const legendDomains = parseDomains(deck.legendCard.domain)
    const champDomains = parseDomains(deck.chosenChampionCard.domain)
    const overlap = champDomains.some((d) => legendDomains.includes(d))
    if (legendDomains.length > 0 && champDomains.length > 0 && !overlap) {
      issues.push({
        code: 'CHAMPION_DOMAIN_MISMATCH',
        severity: 'error',
        message: 'El Chosen Champion no comparte dominio con el Legend.',
      })
    }
  }

  // Sizes
  if (mainCount !== MAIN_SIZE) {
    issues.push({
      code: 'MAIN_DECK_SIZE',
      severity: 'error',
      message: `Main deck: ${mainCount}/${MAIN_SIZE} cartas.`,
      detail: mainCount > MAIN_SIZE ? `Sobran ${mainCount - MAIN_SIZE}.` : `Faltan ${MAIN_SIZE - mainCount}.`,
    })
  }
  if (runeCount !== RUNE_SIZE) {
    issues.push({
      code: 'RUNE_DECK_SIZE',
      severity: 'error',
      message: `Rune deck: ${runeCount}/${RUNE_SIZE} runas.`,
    })
  }
  if (bfCount !== BATTLEFIELD_COUNT) {
    issues.push({
      code: 'BATTLEFIELD_COUNT',
      severity: 'error',
      message: `Battlefields: ${bfCount}/${BATTLEFIELD_COUNT}.`,
    })
  }
  // Battlefields must be unique copies (each entry quantity = 1)
  for (const b of bf) {
    if (b.quantity > 1) {
      issues.push({
        code: 'BATTLEFIELD_DUPLICATES',
        severity: 'error',
        message: `Cada Battlefield debe ser único (${b.card.name} ×${b.quantity}).`,
      })
    }
  }
  if (!SIDEBOARD_OPTIONS.includes(sideCount)) {
    issues.push({
      code: 'SIDEBOARD_SIZE',
      severity: 'warning',
      message: `Sideboard: ${sideCount}. Debe ser exactamente 0 o 8 cartas.`,
    })
  }

  // Copy limit (main + sideboard combined)
  const copies = new Map<string, number>()
  for (const c of [...main, ...side]) {
    copies.set(c.cardId, (copies.get(c.cardId) ?? 0) + c.quantity)
  }
  for (const [cardId, count] of copies.entries()) {
    if (count > MAX_COPIES) {
      const card = main.find((c) => c.cardId === cardId)?.card ?? side.find((c) => c.cardId === cardId)?.card
      issues.push({
        code: 'COPY_LIMIT',
        severity: 'error',
        message: `Demasiadas copias de "${card?.name ?? cardId}" (${count}/${MAX_COPIES}).`,
      })
    }
  }

  // Domain check
  if (deck.legendCard) {
    const legendDomains = parseDomains(deck.legendCard.domain)
    if (legendDomains.length > 0) {
      for (const c of [...main, ...side]) {
        const cardDomains = parseDomains(c.card.domain)
        if (cardDomains.length === 0) continue // colorless / unknown - skip
        // Multi-color cards: ALL of their domains must be in the legend's
        const allowed = cardDomains.every((d) => legendDomains.includes(d))
        if (!allowed) {
          issues.push({
            code: 'DOMAIN_VIOLATION',
            severity: 'error',
            message: `"${c.card.name}" no está en el dominio del Legend.`,
            detail: `Legend permite ${legendDomains.join('/')}, carta es ${cardDomains.join('/')}.`,
          })
        }
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error')
  return {
    legal: !hasErrors,
    issues,
    counts: { main: mainCount, rune: runeCount, battlefield: bfCount, sideboard: sideCount },
  }
}

function parseDomains(value: string | null | undefined): string[] {
  if (!value) return []
  // Some sources give "Body/Calm" or "Body, Calm" or just "Body".
  return value
    .split(/[\/,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export const DECK_RULES = {
  MAIN_SIZE,
  RUNE_SIZE,
  BATTLEFIELD_COUNT,
  SIDEBOARD_OPTIONS,
  MAX_COPIES,
}
