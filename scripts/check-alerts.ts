import 'dotenv/config'
import { evaluateAllActiveAlerts } from '../src/lib/alerts'
import { prisma } from '../src/lib/prisma'

async function main() {
  const r = await evaluateAllActiveAlerts()
  console.log(`Checked ${r.checked} cards, triggered ${r.triggered} alerts`)
  await prisma.$disconnect()
}
main()
