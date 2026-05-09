import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Tiny sync trigger endpoint. The actual sync work lives in /scripts/sync-*.ts
 * which can be run via:
 *   - npm run sync:cards (manually)
 *   - a cron service like cron-job.org pinging this endpoint
 *
 * In production, set up a Supabase Edge Function or a Vercel cron to call
 * the sync scripts on a schedule. This endpoint just returns the latest
 * sync log entries so the UI can show last-run status.
 */

export async function GET(_req: NextRequest) {
  const recent = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 10,
  })
  return NextResponse.json(recent)
}
