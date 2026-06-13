import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, User2, Calendar, BarChart3, Briefcase, BookOpen } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getRiskLabel } from '@/lib/utils'
import ChangeNameForm from './change-name-form'
import ChangePasswordForm from './change-password-form'
import SignOutButton from './sign-out-button'
import InvestmentScoreCard from '@/components/investment-score/score-card'

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  }
  if (email) return email[0].toUpperCase()
  return 'U'
}

const RISK_COLORS: Record<number, string> = {
  1: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/5',
  2: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  3: 'text-green-400 border-green-400/30 bg-green-400/5',
  4: 'text-orange-400 border-orange-400/30 bg-orange-400/5',
  5: 'text-red-400 border-red-400/30 bg-red-400/5',
}

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [user, riskProfile, holdingCount, holdingAggregate] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.riskProfile.findUnique({ where: { userId } }),
    prisma.holding.count({ where: { userId } }),
    prisma.holding.aggregate({
      where: { userId },
      _sum: { quantity: true, avgPrice: true },
    }),
  ])

  if (!user) redirect('/login')

  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'לא ידוע'

  const hasPassword = !!user.password

  const riskColorClass = riskProfile
    ? RISK_COLORS[riskProfile.score] ?? RISK_COLORS[3]
    : 'text-muted-foreground border-border bg-card'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">פרופיל</h1>
        <p className="text-sm text-muted-foreground">ניהול החשבון וההעדפות שלך</p>
      </div>

      {/* Identity Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-16 w-16 ring-2 ring-border">
            {user.image && <AvatarImage src={user.image} alt={user.name ?? 'משתמש'} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {getInitials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-0.5">
            <h2 className="text-xl font-bold text-foreground leading-tight">
              {user.name ?? 'משתמש ללא שם'}
            </h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>הצטרף {joinedDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Profile Card */}
      <div className={`rounded-xl border p-5 ${riskColorClass}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5" />
            <div>
              <p className="text-xs font-mono uppercase tracking-wider opacity-70">
                פרופיל סיכון
              </p>
              <p className="text-lg font-bold leading-tight">
                {riskProfile ? getRiskLabel(riskProfile.score) : 'לא הוערך'}
              </p>
              {riskProfile && (
                <p className="text-xs opacity-60 mt-0.5">
                  ציון {riskProfile.score}/5
                </p>
              )}
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="border-current/30">
            <Link href="/risk-profile">
              {riskProfile ? 'בצע מחדש' : 'בצע הערכה'}
            </Link>
          </Button>
        </div>
      </div>

      {/* Portfolio Stats */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            נתוני תיק
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-background/60 border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">אחזקות</span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {holdingCount}
            </p>
          </div>
          <div className="rounded-lg bg-background/60 border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <User2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">בסיס עלות ממוצע</span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {holdingAggregate._sum.avgPrice != null
                ? `$${holdingAggregate._sum.avgPrice.toFixed(2)}`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Investment Score */}
      <InvestmentScoreCard />

      {/* Account Settings */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          הגדרות חשבון
        </h3>

        <ChangeNameForm currentName={user.name ?? ''} />

        {hasPassword && <ChangePasswordForm />}
      </div>

      {/* Guide link */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">מדריך למשתמש</p>
            <p className="text-xs text-muted-foreground">
              כל הפיצ׳רים מוסברים במקום אחד
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/guide">
              <BookOpen className="h-4 w-4" />
              📖 פתח מדריך
            </Link>
          </Button>
        </div>
      </div>

      {/* Sign Out */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">התנתק</p>
            <p className="text-xs text-muted-foreground">
              תחזור לדף הכניסה.
            </p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
