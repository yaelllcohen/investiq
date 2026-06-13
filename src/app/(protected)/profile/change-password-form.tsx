'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'

export default function ChangePasswordForm() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword.length < 8) {
      setError('הסיסמה החדשה חייבת להכיל לפחות 8 תווים.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'עדכון הסיסמה נכשל')
      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(false), 4000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'עדכון הסיסמה נכשל')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-medium text-foreground">שנה סיסמה</p>

      <div className="space-y-1.5">
        <Label htmlFor="old-password" className="text-sm">סיסמה נוכחית</Label>
        <div className="relative">
          <Input
            id="old-password"
            type={showOld ? 'text' : 'password'}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="סיסמה נוכחית"
            className="bg-background/50 border-border pr-9"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowOld((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password" className="text-sm">סיסמה חדשה</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="לפחות 8 תווים"
            className="bg-background/50 border-border pr-9"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password" className="text-sm">אמת סיסמה חדשה</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="חזור על הסיסמה החדשה"
          className="bg-background/50 border-border"
          autoComplete="new-password"
          required
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={loading || !oldPassword || !newPassword || !confirmPassword}
        >
          {loading ? 'מעדכן...' : 'עדכן סיסמה'}
        </Button>
        {success && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            הסיסמה עודכנה
          </span>
        )}
      </div>
    </form>
  )
}
