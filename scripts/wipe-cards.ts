/**
 * Wipe all cards (and their snapshots/inventory) from the DB.
 *
 * Use this when switching catalog sources or recovering from a corrupted
 * sync. Safe to run anytime; you can re-populate by running sync:cards.
 *
 * WARNING: this also removes any inventory items and price snapshots,
 * because of the FK cascade. Don't run this if you have inventory you
 * care about.
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import readline from 'readline'

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(prompt + ' [y/N] ', (a) => {
      rl.close()
      resolve(a.trim().toLowerCase() === 'y')
    })
  })
}

async function main() {
  const cardCount = await prisma.card.count()
  const invCount = await prisma.inventoryItem.count()
  const snapCount = await prisma.priceSnapshot.count()

  console.log(`Current state:`)
  console.log(`  Cards:           ${cardCount}`)
  console.log(`  Inventory items: ${invCount}`)
  console.log(`  Price snapshots: ${snapCount}`)
  console.log()

  if (cardCount === 0) {
    console.log('Nothing to wipe.')
    return
  }

  const ok = await confirm(`Delete ALL ${cardCount} cards (and ${invCount} inventory + ${snapCount} snapshots via cascade)?`)
  if (!ok) {
    console.log('Aborted.')
    return
  }

  console.log('Wiping…')
  // Delete in dependency order
  await prisma.priceSnapshot.deleteMany({})
  await prisma.inventoryItem.deleteMany({})
  await prisma.alert.deleteMany({})
  await prisma.wishlistItem.deleteMany({})
  await prisma.deckCard.deleteMany({})
  await prisma.deck.deleteMany({})
  await prisma.card.deleteMany({})
  await prisma.cardSet.deleteMany({})

  console.log('✓ Done. Run `npm run sync:cards` to re-populate.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
