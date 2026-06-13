'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2 } from 'lucide-react'

interface ChangeNameFormProps {
  currentName: string
}

export default function ChangeNameForm({ currentName }: ChangeNameFormProps) {
  const [name, setName] = useState(currentName)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === currentName) return

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error('עדכון השם נכשל')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('עדכון השם נכשל. אנא נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="display-name" className="text-sm text-foreground">
          שם תצוגה
        </Label>
        <Input
          id="display-name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSuccess(false) }}
          placeholder="השם שלך"
          className="bg-background/50 border-border"
          maxLength={64}
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={loading || !name.trim() || name.trim() === currentName}
          className="gap-1.5"
        >
          {loading ? 'שומר...' : 'שמור שם'}
        </Button>
        {success && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            השם עודכן
          </span>
        )}
      </div>
    </form>
  )
}
