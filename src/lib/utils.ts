import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number | undefined | null): string {
  if (value == null || isNaN(value)) return '0.00%'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(2)
}

export function getRiskLabel(score: number): string {
  const labels: Record<number, string> = {
    1: 'שמרן מאוד',
    2: 'שמרן',
    3: 'מאוזן',
    4: 'אגרסיבי',
    5: 'ספקולטיבי',
  }
  return labels[score] || 'מאוזן'
}

export function getChangeColor(value: number): string {
  if (value > 0) return 'text-green-400'
  if (value < 0) return 'text-red-400'
  return 'text-gray-400'
}

export function getBgChangeColor(value: number): string {
  if (value > 0) return 'bg-green-400/10 text-green-400'
  if (value < 0) return 'bg-red-400/10 text-red-400'
  return 'bg-gray-400/10 text-gray-400'
}
