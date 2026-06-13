'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

interface GuideSection {
  id: string
  icon: string
  title: string
  description: string
  features: string[]
  href?: string
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'dashboard',
    icon: '🏠',
    title: 'דאשבורד',
    description: 'סקירה כללית של כל מה שחשוב',
    href: '/dashboard',
    features: [
      'סיכום תיק בלחיצה אחת',
      'מחירי מניות בזמן אמת',
      'ביצועי שוק מובילים',
      "קישורים מהירים לכל הפיצ'רים",
    ],
  },
  {
    id: 'portfolio',
    icon: '📊',
    title: 'תיק השקעות',
    description: 'ניהול וצפייה בכל האחזקות שלך',
    href: '/portfolio',
    features: [
      'הוספת נכסים: מניות, ETF, קריפטו, אג"ח, קרנות, גמל, השתלמות, פיקדון, נדל"ן ומזומן',
      'צפייה בשווי כולל בשקלים ודולרים',
      'רווח/הפסד יומי בשני המטבעות',
      'ציון AI כולל לתיק',
      'גרפי פיזור לפי סקטור ואזור גיאוגרפי',
      'לחיצה על אחזקה → עמוד הנכס המלא',
    ],
  },
  {
    id: 'stock',
    icon: '📈',
    title: 'עמוד נכס',
    description: 'ניתוח מעמיק לכל מניה, ETF או קריפטו',
    features: [
      'גרף נרות אינטראקטיבי עם טווחי זמן',
      'אינדיקטורים: RSI, SMA 50/200, Bollinger Bands',
      'ציון AI מפורט לפי סוג הנכס',
      'כפתור "למה?" — הסבר AI לתנועת המחיר היום',
      'סימון סטופ לוס, כניסה ויעד ישירות על הגרף',
      'המלצת AI לרמות מסחר עם יחס R:R',
      'ניתוח עסקה אוטומטי',
    ],
  },
  {
    id: 'screener',
    icon: '🔍',
    title: 'סינון AI',
    description: 'מצא נכסים לפי הקריטריונים שלך',
    href: '/ai-screener',
    features: [
      'סינון לפי סוג: מניות, ETF, קריפטו, אג"ח, קרנות, OTC, פורקס, גמל ועוד',
      'שאלות מותאמות לכל סוג נכס',
      'תוצאות מותאמות עם עמודות רלוונטיות לכל סוג',
      'ציון AI לכל תוצאה',
    ],
  },
  {
    id: 'trade-coach',
    icon: '🎯',
    title: 'מאמן עסקאות',
    description: 'חשב סיכון ופוזיציה לפני כל עסקה',
    href: '/trade-coach',
    features: [
      'חישוב גודל פוזיציה לפי % סיכון מהתיק',
      'חישוב יחס סיכון/סיכוי (R:R)',
      'המלצה אם העסקה כדאית לפי הפרופיל שלך',
      'יחס R:R מינימלי מומלץ: 1:2',
    ],
  },
  {
    id: 'journal',
    icon: '📔',
    title: 'יומן מסחר',
    description: 'תעד ולמד מכל עסקה',
    href: '/journal',
    features: [
      'תיעוד עסקאות עם תוכנית מסחר מראש',
      'מעקב אחרי ביצוע: האם עקבת לתוכנית?',
      'זיהוי דפוסים אוטומטי אחרי 3+ עסקאות',
      'Trade Replay — ניתוח עסקה לאחר סגירה',
      'סטטיסטיקות: אחוז הצלחה, R:R ממוצע',
    ],
  },
  {
    id: 'goals',
    icon: '🏆',
    title: 'מטרות פיננסיות',
    description: 'תכנן את העתיד הפיננסי שלך',
    href: '/goals',
    features: [
      'הגדרת מטרות חיסכון עם תאריך יעד',
      'חישוב ריבית דריבית אוטומטי',
      'תדירות הפקדה גמישה',
      'מעקב התקדמות ויזואלי',
    ],
  },
  {
    id: 'simulator',
    icon: '🔮',
    title: 'סימולטור עתידי',
    description: 'בדוק תרחישים לפני שהם קורים',
    href: '/wealth-sim',
    features: [
      'שאלות "מה אם?" בשפה חופשית',
      'תרחישים מוכנים: חיסכון, קריסה, פרישה מוקדמת',
      'גרף השוואה: תרחיש נוכחי vs חדש',
      'מבוסס על נתוני התיק האמיתי שלך',
    ],
  },
  {
    id: 'psychology',
    icon: '🧠',
    title: 'פסיכולוגיה',
    description: 'זהה דפוסים התנהגותיים בהשקעות שלך',
    href: '/psychology',
    features: [
      'ניתוח הטיות קוגניטיביות',
      'מבוסס על נתוני היומן שלך',
      'המלצות לשיפור קבלת החלטות',
    ],
  },
  {
    id: 'academy',
    icon: '📚',
    title: 'אקדמיה',
    description: 'למד השקעות תוך 3 דקות ביום',
    href: '/academy',
    features: [
      'שיעור יומי מותאם לתיק שלך',
      'קטגוריות: יסודות, ניתוח טכני, פסיכולוגיה, אסטרטגיה, ישראלי',
      'קוויז אחרי כל שיעור עם הסבר AI',
      'תיק וירטואלי עם ₪100,000 לתרגול',
      'אתגרים שבועיים',
    ],
  },
  {
    id: 'ai-chat',
    icon: '🤖',
    title: "צ'אט AI",
    description: 'יועץ השקעות אישי',
    href: '/ai-chat',
    features: [
      'מחובר לתיק, מטרות, יומן ופרופיל סיכון שלך',
      'שאל כל שאלה על השקעות בעברית',
      'ניתוח מניות ספציפיות',
      'המלצות מותאמות אישית',
    ],
  },
  {
    id: 'compare',
    icon: '⚖️',
    title: 'השוואת נכסים',
    description: 'השווה עד 4 נכסים זה מול זה',
    href: '/ai-compare',
    features: [
      'גרף קו משולב עם צבע לכל נכס',
      'טבלת השוואה: מחיר, תשואה, ציון AI, מכפילים',
      'נגיש מהחיפוש הגלובלי ומעמוד הנכס',
    ],
  },
]

