'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const POPULAR = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'TEVA.TA']

export default function AIAnalysisIndexPage() {
  const router = useRouter()
  const [ticker, setTicker] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = ticker.trim().toUpperCase()
    if (t) router.push(`/ai-analysis/${t}`)
  }

  function handlePopular(t: string) {
    router.push(`/ai-analysis/${t}`)
  }

  return (
    <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-8">
      {/* Icon + title */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(59,130,246,0.15)' }}
        >
          <Bot className="w-8 h-8" style={{ color: '#3b82f6' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#e2e8f0' }}>
            ניתוח AI מעמיק
          </h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            הזן סמל מניה לקבלת ניתוח מלא מבוסס AI
          </p>
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="לדוגמה: AAPL, NVDA, TEVA.TA"
          autoFocus
          className="flex-1 text-center font-mono text-lg h-12"
          style={{ background: '#111827', borderColor: '#1e293b', color: '#e2e8f0' }}
          maxLength={12}
        />
        <Button
          type="submit"
          disabled={!ticker.trim()}
          className="h-12 px-5 gap-2"
          style={{ background: '#3b82f6', color: '#fff' }}
        >
          <Search className="w-4 h-4" />
          נתח
        </Button>
      </form>

      {/* Popular tickers */}
      <div>
        <p className="text-xs mb-3 font-medium uppercase tracking-wider" style={{ color: '#475569' }}>
          סמלים פופולריים
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {POPULAR.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handlePopular(t)}
              className="px-4 py-1.5 rounded-full text-xs font-mono font-semibold border transition-all hover:border-blue-500/50 hover:bg-blue-500/10"
              style={{
                borderColor: '#1e293b',
                color: '#94a3b8',
                background: '#111827',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
