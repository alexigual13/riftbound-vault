

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const a = await prisma.alert.findUnique({ where: { id: params.id } })
  if (!a || a.userId !== USER_ID) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.alert.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const USER_ID = await getUserId()
  const a = await prisma.alert.findUnique({ where: { id: params.id } })
  if (!a || a.userId !== USER_ID) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const updated = await prisma.alert.update({
    where: { id: params.id },
    data: {
      status: body.status ?? a.status,
      thresholdPrice: body.thresholdPrice ?? a.thresholdPrice,
      thresholdPercent: body.thresholdPercent ?? a.thresholdPercent,
      // Reset trigger state if user re-arms it.
      ...(body.status === 'ACTIVE' ? { triggeredAt: null, triggeredPrice: null } : {}),
    },
  })
  return NextResponse.json(updated)
}
