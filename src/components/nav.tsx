'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Library, Bookmark, Bell, Layers, ScanLine, BarChart3, LogOut, User, Tag } from 'lucide-react'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventario', icon: Library },
  { href: '/for-sale', label: 'En venta', icon: Tag },
  { href: '/wishlist', label: 'Wishlist', icon: Bookmark },
  { href: '/alerts', label: 'Alertas', icon: Bell },
  { href: '/decks', label: 'Mazos', icon: Layers },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/scan', label: 'Escanear', icon: ScanLine },
]

export function Nav({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname()
  return (
    <nav className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-2">
        <Link href="/" className="mr-4 flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-primary/40" />
          <span className="font-display text-lg tracking-widest">RIFTBOUND VAULT</span>
        </Link>
        <div className="hidden gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:bg-accent/10 hover:text-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
        {userEmail && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden truncate sm:inline">
              <User className="mr-1 inline h-3 w-3" />
              {userEmail}
            </span>
            <form action="/auth/signout" method="POST">
              <button type="submit" className="hover:text-accent" title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </div>
      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-8 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]',
                active ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
