'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Sparkles, User, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type Role = 'user' | 'assistant'

interface Message {
  id: string
  role: Role
  content: string
  aborted?: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    'שלום! אני יועץ ה-AI האישי שלך ב-InvestIQ.\n\nיש לי גישה מלאה לתיק שלך, המטרות, יומן ההחלטות ופרופיל הסיכון — אז אני יכול לענות על שאלות כמו:\n• "האם התיק שלי מאוזן?"\n• "מה הטעות הכי גדולה שלי?"\n• "האם אני בדרך הנכונה למטרות שלי?"\n\nאני יכול גם לחפש מחירים ומידע עדכני מהאינטרנט. במה אוכל לעזור?',
}

const SUGGESTED_PROMPTS = [
  'האם התיק שלי מאוזן?',
  'מה הטעות הכי גדולה שלי?',
  'האם אני בדרך הנכונה למטרות?',
  'נתח את AAPL',
  'קרנות סל מומלצות למתחילים',
  'השווה TSLA מול RIVN',
  'מה זה מכפיל רווח?',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AiChatPage() {
  const [messages, setMessages]   = useState<Message[]>([WELCOME_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [streaming, setStreaming] = useState(false)
  const messagesEndRef   = useRef<HTMLDivElement>(null)
  const inputRef         = useRef<HTMLInputElement>(null)
  const abortRef         = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    // Abort any current stream before starting a new one
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }

    // Snapshot messages at send-time for the API call (exclude welcome, include new user msg)
    const snapshot = [...messages, userMessage]
    const apiMessages = snapshot
      .filter((m) => m.id !== 'welcome')
      .map(({ role, content }) => ({ role, content }))

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setStreaming(true)

    const assistantId = `assistant-${Date.now()}`
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `שגיאה ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m)
        )
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        // Mark message as aborted (stream was stopped intentionally)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.content === ''
              ? { ...m, content: '—' }
              : m.id === assistantId
                ? { ...m, aborted: true }
                : m
          )
        )
        return
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'מצטערים, משהו השתבש. אנא נסה שוב.' }
            : m
        )
      )
    } finally {
      if (abortRef.current === controller) {
        setStreaming(false)
        abortRef.current = null
      }
      inputRef.current?.focus()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(inputValue)
  }

  return (
    <div className="flex flex-col h-[calc(100svh-7rem)] md:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border mb-4 flex-shrink-0">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight">
            יועץ AI של InvestIQ
          </h1>
          <p className="text-xs text-muted-foreground">
            מופעל על ידי Claude · ידע על התיק שלך · חיפוש אינטרנטי בזמן אמת
          </p>
        </div>
        {streaming && (
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            חושב...
          </div>
        )}
      </div>

      {/* Suggested Prompts */}
      <div className="flex gap-2 overflow-x-auto pb-3 flex-shrink-0 scrollbar-none">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => sendMessage(prompt)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all duration-150"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
        {messages.map((message) => {
          const isUser = message.role === 'user'
          const isStreaming = streaming && message.content === '' && message.role === 'assistant'

          return (
            <div key={message.id} className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
              {/* Avatar */}
              <div className={cn(
                'flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5',
                isUser ? 'bg-primary' : 'bg-card border border-border'
              )}>
                {isUser
                  ? <User className="h-3.5 w-3.5 text-primary-foreground" />
                  : <Sparkles className="h-3.5 w-3.5 text-primary" />}
              </div>

              {/* Bubble */}
              <div className={cn(
                'max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed',
                isUser
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : 'bg-card border border-border text-foreground rounded-tl-sm',
                message.aborted && 'opacity-70'
              )}>
                {isStreaming ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
                  </span>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
                {message.aborted && (
                  <p className="text-[10px] text-muted-foreground mt-1 opacity-60">[ הופסק ]</p>
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pt-4 border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter while streaming: stop current stream and send new message
              if (e.key === 'Enter' && !e.shiftKey && streaming && inputValue.trim()) {
                e.preventDefault()
                sendMessage(inputValue)
              }
            }}
            placeholder={streaming ? 'שלח הודעה חדשה (יעצור את התשובה הנוכחית)...' : 'שאל על כל מניה, אסטרטגיה, תיק, מטרות...'}
            className="flex-1 bg-card border-border focus-visible:ring-primary/50"
            autoComplete="off"
          />

          {streaming ? (
            <Button
              type="button"
              onClick={stopStream}
              size="icon"
              variant="outline"
              className="h-10 w-10 flex-shrink-0 border-red-500/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
              title="עצור"
            >
              <Square className="h-4 w-4 fill-current" />
              <span className="sr-only">עצור</span>
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!inputValue.trim()}
              size="icon"
              className="h-10 w-10 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">שלח הודעה</span>
            </Button>
          )}
        </form>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          תשובות ה-AI הן לצרכי חינוך בלבד ואינן ייעוץ פיננסי.
        </p>
      </div>
    </div>
  )
}
