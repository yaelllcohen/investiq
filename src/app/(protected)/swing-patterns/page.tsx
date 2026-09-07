'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

type Difficulty = 'מתחיל' | 'בינוני' | 'מתקדם'

interface SwingPattern {
  id: string
  nameHe: string
  nameEn: string
  difficulty: Difficulty
  bias: 'bullish' | 'bearish' | 'neutral'
  meaning: string
  whenToUse: string
  entry: string
  stop: string
  target: string
  invalidation: string
}

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  'מתחיל': '#22c55e',
  'בינוני': '#f59e0b',
  'מתקדם': '#ef4444',
}

const PATTERNS: SwingPattern[] = [
  {
    id: 'bull_flag',
    nameHe: 'דגל עולה',
    nameEn: 'Bull Flag',
    difficulty: 'בינוני',
    bias: 'bullish',
    meaning: 'עלייה חדה ("התורן") ואחריה תיקון קל ומתון בתעלה יורדת ("הדגל"), לפני המשך המגמה כלפי מעלה.',
    whenToUse: 'במניה במגמת עלייה חזקה, מיד אחרי ראלי חד, כשהמחיר מתקן בנפח יורד ולא שובר את התמיכה.',
    entry: 'פריצה מעל הקו העליון של תעלת הדגל, רצוי בנפח גבוה מהממוצע.',
    stop: 'מתחת לשפל האחרון בתוך תעלת הדגל.',
    target: 'אורך "התורן" (העלייה שלפני הדגל) מוסף לנקודת הפריצה.',
    invalidation: 'שבירה מתחת לתחתית הדגל לפני הפריצה, או נפח גבוה יותר בתיקון מאשר בעלייה — מבטלים את התבנית.',
  },
  {
    id: 'cup_handle',
    nameHe: 'כוס וידית',
    nameEn: 'Cup & Handle',
    difficulty: 'בינוני',
    bias: 'bullish',
    meaning: 'תיקון מתון בצורת U ("הכוס") ולאחריו נסיגה קטנה ("הידית") לפני פריצה מחודשת כלפי מעלה.',
    whenToUse: 'במניה שנסחרת קרוב לשיא של טווח ארוך, אחרי תיקון ממושך יחסית (שבועות עד חודשים).',
    entry: 'פריצה מעל שפת הכוס (רמת ההתנגדות העליונה) בסיום הידית.',
    stop: 'מתחת לשפל הידית.',
    target: 'עומק הכוס (מהשפה עד התחתית) מוסף לנקודת הפריצה.',
    invalidation: 'ידית עמוקה מדי (יורדת מעל 50% מגובה הכוס), או נפח נמוך בפריצה — מבטלים את התבנית.',
  },
  {
    id: 'head_shoulders',
    nameHe: 'ראש וכתפיים',
    nameEn: 'Head & Shoulders',
    difficulty: 'מתקדם',
    bias: 'bearish',
    meaning: 'תבנית היפוך מגמה — שלושה שיאים כשהאמצעי ("הראש") גבוה מהשניים בצדדים ("הכתפיים"), עם קו צוואר המחבר את השפלים ביניהם.',
    whenToUse: 'בסוף מגמת עלייה ארוכה, כאיתות אזהרה אפשרי להיפוך למגמת ירידה.',
    entry: 'שבירה מתחת לקו הצוואר, רצוי בליווי נפח גבוה.',
    stop: 'מעל שיא הכתף הימנית.',
    target: 'המרחק מהראש לקו הצוואר, מופחת מנקודת השבירה.',
    invalidation: 'חזרה של המחיר מעל הכתף הימנית אחרי השבירה מבטלת את התבנית ("Failed Head & Shoulders").',
  },
  {
    id: 'ascending_triangle',
    nameHe: 'משולש עולה',
    nameEn: 'Ascending Triangle',
    difficulty: 'בינוני',
    bias: 'bullish',
    meaning: 'קו התנגדות אופקי מלמעלה וקו תמיכה עולה מלמטה — סימן ללחץ קנייה שהולך ומתחזק לקראת פריצה.',
    whenToUse: 'בתוך מגמת עלייה, כתבנית המשך. ככל שיש יותר נגיעות בקו ההתנגדות — האיתות חזק יותר.',
    entry: 'פריצה מעל קו ההתנגדות האופקי, רצוי בנפח גבוה מהממוצע.',
    stop: 'מתחת לנגיעה האחרונה בקו התמיכה העולה.',
    target: 'גובה הבסיס של המשולש (מהתמיכה הראשונה עד ההתנגדות) מוסף לנקודת הפריצה.',
    invalidation: 'שבירה מתחת לקו התמיכה העולה לפני פריצת ההתנגדות מבטלת את התבנית.',
  },
  {
    id: 'descending_triangle',
    nameHe: 'משולש יורד',
    nameEn: 'Descending Triangle',
    difficulty: 'בינוני',
    bias: 'bearish',
    meaning: 'קו תמיכה אופקי מלמטה וקו התנגדות יורד מלמעלה — סימן ללחץ מכירה שהולך ומתחזק; לרוב תבנית המשך ירידה.',
    whenToUse: 'בתוך מגמת ירידה כתבנית המשך, או אחרי מגמת עלייה כאיתות אפשרי לתחילת ירידה.',
    entry: 'שבירה מתחת לקו התמיכה האופקי, רצוי בנפח גבוה מהממוצע.',
    stop: 'מעל הנגיעה האחרונה בקו ההתנגדות היורד.',
    target: 'גובה הבסיס של המשולש מופחת מנקודת השבירה.',
    invalidation: 'פריצה מעל קו ההתנגדות היורד מבטלת את התרחיש השלילי.',
  },
  {
    id: 'breakout',
    nameHe: 'פריצת התנגדות',
    nameEn: 'Resistance Breakout',
    difficulty: 'מתחיל',
    bias: 'bullish',
    meaning: 'המחיר מנסה מספר פעמים לעבור רמת מחיר מסוימת ("התנגדות"), עד שהוא פורץ אותה בהצלחה — בדרך כלל בליווי עלייה בנפח.',
    whenToUse: 'בכל פעם שמזוהה רמת התנגדות ברורה עם מספר נגיעות; משמש גם כאישור לתבניות אחרות.',
    entry: 'מיד לאחר סגירת נר מעל רמת ההתנגדות, רצוי בנפח גבוה מפי 1.5 מהממוצע.',
    stop: 'מתחת לרמת ההתנגדות שנפרצה (שהופכת לתמיכה חדשה).',
    target: 'מרחק דומה לטווח המסחר שקדם לפריצה, מוסף לנקודת הפריצה.',
    invalidation: '"פריצת שווא" — חזרה מתחת לרמה תוך יום-יומיים מבטלת את האיתות.',
  },
  {
    id: 'double_bottom',
    nameHe: 'תחתית כפולה',
    nameEn: 'Double Bottom',
    difficulty: 'בינוני',
    bias: 'bullish',
    meaning: 'תבנית היפוך בצורת W — שני שפלים בערך באותה רמה עם שיא ביניהם ("קו הצוואר").',
    whenToUse: 'בסוף מגמת ירידה, כאיתות אפשרי להיפוך למגמת עלייה.',
    entry: 'פריצה מעל קו הצוואר (השיא שבין שני השפלים).',
    stop: 'מתחת לשפל השני.',
    target: 'המרחק מהשפלים עד קו הצוואר, מוסף לנקודת הפריצה.',
    invalidation: 'שפל שני נמוך משמעותית מהראשון, או שבירה מתחת לשני השפלים — מבטלים את התבנית.',
  },
  {
    id: 'support_resistance',
    nameHe: 'קו תמיכה והתנגדות',
    nameEn: 'Support / Resistance',
    difficulty: 'מתחיל',
    bias: 'neutral',
    meaning: 'רמות מחיר שבהן המחיר "מתקשה" לעבור מעלה (התנגדות) או "מתקשה" לרדת מתחתן (תמיכה), עקב ריכוז קונים/מוכרים.',
    whenToUse: 'תמיד — זהו הבסיס לכל ניתוח טכני; משמש לזיהוי טווחי מסחר ונקודות היפוך אפשריות.',
    entry: 'קנייה סמוך לתמיכה בתוך טווח מסחר, או בפריצת התנגדות בתוך מגמה.',
    stop: 'מעט מתחת לתמיכה (בקנייה סמוך לתמיכה) או מעט מתחת להתנגדות שנפרצה.',
    target: 'הקצה הנגדי של הטווח, או המשך המגמה לאחר פריצה.',
    invalidation: 'סגירת נר ברורה מעבר לרמה — במיוחד בנפח גבוה — מבטלת את הרמה כתקפה.',
  },
]