const HREF_MAP: Record<string, string> = {
  dashboard: '/dashboard',
  portfolio: '/portfolio',
  stock: '/dashboard',
  screener: '/ai-screener',
  'trade-coach': '/trade-coach',
  journal: '/journal',
  goals: '/goals',
  simulator: '/wealth-sim',
  psychology: '/psychology',
  academy: '/academy',
  'ai-chat': '/ai-chat',
  compare: '/ai-compare',
}

export default function GuidePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GUIDE_SECTIONS
    return GUIDE_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.features.some((f) => f.toLowerCase().includes(q))
    )
  }, [query])

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--iq-text)' }}>
          המדריך המלא ל-InvestIQ
        </h1>
        <p className="text-sm" style={{ color: 'var(--iq-text-3)' }}>
          כל מה שתצטרכי לדעת — בחיפוש אחד
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mx-auto">
        <Search
          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: 'var(--iq-text-3)' }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש פיצ׳ר או נושא..."
          className="w-full h-11 rounded-xl pr-10 pl-4 text-sm outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all"
          style={{
            background: 'var(--iq-elevated)',
            border: '1px solid var(--iq-border)',
            color: 'var(--iq-text)',
          }}
        />
      </div>

      {/* Sections grid */}
      {filtered.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--iq-text-3)' }}>
          לא נמצאו תוצאות עבור &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((section) => {
            const href = section.href ?? HREF_MAP[section.id] ?? '/dashboard'
            return (
              <div
                key={section.id}
                className="rounded-xl border flex flex-col transition-all hover:border-indigo-500/40"
                style={{
                  background: 'var(--iq-elevated)',
                  borderColor: 'var(--iq-border)',
                }}
              >
                {/* Card header */}
                <div className="p-4 border-b" style={{ borderColor: 'var(--iq-border)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{section.icon}</span>
                    <h2 className="font-semibold text-base" style={{ color: 'var(--iq-text)' }}>
                      {section.title}
                    </h2>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--iq-text-3)' }}>
                    {section.description}
                  </p>
                </div>

                {/* Features list */}
                <ul className="p-4 space-y-2 flex-1">
                  {section.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'var(--iq-text-2)' }}>
                      <span className="mt-0.5 shrink-0 text-green-400">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => router.push(href)}
                    className="w-full h-9 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                  >
                    עבור ל{section.title} ←
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
