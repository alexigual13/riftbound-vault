/**
 * Sync card master data from RiftScribe into the local DB.
 * Run with: npm run sync:cards
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { fetchAllCards } from '../src/lib/sources/riftscribe'

// Known set names. Add new sets here as Riot publishes them.
const SET_NAMES: Record<string, string> = {
  OGN: 'Origins',
  // Future: 'PRG': 'Proving Grounds', etc.
}

async function main() {
  console.log('→ Fetching cards from RiftScribe…')
  const start = Date.now()
  const log = await prisma.syncLog.create({
    data: { source: 'riftscribe', kind: 'cards', status: 'running' },
  })

  try {
    const cards = await fetchAllCards()
    console.log(`✓ Got ${cards.length} cards from RiftScribe`)

    // First: collect distinct sets from the cards and upsert them.
    const setCodes = new Map<string, string>() // code -> name
    for (const c of cards) {
      const code = c.set_id ?? (c.id?.split('-')[0] ?? 'UNK')
      // RiftScribe doesn't always provide set names. Fall back to code.
      const name = c.set_name ?? c.setName ?? SET_NAMES[code] ?? code
      if (!setCodes.has(code)) setCodes.set(code, name)
    }
    for (const [code, name] of setCodes) {
      await prisma.cardSet.upsert({
        where: { code },
        create: { code, name, totalCards: 0 },
        update: { name },
      })
    }

    let upserted = 0
    for (const c of cards) {
      // RiftScribe ids look like "OGN-001-298"; keep "OGN-001" as our canonical id.
      const canonicalId = c.set_id && c.collector_number
        ? `${c.set_id}-${String(c.collector_number).padStart(3, '0').replace(/^0+/, '')}`
        : c.id
      // Normalize: remove leading zeros (OGN-001 -> OGN-1) for shorter URLs but keep readable.
      const id = canonicalId.replace(/-0+(\d)/, '-$1')

      await prisma.card.upsert({
        where: { id },
        create: {
          id,
          setCode: c.set_id ?? id.split('-')[0] ?? 'UNK',
          collectorNumber: String(c.collector_number ?? id.split('-')[1] ?? ''),
          name: c.name,
          rarity: c.rarity ?? null,
          domain: c.faction ?? null,
          type: c.type ?? null,
          cost: c.cost ?? null,
          power: c.power ?? null,
          rules: c.text ?? null,
          flavor: c.flavor_text ?? null,
          artist: c.artist ?? null,
          imageUrl: c.image_url ?? null,
          tcgplayerId: c.tcgplayer_id ? String(c.tcgplayer_id) : null,
          cardmarketId: c.cardmarket_id ? String(c.cardmarket_id) : null,
          rawSource: c as any,
          source: 'riftscribe',
        },
        update: {
          name: c.name,
          rarity: c.rarity ?? null,
          domain: c.faction ?? null,
          type: c.type ?? null,
          cost: c.cost ?? null,
          power: c.power ?? null,
          rules: c.text ?? null,
          flavor: c.flavor_text ?? null,
          artist: c.artist ?? null,
          imageUrl: c.image_url ?? null,
          // Don't blindly overwrite price ids if RiftScribe stops returning them.
          ...(c.tcgplayer_id ? { tcgplayerId: String(c.tcgplayer_id) } : {}),
          ...(c.cardmarket_id ? { cardmarketId: String(c.cardmarket_id) } : {}),
          rawSource: c as any,
          source: 'riftscribe',
        },
      })
      upserted++
      if (upserted % 50 === 0) console.log(`  …${upserted}/${cards.length}`)
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        itemCount: upserted,
        endedAt: new Date(),
        message: `Synced ${upserted} cards in ${Math.round((Date.now() - start) / 1000)}s`,
      },
    })

    // Recompute totalCards for each set.
    for (const code of setCodes.keys()) {
      const count = await prisma.card.count({ where: { setCode: code } })
      await prisma.cardSet.update({ where: { code }, data: { totalCards: count } })
    }

    console.log(`✓ Done. Upserted ${upserted} cards in ${Math.round((Date.now() - start) / 1000)}s`)
    console.log(`✓ Sets: ${[...setCodes.keys()].join(', ')}`)
  } catch (err: any) {
    console.error('✗ Sync failed:', err)
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', endedAt: new Date(), message: err?.message ?? String(err) },
    })
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
