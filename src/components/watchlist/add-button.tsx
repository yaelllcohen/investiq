'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AddToWatchlistButtonProps {
  ticker: string
}

export default function AddToWatchlistButton({ ticker }: AddToWatchlistButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'added' | 'error'>('idle')

  async function handleAdd() {
    if (status === 'added') return
    setStatus('loading')
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 409 || data?.error?.toLowerCase().includes('already')) {
          setStatus('added')
          return
        }
        throw new Error('Request failed')
      }
      setStatus('added')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleAdd}
      disabled={status === 'loading' || status === 'added'}
      className="gap-2 border transition-all"
      style={
        status === 'added'
          ? { borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }
          : { borderColor: '#334155', color: '#e2e8f0', background: 'transparent' }
      }
    >
      <Star
        className="w-4 h-4"
        fill={status === 'added' ? '#f59e0b' : 'none'}
        style={{ color: status === 'added' ? '#f59e0b' : '#e2e8f0' }}
      />
      {status === 'loading'
        ? 'מוסיף...'
        : status === 'added'
        ? 'נוסף!'
        : status === 'error'
        ? 'שגיאה — נסה שוב'
        : 'הוסף למעקב'}
    </Button>
  )
}
