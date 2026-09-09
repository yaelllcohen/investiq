'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// Global "back" affordance shown on every protected page (see the
// (protected) layout) so users can jump back across unrelated sections —
// e.g. from a stock page to the scanner, or from the journal to the
// portfolio — without hunting for a matching nav link.
export default function BackButton() {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    // Deferred to a microtask so this stays an async check (like this
    // codebase's other on-mount checks) rather than a synchronous
    // setState call inside the effect body.
    queueMicrotask(() => setCanGoBack(window.history.length > 1))
  }, [])

  if (!canGoBack) return null

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
      style={{ color: 'var(--iq-text-2)' }}
      aria-label="חזרה"
    >
      <ArrowLeft className="h-4 w-4" />
      חזרה
    </button>
  )
}
