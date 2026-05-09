import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'
import { getSessionUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Riftbound Vault',
  description: 'Inventario y tracker de precios para Riftbound TCG',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Riftbound Vault' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true' ? await getSessionUser() : null
  return (
    <html lang="es" className="dark">
      <body>
        <div className="min-h-dvh bg-rift-glow">
          <Nav userEmail={user?.email} />
          <main className="container py-6 pb-24 md:pb-10">{children}</main>
        </div>
      </body>
    </html>
  )
}
