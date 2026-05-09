/**
 * sync-cards (v0.4.2): use TCGCSV as primary catalog source.
 *
 * Why: RiftScribe's pagination is broken (returns the same 100 cards on
 * every page) so we couldn't load more than the first 100. TCGCSV
 * mirrors TCGplayer's catalog and serves every set + group + product
 * properly indexed. Bonus: every card already has its tcgplayerId
 * baked in, so price sync matches at 100% instead of ~20%.
 *
 * What this loses vs RiftScribe: rules text, flavor text, artist info.
 * Those can be enriched per-card later (RiftScribe's per-card endpoint
 * works fine, only its list pagination is broken). For now we get the
 * complete card list, name, image, set code, rarity. Plenty to use the
 * app.
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { listGroups, listProducts, type TcgGroup, type TcgProduct } from '../src/lib/sources/tcgcsv'

// Map TCGplayer group names to friendly set codes & names. Add new sets here as they release.
const GROUP_TO_SET: Record<string, { code: string; name: string }> = {
  'Origins': { code: 'OGN', name: 'Origins' },
  'Origins: Proving Grounds': { code: 'PRG', name: 'Proving Grounds' },
  'Spiritforged': { code: 'SPF', name: 'Spiritforged' },
  'Unleashed': { code: 'UNL', name: 'Unleashed' },
  'Vendetta': { code: 'VDT', name: 'Vendetta' },
  'Riftbound Promotional Cards': { code: 'PROMO', name: 'Promotional Cards' },
  'Riftbound Judge Promotional Cards': { code: 'JUDGE', name: 'Judge Promos' },
  'Riftbound Organized Play Promotional Cards': { code: 'OP', name: 'Organized Play Promos' },
  'Riftbound Worlds Bundle 2025': { code: 'WB25', name: 'Worlds Bundle 2025' },
}

function getSetMeta(groupName: string): { code: string; name: string } {
  return GROUP_TO_SET[groupName] ?? { code: groupName.slice(0, 6).toUpperCase().replace(/\s/g, ''), name: groupName }
}

// Pull useful fields out of TCGplayer's "extendedData" array, which is a
// list like [{name: "Number", value: "024"}, {name: "Rarity", value: "Legendary"}, ...]
function extData(p: TcgProduct, key: string): string | undefined {
  const e = p.extendedData?.find((x) => x.name?.toLowerCase() === key.toLowerCase())
  return e?.value?.toString()
}

async function main() {
  console.log('→ Fetching catalog from TCGCSV…')
  const start = Date.now()
  const log = await prisma.syncLog.create({
    data: { source: 'tcgcsv', kind: 'cards', status: 'running' },
  })

  try {
    const groups = await listGroups()
    console.log(`✓ Found ${groups.length} groups`)

    // First pass: upsert sets
    for (const g of groups) {
      const meta = getSetMeta(g.name)
      await prisma.cardSet.upsert({
        where: { code: meta.code },
        create: {
          code: meta.code,
          name: meta.name,
          totalCards: 0,
          releaseDate: g.publishedOn ? new Date(g.publishedOn) : null,
        },
        update: { name: meta.name, releaseDate: g.publishedOn ? new Date(g.publishedOn) : null },
      })
    }

    // Second pass: upsert all cards from each group
    let totalUpserted = 0
    const setCounts = new Map<string, number>()

    for (const g of groups) {
      const meta = getSetMeta(g.name)
      const products = await listProducts(g.groupId)
      console.log(`  ${g.name}: ${products.length} cards`)

      for (const p of products) {
        const collectorNumber = extData(p, 'Number') ?? extData(p, 'CardNumber') ?? ''
        const cleanCollector = collectorNumber.replace(/\s/g, '').replace(/^0+/, '') || String(p.productId)
        // Build a stable, human-readable id: SETCODE-NUMBER
        const id = `${meta.code}-${cleanCollector}`

        await prisma.card.upsert({
          where: { id },
          create: {
            id,
            setCode: meta.code,
            collectorNumber: collectorNumber || cleanCollector,
            name: p.name,
            rarity: extData(p, 'Rarity') ?? null,
            domain: extData(p, 'Domain') ?? extData(p, 'Color') ?? null,
            type: extData(p, 'Card Type') ?? extData(p, 'Type') ?? null,
            cost: parseIntOrNull(extData(p, 'Cost') ?? extData(p, 'Mana Cost')),
            power: parseIntOrNull(extData(p, 'Power')),
            rules: extData(p, 'Card Text') ?? extData(p, 'Description') ?? null,
            flavor: extData(p, 'Flavor Text') ?? null,
            artist: extData(p, 'Artist') ?? null,
            imageUrl: p.imageUrl?.replace('_200w', '_in_1000x1000') ?? p.imageUrl ?? null,
            tcgplayerId: String(p.productId),
            source: 'tcgcsv',
            rawSource: p as any,
          },
          update: {
            setCode: meta.code,
            name: p.name,
            rarity: extData(p, 'Rarity') ?? undefined,
            domain: extData(p, 'Domain') ?? extData(p, 'Color') ?? undefined,
            type: extData(p, 'Card Type') ?? extData(p, 'Type') ?? undefined,
            imageUrl: p.imageUrl?.replace('_200w', '_in_1000x1000') ?? p.imageUrl ?? undefined,
            tcgplayerId: String(p.productId),
            source: 'tcgcsv',
            rawSource: p as any,
          },
        })
        totalUpserted++
        setCounts.set(meta.code, (setCounts.get(meta.code) ?? 0) + 1)
      }
      // Update totalCards on the CardSet
      await prisma.cardSet.update({
        where: { code: meta.code },
        data: { totalCards: setCounts.get(meta.code) ?? 0 },
      })
      // Be polite to TCGCSV
      await new Promise((r) => setTimeout(r, 200))
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        itemCount: totalUpserted,
        endedAt: new Date(),
        message: `Synced ${totalUpserted} cards across ${groups.length} groups in ${Math.round((Date.now() - start) / 1000)}s`,
      },
    })

    console.log(`\n✓ Done. Upserted ${totalUpserted} cards in ${Math.round((Date.now() - start) / 1000)}s`)
    console.log('✓ Per-set counts:')
    for (const [code, count] of setCounts) {
      console.log(`    ${code}: ${count}`)
    }
  } catch (e: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', endedAt: new Date(), message: String(e?.message ?? e) },
    })
    throw e
  }

  await prisma.$disconnect()
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
