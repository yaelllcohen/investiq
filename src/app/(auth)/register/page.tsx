'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: ['הסיסמאות אינן תואמות'] })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.details) {
          setFieldErrors(data.details)
          setError('אנא תקן את השגיאות המסומנות.')
        } else {
          setError(data.error ?? 'ההרשמה נכשלה. נסה שוב.')
        }
        return
      }

      router.push('/login')
    } catch {
      setError('משהו השתבש. נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-border/50 shadow-2xl bg-card/95 backdrop-blur">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold text-center">יצירת חשבון</CardTitle>
        <CardDescription className="text-center">
          התחל את מסע ההשקעות החכם שלך עוד היום
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2.5">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">שם מלא</Label>
            <Input
              id="name"
              type="text"
              placeholder="ישראל ישראלי"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className={`bg-background/50 ${fieldErrors.name ? 'border-destructive' : ''}`}
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-400">{fieldErrors.name[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">כתובת דוא&quot;ל</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={`bg-background/50 ${fieldErrors.email ? 'border-destructive' : ''}`}
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-400">{fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              placeholder="לפחות 8 תווים, כולל ספרה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className={`bg-background/50 ${fieldErrors.password ? 'border-destructive' : ''}`}
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-400">{fieldErrors.password[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">אימות סיסמה</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="חזור על הסיסמה"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className={`bg-background/50 ${
                fieldErrors.confirmPassword || (confirmPassword && confirmPassword !== password)
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              }`}
            />
            {fieldErrors.confirmPassword ? (
              <p className="text-xs text-red-400">{fieldErrors.confirmPassword[0]}</p>
            ) : confirmPassword && confirmPassword !== password ? (
              <p className="text-xs text-red-400">הסיסמאות אינן תואמות</p>
            ) : null}
          </div>

          <Button type="submit" className="w-full font-semibold" disabled={loading}>
            {loading ? 'יוצר חשבון...' : 'יצירת חשבון'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            ביצירת חשבון אתה מסכים ל
            <Link href="/terms" className="text-primary hover:underline mx-1">
              תנאי השימוש
            </Link>
            וה
            <Link href="/privacy" className="text-primary hover:underline mx-1">
              מדיניות הפרטיות
            </Link>
            שלנו.
          </p>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center pb-6 pt-0">
        <p className="text-sm text-muted-foreground">
          כבר יש לך חשבון?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            כניסה
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
