'use client'

import { use, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---- Types ----

interface ParsedSection {
  heading: string
  body: string
}

// ---- Verdict color ----
function verdictStyle(text: string): string {
  const upper = text.toUpperCase()
  if (text.includes('קנה חזק') || upper.includes('STRONG BUY')) return 'text-green-300 bg-green-950/50 border-green-700'
  if (text.includes('קנה') || upper.includes('BUY')) return 'text-green-400 bg-green-950/30 border-green-800'
  if (text.includes('מכור') || upper.includes('STRONG SELL') || upper.includes('SELL')) return 'text-red-400 bg-red-950/30 border-red-800'
  if (text.includes('המתן') || upper.includes('HOLD')) return 'text-yellow-400 bg-yellow-950/30 border-yellow-800'
  return 'text-zinc-300 bg-zinc-800 border-zinc-700'
}

// ---- Parse ## sections from streamed text ----
function parseSections(text: string): ParsedSection[] {
  const lines = text.split('\n')
  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/)
    if (headingMatch) {
      if (current) sections.push(current)
      current = { heading: headingMatch[1].trim(), body: '' }
    } else if (current) {
      current.body += line + '\n'
    } else {
      if (sections.length === 0) {
        sections.push({ heading: '', body: '' })
      }
      sections[0].body += line + '\n'
    }
  }
  if (current) sections.push(current)
  return sections.filter((s) => s.heading !== '' || s.body.trim() !== '')
}

// ---- Skeleton ----
function SkeletonLines() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-zinc-800 rounded w-3/4" />
      <div className="h-4 bg-zinc-800 rounded w-full" />
      <div className="h-4 bg-zinc-800 rounded w-5/6" />
    </div>
  )
}

export default function AIAnalysisPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = use(params)
  const upperTicker = ticker.toUpperCase()

  const [streamedText, setStreamedText] = useState('')
  const [streaming, setStreaming] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAnalysis() {
      setStreamedText('')
      setStreaming(true)
      setError(null)

      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: upperTicker }),
        })

        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? `הבקשה נכשלה: ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('אין זרם נתונים')

        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          const chunk = decoder.decode(value, { stream: true })
          setStreamedText((prev) => prev + chunk)
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'הניתוח נכשל')
        }
      } finally {
        if (!cancelled) setStreaming(false)
      }
    }

    fetchAnalysis()
    return () => {
      cancelled = true
    }
  }, [upperTicker])

  const sections = parseSections(streamedText)
  const verdictSection = sections.find((s) =>
    s.heading.includes('פסיקה') || s.heading.toUpperCase().includes('VERDICT')
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 print:hidden">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/stock/${upperTicker}`}>
              <Button
                variant="ghost"
                className="text-zinc-400 hover:text-zinc-100 h-8 px-2 gap-1.5 text-xs"
              >
                <ArrowRight className="h-4 w-4" />
                {upperTicker}
              </Button>
            </Link>
            <div className="h-4 w-px bg-zinc-700" />
            <h1 className="text-sm font-bold tracking-wider uppercase">
              ניתוח AI מעמיק:{' '}
              <span className="text-blue-400">{upperTicker}</span>
            </h1>
          </div>
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100 h-8 px-3 gap-1.5 text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            ייצוא PDF
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5" ref={scrollRef}>
        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">ניתוח AI מעמיק: {upperTicker}</h1>
          <p className="text-sm text-zinc-400">
            הופק {new Date().toLocaleDateString('he-IL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-400 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {/* Verdict badge */}
        {verdictSection && verdictSection.body.trim() && (
          <div
            className={`border rounded-lg px-4 py-3 text-sm font-bold tracking-wide ${verdictStyle(
              verdictSection.body
            )}`}
          >
            פסיקה: {verdictSection.body.trim()}
          </div>
        )}

        {/* Loading skeleton */}
        {streaming && streamedText.length === 0 && <SkeletonLines />}

        {/* Sections */}
        {sections.length > 0 ? (
          <div className="space-y-5">
            {sections.map((section, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-3"
              >
                {section.heading && (
                  <h2
                    className={`text-xs font-bold uppercase tracking-widest ${
                      section.heading.includes('פסיקה') || section.heading.toUpperCase().includes('VERDICT')
                        ? 'text-blue-400'
                        : 'text-zinc-400'
                    }`}
                  >
                    {section.heading}
                  </h2>
                )}
                <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {section.body}
                  {streaming && i === sections.length - 1 && (
                    <span className="inline-block h-3.5 w-0.5 bg-blue-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : streaming ? (
          <SkeletonLines />
        ) : null}

        {streaming && streamedText.length > 0 && (
          <p className="text-xs text-zinc-500 text-center animate-pulse">
            מנתח...
          </p>
        )}
      </div>
    </div>
  )
}
