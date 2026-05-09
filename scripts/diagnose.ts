/**
 * Diagnostic script: checks that the external APIs are reachable and
 * tells you the current Riftbound category ID on TCGCSV.
 *
 * Usage:
 *   npx tsx scripts/diagnose.ts
 */
import 'dotenv/config'
import { findRiftboundCategoryId } from '../src/lib/sources/tcgcsv'
import { listCards } from '../src/lib/sources/riftscribe'

async function main() {
  console.log('=== Riftbound Vault diagnostics ===\n')

  // RiftScribe
  console.log('→ RiftScribe')
  try {
    const page1 = await listCards({ page: 1, page_size: 100 })
    console.log(`  ✓ Page 1: ${page1.length} cards`)
    const page2 = await listCards({ page: 2, page_size: 100 })
    console.log(`  ✓ Page 2: ${page2.length} cards`)
    const page3 = await listCards({ page: 3, page_size: 100 })
    console.log(`  ✓ Page 3: ${page3.length} cards`)
    const total = page1.length + page2.length + page3.length
    console.log(`  Total observed across 3 pages: ${total}`)
  } catch (e: any) {
    console.log(`  ✗ Failed: ${e.message}`)
  }

  // TCGCSV
  console.log('\n→ TCGCSV')
  try {
    const id = await findRiftboundCategoryId()
    if (id) {
      console.log(`  ✓ Riftbound category ID: ${id}`)
      console.log(`  → If this differs from your TCGPLAYER_CATEGORY_ID env var, update .env`)
    } else {
      console.log(`  ⚠ No category named "Riftbound" found in TCGCSV catalog.`)
      console.log(`    This is normal if TCGplayer hasn't listed Riftbound on their store yet.`)
      console.log(`    The app works fine without TCGPlayer prices; only price-tracking is degraded.`)
    }
  } catch (e: any) {
    console.log(`  ✗ Failed: ${e.message}`)
  }

  console.log('\n=== Done ===')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
