import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(value: number | null | undefined, currency = 'EUR'): string {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value)
}

export function percentChange(current: number, baseline: number): number {
  if (!baseline) return 0
  return ((current - baseline) / baseline) * 100
}

export function formatPercent(value: number, sign = true): string {
  const formatted = `${value.toFixed(1)}%`
  if (!sign) return formatted
  return value > 0 ? `+${formatted}` : formatted
}