// ─── SVG illustrations ────────────────────────────────────────────────────────

function PatternSvg({ id }: { id: string }) {
  const PRICE = '#3b82f6'
  const GUIDE = '#f59e0b'
  const UP = '#22c55e'
  const DOWN = '#ef4444'

  const common = { viewBox: '0 0 320 150', className: 'w-full h-auto' }

  switch (id) {
    case 'bull_flag':
      return (
        <svg {...common}>
          <polyline points="10,140 45,118 80,60 108,40" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" />
          <polyline points="108,40 128,52 148,44 168,58 188,50 208,64" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" />
          <line x1="106" y1="38" x2="210" y2="60" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="106" y1="55" x2="210" y2="77" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="208,64 240,45 280,28 310,12" fill="none" stroke={UP} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'cup_handle':
      return (
        <svg {...common}>
          <path d="M20,55 Q140,165 260,52" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" />
          <line x1="20" y1="55" x2="260" y2="55" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="260,52 280,72 298,60" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" />
          <polyline points="298,60 315,25" fill="none" stroke={UP} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'head_shoulders':
      return (
        <svg {...common}>
          <polyline points="15,120 60,50 100,90 150,22 200,90 250,55 300,118" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="90" y1="90" x2="290" y2="98" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="290,98 310,138" fill="none" stroke={DOWN} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'ascending_triangle':
      return (
        <svg {...common}>
          <line x1="50" y1="38" x2="300" y2="38" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="20" y1="132" x2="230" y2="40" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="20,132 65,60 65,38 100,95 140,40 140,38 180,72 220,40 220,38" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="220,38 260,22 300,10" fill="none" stroke={UP} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'descending_triangle':
      return (
        <svg {...common}>
          <line x1="60" y1="118" x2="310" y2="118" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="20" y1="20" x2="240" y2="92" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="20,20 70,118 70,120 110,52 140,118 140,120 175,72 205,118 205,120" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="205,120 250,132 300,145" fill="none" stroke={DOWN} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'breakout':
      return (
        <svg {...common}>
          <line x1="30" y1="60" x2="300" y2="60" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,120 60,72 90,62 90,60 120,92 150,66 150,60 180,96 210,62 210,60 235,90" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="235,90 265,55 300,15" fill="none" stroke={UP} strokeWidth="3" strokeLinecap="round" />
          {[0, 1, 2, 3].map(i => (
            <rect key={i} x={20 + i * 14} y={140 - (i + 1) * 7} width="8" height={(i + 1) * 7}
              fill={i === 3 ? UP : '#475569'} opacity={i === 3 ? 0.9 : 0.5} />
          ))}
        </svg>
      )
    case 'double_bottom':
      return (
        <svg {...common}>
          <line x1="15" y1="80" x2="300" y2="80" stroke={GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,40 55,108 100,128 140,80 180,128 220,80" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="220,80 260,42 300,15" fill="none" stroke={UP} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'support_resistance':
    default:
      return (
        <svg {...common}>
          <line x1="15" y1="40" x2="305" y2="40" stroke={DOWN} strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="15" y1="120" x2="305" y2="120" stroke={UP} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,80 50,40 80,90 110,120 140,70 170,40 200,100 230,120 260,60 290,40" fill="none" stroke={PRICE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SwingPatternsPage() {
  const [activeId, setActiveId] = useState(PATTERNS[0].id)
  const active = PATTERNS.find(p => p.id === activeId) ?? PATTERNS[0]

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb ─── */}
      <nav className="flex items-center gap-1.5 text-sm" style={{ color: '#64748b' }}>
        <Link href="/dashboard" className="hover:underline" style={{ color: '#64748b' }}>בית</Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span style={{ color: '#e2e8f0' }}>מדריך תבניות סווינג</span>
      </nav>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: '#e2e8f0' }}>מדריך תבניות סווינג</h1>
        <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
          8 תבניות מפתח בניתוח טכני — איך לזהות, מתי להיכנס, איפה לשים סטופ ומתי התבנית מתבטלת.
        </p>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex flex-wrap gap-2">
        {PATTERNS.map(p => {
          const isActive = p.id === activeId
          return (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all"
              style={isActive
                ? { background: 'rgba(59,130,246,0.15)', borderColor: '#3b82f6', color: '#3b82f6' }
                : { background: '#111827', borderColor: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DIFFICULTY_COLOR[p.difficulty] }} />
              {p.nameHe}
            </button>
          )
        })}
      </div>

      {/* ─── Detail panel ─── */}
      <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: '#111827' }}>
        <div className="grid md:grid-cols-2 gap-0">
          {/* SVG side */}
          <div className="p-5 flex flex-col items-center justify-center gap-3 border-b md:border-b-0 md:border-l border-white/5" style={{ background: '#0d1117' }}>
            <div className="w-full max-w-sm">
              <PatternSvg id={active.id} />
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: active.bias === 'bullish' ? 'rgba(34,197,94,0.12)' : active.bias === 'bearish' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
                  color: active.bias === 'bullish' ? '#22c55e' : active.bias === 'bearish' ? '#ef4444' : '#94a3b8',
                }}
              >
                {active.bias === 'bullish' ? '📈 תבנית עולה' : active.bias === 'bearish' ? '📉 תבנית יורדת' : '↔️ ניטרלי'}
              </span>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: DIFFICULTY_COLOR[active.difficulty] + '20', color: DIFFICULTY_COLOR[active.difficulty] }}
              >
                {active.difficulty}
              </span>
            </div>
          </div>

          {/* Text side */}
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-xl font-extrabold" style={{ color: '#e2e8f0' }}>{active.nameHe}</h2>
              <p className="text-sm" style={{ color: '#64748b' }}>{active.nameEn}</p>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>מה זה אומר</div>
              <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{active.meaning}</p>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>מתי משתמשים</div>
              <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{active.whenToUse}</p>
            </div>
          </div>
        </div>

        {/* ─── כדאי / לא כדאי ─── */}
        <div className="grid sm:grid-cols-2 gap-3 p-5 pt-0 sm:pt-5 border-t border-white/5">
          <div className="rounded-lg p-4 space-y-2.5" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: '#22c55e' }}>✅ כדאי</div>
            <div className="space-y-1.5 text-sm" style={{ color: '#cbd5e1' }}>
              <p><b style={{ color: '#3b82f6' }}>כניסה: </b>{active.entry}</p>
              <p><b style={{ color: '#ef4444' }}>סטופ: </b>{active.stop}</p>
              <p><b style={{ color: '#22c55e' }}>יעד: </b>{active.target}</p>
            </div>
          </div>
          <div className="rounded-lg p-4 space-y-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: '#ef4444' }}>❌ לא כדאי — מתי מתבטל</div>
            <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{active.invalidation}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-center pb-4" style={{ color: '#334155' }}>
        לצורכי לימוד בלבד — אין לראות בכך ייעוץ השקעות
      </p>
    </div>
  )
}
