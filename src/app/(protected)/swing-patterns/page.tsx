'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

type Difficulty = 'מתחיל' | 'בינוני' | 'מתקדם'
type PatternType = 'המשך' | 'היפוך'

interface SwingPattern {
  id: string
  nameHe: string
  nameEn: string
  difficulty: Difficulty
  bias: 'bullish' | 'bearish' | 'neutral'
  patternType?: PatternType
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
  {
    id: 'breakout_pattern',
    nameHe: 'תבנית פריצה',
    nameEn: 'Breakout Pattern',
    difficulty: 'מתחיל',
    bias: 'bullish',
    patternType: 'המשך',
    meaning: 'מחיר שנע בטווח מסחר מוגדר לאורך זמן פורץ בעוצמה מעל רמת ההתנגדות העליונה תוך זינוק חד בנפח המסחר — סימן לכניסת קונים חדשים וכוח אמיתי מאחורי התנועה.',
    whenToUse: 'כשמניה נצמדת לרמת התנגדות ברורה עם מספר נגיעות חוזרות, והנפח היומי מתחיל לעלות בהדרגה לקראת הפריצה.',
    entry: 'קנייה מיד עם סגירת נר מעל רמת ההתנגדות, כאשר הנפח גבוה לפחות פי 1.5–2 מהממוצע היומי.',
    stop: 'מתחת לרמת ההתנגדות שנפרצה (ההופכת לתמיכה חדשה), או מתחת לשפל הנר הפורץ.',
    target: 'מרחק שווה לטווח המסחר שקדם לפריצה (High−Low של הטווח), מוסף לנקודת הפריצה.',
    invalidation: 'חזרה מתחת לרמת הפריצה תוך יום-יומיים ("פריצת שווא"), או פריצה בנפח נמוך — מבטלות את האיתות.',
  },
  {
    id: 'breakdown_pattern',
    nameHe: 'תבנית שבירה',
    nameEn: 'Breakdown Pattern',
    difficulty: 'מתחיל',
    bias: 'bearish',
    patternType: 'המשך',
    meaning: 'התמונה ההפוכה של פריצה — המחיר שובר כלפי מטה רמת תמיכה מרכזית בליווי עלייה בנפח, מה שמעיד על לחץ מכירה חזק ותחילת תנועה יורדת.',
    whenToUse: 'כשמניה נסחרת בטווח או במגמת עלייה מתפוגגת, רמת תמיכה ברורה בסיכון, ומופיעים סימני היחלשות במומנטום (RSI יורד, נפח קנייה נמוך).',
    entry: 'מכירה/סגירת פוזיציה מיד עם סגירת נר מתחת לרמת התמיכה, רצוי בנפח גבוה מהממוצע.',
    stop: 'מעל רמת התמיכה שנשברה (ההופכת להתנגדות חדשה).',
    target: 'מרחק שווה לטווח המסחר שקדם לשבירה, מופחת מנקודת השבירה.',
    invalidation: 'חזרה מעל רמת השבירה תוך יום-יומיים ("שבירת שווא") מבטלת את האיתות.',
  },
  {
    id: 'consolidation_pattern',
    nameHe: 'תבנית התכנסות',
    nameEn: 'Consolidation Pattern',
    difficulty: 'בינוני',
    bias: 'neutral',
    patternType: 'המשך',
    meaning: 'המחיר נע בטווח צר יחסית ללא כיוון ברור, לרוב אחרי תנועה חדה — "תקופת עיכול" שבה השוק אוסף כוח לפני המהלך הבא.',
    whenToUse: 'אחרי מהלך חד (עלייה או ירידה), כשהתנודתיות מצטמצמת בבירור ונפח המסחר יורד — סימן שהשוק ממתין לזרז חדש.',
    entry: 'פריצה מעל גבול ההתכנסות העליון (לכיוון עולה) או מתחת לגבול התחתון (לכיוון יורד), רצוי עם עלייה בנפח.',
    stop: 'מהצד הנגדי של טווח ההתכנסות — מתחת לגבול התחתון בפריצה עולה, מעל הגבול העליון בפריצה יורדת.',
    target: 'רוחב טווח ההתכנסות מוסף (או מופחת) מנקודת הפריצה.',
    invalidation: 'המשך תנועה צידית ממושכת ללא פריצה ברורה מפחית את מהימנות התבנית; פריצת שווא לכל כיוון מבטלת את האיתות.',
  },
  {
    id: 'wedge_breakout',
    nameHe: 'טריז עולה עם פריצה',
    nameEn: 'Wedge Breakout',
    difficulty: 'בינוני',
    bias: 'bullish',
    patternType: 'המשך',
    meaning: 'שני קווי מגמה עולים שמתכנסים זה לזה ("טריז"), ולבסוף המחיר פורץ כלפי מעלה מתוך ההתכנסות — שילוב של לחץ קנייה מצטבר ופריצה חדה.',
    whenToUse: 'בתוך מגמת עלייה, כשהמחיר יוצר סדרת שיאים ושפלים עולים המתכנסים בהדרגה לכיוון קו התנגדות אחד.',
    entry: 'פריצה מעל הקו העליון של הטריז, רצוי בנפח גבוה מהממוצע.',
    stop: 'מתחת לנגיעה האחרונה בקו התמיכה העולה של הטריז, לפני הפריצה.',
    target: 'גובה הבסיס הרחב של הטריז (בתחילת התבנית) מוסף לנקודת הפריצה.',
    invalidation: 'שבירה מתחת לקו התמיכה התחתון של הטריז לפני פריצת ההתנגדות מבטלת את התבנית.',
  },
  {
    id: 'downtrend_break',
    nameHe: 'שבירת מגמת ירידה ארוכת טווח',
    nameEn: 'Long Term Downtrend Break',
    difficulty: 'מתקדם',
    bias: 'bullish',
    patternType: 'היפוך',
    meaning: 'היפוך מגמה משמעותי — לאחר תקופה ממושכת של ירידות ושפלים יורדים, המחיר שובר קו מגמה יורד ארוך טווח ועובר מעל ממוצע נע ארוך (כמו SMA200), מה שמעיד על שינוי אופי בסיסי.',
    whenToUse: 'בסוף מגמת ירידה ממושכת (חודשים), כשמופיעים סימני היחלשות במומנטום היורד (RSI לא עושה שפל חדש, נפח מכירות פוחת) והמחיר מתקרב לקו המגמה או ל-SMA200.',
    entry: 'פריצה וסגירה מעל קו המגמה היורד וגם מעל SMA200, רצוי בליווי נפח קנייה גבוה מהממוצע.',
    stop: 'מתחת לשפל האחרון שנוצר לפני הפריצה, או מתחת ל-SMA200 אם המחיר נשבר בחזרה מתחתיו.',
    target: 'רמת ההתנגדות המשמעותית הבאה, או מרחק דומה לגודל התיקונים הקודמים בתוך המגמה היורדת.',
    invalidation: 'חזרה מתחת לקו המגמה היורד או ל-SMA200 תוך זמן קצר מבטלת את איתות ההיפוך.',
  },
  {
    id: 'oversold_pattern',
    nameHe: 'תבנית מכורת יתר',
    nameEn: 'Oversold Chart Pattern',
    difficulty: 'בינוני',
    bias: 'bullish',
    patternType: 'היפוך',
    meaning: 'מניה שירדה בחדות וה-RSI שלה נמצא באזור מכירת יתר (מתחת ל-30), ומופיע סימן ראשוני להיפוך — כמו נר היפוך (Hammer/Doji), התכנסות בנפח המכירות, או דיברגנס חיובי ב-RSI.',
    whenToUse: 'לאחר ירידה חדה וממושכת, כש-RSI נמצא מתחת ל-30 ומופיע נר עצירה ברור (למשל Hammer) בליווי ירידה בנפח המכירות.',
    entry: 'קנייה בסגירת הנר ההיפוכי, או בפריצה מעל השיא של אותו נר, רצוי עם אישור נפח.',
    stop: 'מתחת לשפל שנוצר בעת מכירת היתר (השפל של הנר ההיפוכי או הנר שלפניו).',
    target: 'רמת התנגדות קרובה, או ממוצע נע קצר (כמו EMA8) שהמחיר לא נגע בו זמן רב.',
    invalidation: 'שפל חדש ונמוך יותר מתחת לשפל מכירת היתר, ללא סימני היפוך — מבטל את האיתות ומעיד על המשך הירידה.',
  },
]

