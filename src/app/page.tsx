import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  BarChart2,
  BriefcaseBusiness,
  ShieldCheck,
  FlaskConical,
  Globe,
} from 'lucide-react'

export default async function LandingPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  const features = [
    {
      icon: TrendingUp,
      title: 'ניתוח AI מעמיק',
      description:
        'נצל את Claude AI לקבלת ניתוחים ברמה מוסדית על כל מניה, קרן סל או סקטור — תוך שניות.',
    },
    {
      icon: BarChart2,
      title: 'גרפים בזמן אמת',
      description:
        'גרפי נרות יפניים, OHLC ו-Area בסגנון Bloomberg עם ממוצעים נעים ומגוון טווחי זמן.',
    },
    {
      icon: BriefcaseBusiness,
      title: 'ניהול תיק השקעות',
      description:
        'עקוב אחר כל האחזקות שלך, נטר רווח/הפסד בזמן אמת וקבל תמונה מלאה של ההשקעות שלך.',
    },
    {
      icon: ShieldCheck,
      title: 'הערכת סיכון',
      description:
        'פרופיל סיכון אישי ובדיקות עמידות כך שתמיד תבין את החשיפה שלך לסיכון.',
    },
    {
      icon: FlaskConical,
      title: 'סימולטור מסחר נייר',
      description:
        'תרגל אסטרטגיות עם כסף וירטואלי לפני שאתה מסכן הון אמיתי. ללא סיכון, מציאותי לחלוטין.',
    },
    {
      icon: Globe,
      title: 'תמיכה בריבוי שווקים',
      description:
        'מניות אמריקאיות, קרנות סל, קריפטו, מניות ישראליות, אג"ח וניירות OTC — הכל במקום אחד.',
    },
  ]

  const stats = [
    { label: '+50 שווקים', sub: 'כיסוי גלובלי' },
    { label: 'נתונים בזמן אמת', sub: 'מחירים ועדכונים חיים' },
    { label: 'מבוסס AI', sub: 'בינה של Claude' },
    { label: '100% מאובטח', sub: 'הצפנה ברמה בנקאית' },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0e1a', color: '#e2e8f0' }}>
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-md" style={{ background: 'rgba(10,14,26,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#3b82f6' }}>
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight" style={{ color: '#e2e8f0' }}>InvestIQ</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" style={{ color: '#e2e8f0' }}>
                כניסה
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" style={{ background: '#3b82f6', color: '#fff' }}>
                הרשמה
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
            style={{ background: '#3b82f6' }}
          />
          <div
            className="absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full blur-[100px] opacity-10"
            style={{ background: '#22c55e' }}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8 border border-blue-500/30"
            style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            פעיל עכשיו — בינת השקעות מבוססת AI
          </div>

          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight mb-6 leading-none">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #e2e8f0 0%, #3b82f6 50%, #22c55e 100%)' }}
            >
              InvestIQ
            </span>
          </h1>

          <p className="text-2xl sm:text-3xl font-semibold mb-4" style={{ color: '#94a3b8' }}>
            בינת השקעות מבוססת AI
          </p>
          <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: '#64748b' }}>
            ניתוח שוק מקצועי, גרפים בזמן אמת וניהול תיק השקעות — הכל מופעל על ידי AI מתקדם.
            קבל החלטות השקעה חכמות יותר, מהר יותר מאי פעם.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="h-12 px-8 text-base font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
                style={{ background: '#3b82f6', color: '#fff' }}
              >
                התחל בחינם
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base font-semibold rounded-xl border transition-all"
                style={{ borderColor: '#334155', color: '#e2e8f0', background: 'transparent' }}
              >
                כניסה
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Stats bar ─── */}
      <section className="border-y border-white/5" style={{ background: '#111827' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold mb-1" style={{ color: '#3b82f6' }}>
                  {s.label}
                </div>
                <div className="text-sm" style={{ color: '#64748b' }}>
                  {s.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" style={{ color: '#e2e8f0' }}>
              כל מה שצריך כדי להשקיע בחוכמה
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: '#64748b' }}>
              ממעקב תיק ידידותי למתחילים ועד ניתוח AI ברמה מוסדית — InvestIQ מציע כל כלי שתצטרך.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl p-6 border border-white/5 hover:border-blue-500/30 transition-all duration-300"
                  style={{ background: '#111827' }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                    style={{ background: 'rgba(59,130,246,0.15)' }}
                  >
                    <Icon className="w-6 h-6" style={{ color: '#3b82f6' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: '#e2e8f0' }}>
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>
                    {f.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] blur-[100px] opacity-15"
            style={{ background: '#3b82f6' }}
          />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold mb-4" style={{ color: '#e2e8f0' }}>
            מוכן להשקיע בחוכמה?
          </h2>
          <p className="text-lg mb-10" style={{ color: '#64748b' }}>
            הצטרף לאלפי משקיעים שכבר משתמשים ב-InvestIQ לקבלת החלטות טובות יותר.
          </p>
          <Link href="/register">
            <Button
              size="lg"
              className="h-12 px-10 text-base font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
              style={{ background: '#3b82f6', color: '#fff' }}
            >
              צור חשבון בחינם
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 py-8 px-6 text-center" style={{ background: '#111827' }}>
        <p className="text-sm" style={{ color: '#64748b' }}>
          &copy; {new Date().getFullYear()} InvestIQ. כל הזכויות שמורות. אינו ייעוץ פיננסי.
        </p>
      </footer>
    </div>
  )
}
