import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
  userAgent: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const USER_ID = await getUserId()
  const body = schema.parse(await req.json())
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: USER_ID,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: body.userAgent,
    },
    update: { userId: USER_ID, lastUsedAt: new Date() },
  })
  return NextResponse.json({ ok: true, id: sub.id })
}

export async function DELETE(req: NextRequest) {
  const USER_ID = await getUserId()
  const { endpoint } = await req.json()
  await prisma.pushSubscription.deleteMany({ where: { userId: USER_ID, endpoint } })
  return NextResponse.json({ ok: true })
}