// ─── SVG illustrations ────────────────────────────────────────────────────────

function PatternSvg({ id }: { id: string }) {
  const PRICE = '#3b82f6'
  const GUIDE = '#f59e0b'
  const UP = '#22c55e'
  const DOWN = '#ef4444'

  // The 6 indicator-overlay patterns below draw the price line in neutral
  // gray (so it doesn't compete with the indicators) plus an orange EMA8
  // and a blue SMA200 line — matching the exact colors used for these two
  // indicators on the advanced chart (see IND_META in stock-chart.tsx).
  const NEUTRAL = '#cbd5e1'
  const EMA8 = '#f97316'
  const SMA200 = '#3b82f6'
  const STRUCT_GUIDE = '#64748b'

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
    case 'breakout_pattern':
      return (
        <svg {...common}>
          <line x1="50" y1="55" x2="205" y2="55" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,105 50,65 72,55 95,88 118,55 140,85 162,55 185,82 205,58" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="205,58 235,38 265,20 300,8" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="15,100 90,97 160,93 230,82 300,60" fill="none" stroke={SMA200} strokeWidth="2" strokeLinecap="round" />
          <polyline points="15,110 50,90 85,78 120,72 155,68 185,62 205,55 235,42 265,25 300,12" fill="none" stroke={EMA8} strokeWidth="2" strokeLinecap="round" />
          <circle cx="185" cy="82" r="4" fill={UP} />
          <circle cx="162" cy="55" r="4" fill={DOWN} />
        </svg>
      )
    case 'breakdown_pattern':
      return (
        <svg {...common}>
          <line x1="40" y1="90" x2="205" y2="90" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,40 40,75 65,90 90,55 112,90 135,60 158,90 180,65 205,88" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="205,88 235,108 265,125 300,140" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="15,50 90,55 160,60 230,70 300,90" fill="none" stroke={SMA200} strokeWidth="2" strokeLinecap="round" />
          <polyline points="15,35 40,60 75,72 110,68 145,72 180,78 205,88 235,105 265,122 300,135" fill="none" stroke={EMA8} strokeWidth="2" strokeLinecap="round" />
          <circle cx="158" cy="90" r="4" fill={UP} />
          <circle cx="205" cy="88" r="4" fill={DOWN} />
        </svg>
      )
    case 'consolidation_pattern':
      return (
        <svg {...common}>
          <line x1="40" y1="50" x2="240" y2="50" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="40" y1="95" x2="240" y2="95" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,75 45,55 70,90 95,58 120,88 145,60 170,86 195,62 220,84 240,66" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="240,66 270,35 300,12" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="15,72 90,73 170,74 240,72 300,55" fill="none" stroke={SMA200} strokeWidth="2" strokeLinecap="round" />
          <polyline points="15,78 60,68 100,72 140,70 180,72 220,68 250,55 280,30 300,15" fill="none" stroke={EMA8} strokeWidth="2" strokeLinecap="round" />
          <circle cx="170" cy="86" r="4" fill={UP} />
          <circle cx="195" cy="62" r="4" fill={DOWN} />
        </svg>
      )
    case 'wedge_breakout':
      return (
        <svg {...common}>
          <line x1="20" y1="45" x2="230" y2="20" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <line x1="20" y1="130" x2="230" y2="45" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="20,130 55,70 55,45 90,105 90,80 125,55 125,35 160,68 160,50 195,30 195,22" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="195,22 235,10 270,4 300,2" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="20,120 90,110 160,95 230,70 300,40" fill="none" stroke={SMA200} strokeWidth="2" strokeLinecap="round" />
          <polyline points="20,125 60,95 100,80 140,60 180,42 220,25 260,12 300,5" fill="none" stroke={EMA8} strokeWidth="2" strokeLinecap="round" />
          <circle cx="90" cy="105" r="4" fill={UP} />
          <circle cx="125" cy="35" r="4" fill={DOWN} />
        </svg>
      )
    case 'downtrend_break':
      return (
        <svg {...common}>
          <line x1="15" y1="20" x2="220" y2="95" stroke={STRUCT_GUIDE} strokeWidth="1.5" strokeDasharray="4 3" />
          <polyline points="15,25 45,45 75,58 105,80 135,90 165,100 195,105 220,98" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="220,98 250,75 280,50 300,30" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="15,15 60,20 105,32 150,50 195,68 230,72 260,60 300,42" fill="none" stroke={SMA200} strokeWidth="2" strokeLinecap="round" />
          <polyline points="15,22 45,40 75,55 105,78 135,92 165,103 195,108 220,95 250,68 280,42 300,22" fill="none" stroke={EMA8} strokeWidth="2" strokeLinecap="round" />
          <circle cx="220" cy="98" r="4" fill={UP} />
          <circle cx="165" cy="100" r="4" fill={DOWN} />
        </svg>
      )
    case 'oversold_pattern':
      return (
        <svg {...common}>
          <polyline points="15,15 45,35 75,55 100,75 120,100 138,122 150,132" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="150,132 170,120 190,100 215,90 245,72 275,58 300,48" fill="none" stroke={NEUTRAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="15,10 80,18 140,35 200,55 260,68 300,72" fill="none" stroke={SMA200} strokeWidth="2" strokeLinecap="round" />
          <polyline points="15,12 45,30 75,50 100,72 120,98 138,120 150,128 170,112 190,95 215,82 245,65 275,50 300,40" fill="none" stroke={EMA8} strokeWidth="2" strokeLinecap="round" />
          <circle cx="170" cy="112" r="4" fill={UP} />
          <circle cx="150" cy="132" r="4.5" fill={DOWN} />
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
          {PATTERNS.length} תבניות מפתח בניתוח טכני — איך לזהות, מתי להיכנס, איפה לשים סטופ ומתי התבנית מתבטלת.
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
            {(active.id === 'breakout_pattern' || active.id === 'breakdown_pattern' || active.id === 'consolidation_pattern' ||
              active.id === 'wedge_breakout' || active.id === 'downtrend_break' || active.id === 'oversold_pattern') && (
              <div className="flex items-center gap-3 text-[11px]" style={{ color: '#64748b' }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: '#f97316' }} />
                  EMA 8
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: '#3b82f6' }} />
                  SMA 200
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: active.bias === 'bullish' ? 'rgba(34,197,94,0.12)' : active.bias === 'bearish' ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
                  color: active.bias === 'bullish' ? '#22c55e' : active.bias === 'bearish' ? '#ef4444' : '#94a3b8',
                }}
              >
                {active.bias === 'bullish' ? '📈 תבנית עולה' : active.bias === 'bearish' ? '📉 תבנית יורדת' : '↔️ ניטרלי'}
              </span>
              {active.patternType && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}
                >
                  {active.patternType === 'המשך' ? '➡️ תבנית המשך' : '🔄 תבנית היפוך'}
                </span>
              )}
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
