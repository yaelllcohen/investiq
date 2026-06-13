# InvestIQ — Project Context for Claude

> אפליקציית השקעות מלאה בעברית | Full Hebrew Investment App

---

## Project Overview

| Field | Value |
|-------|-------|
| **App Name** | InvestIQ |
| **Language** | Hebrew (RTL) |
| **Root Path** | `/Users/yaelllcohen/investiq` |
| **Dev Server** | `npm run dev` → `http://localhost:3000` |
| **Layout** | Dark mode default, RTL, Heebo font |

### Users
- **יעל כהן** — yaelco1301@gmail.com
- **דודו כהן** — duduco1974@gmail.com

---

## Tech Stack

### Core Framework
- **Next.js 14** — App Router
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui**

### Auth
- **NextAuth.js v5** — Google + GitHub + Email/Password

### Database
- **Prisma ORM** + **SQLite** (development)
- `DATABASE_URL=file:./dev.db`

### Data & Charts
- **yahoo-finance2** — live market data
- **TradingView Lightweight Charts** — candlestick/OHLC charts
- **Recharts** — portfolio charts

### AI
- **Anthropic Claude API** — all AI features

### State Management
- **Zustand**

---

## Environment Variables

```env
AUTH_SECRET=oZs29XB12qJyjZVlJ/fFr6iPBCAGuEi+WIDtRnISw1s=
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=file:./dev.db
NEXTAUTH_URL=http://localhost:3000
```

---

## Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | דף נחיתה — Landing page |
| `/login` + `/register` | התחברות והרשמה — Auth |
| `/dashboard` | לוח מחוונים עם נתוני שוק חי — Live market dashboard |
| `/stock/[ticker]` | דף מניה עם גרפים — Stock detail with charts |
| `/portfolio` | תיק השקעות — Portfolio |
| `/simulator` | סימולטור עם $10,000 וירטואלי — Virtual trading simulator |
| `/ai-screener` | ממליץ מניות לפי העדפות — AI stock screener |
| `/ai-analysis/[ticker]` | ניתוח AI מעמיק — Deep AI analysis |
| `/ai-compare` | השוואת מניות — Stock comparison |
| `/ai-chat` | צ'אטבוט פיננסי — Financial chatbot |
| `/watchlist` | רשימת מעקב — Watchlist |
| `/risk-profile` | אשף פרופיל סיכון — Risk profile wizard |
| `/profile` | פרופיל משתמש — User profile |
| `/trade-coach` | מאמן החלטות השקעה — סטופ, יעד, יחס סיכון/סיכוי |
| `/journal` | יומן החלטות השקעה — תיעוד תזה ותוצאה |
| `/goals` | מטרות פיננסיות — GPS פיננסי עם ריבית דריבית |
| `/psychology` | ניתוח פסיכולוגי — זיהוי FOMO, ציון משמעת |

---

## Charts

### Chart Types
`Candlestick` · `OHLC` · `Line` · `Area` · `Baseline`
- Toggle between types via UI switch

### Time Ranges
`1D` · `5D` · `1M` · `3M` · `6M` · `1Y` · `5Y` · `MAX`

---

## Database Schema — Holding

```prisma
model Holding {
  ticker       String
  name         String
  quantity     Float
  avgPrice     Float
  purchaseDate DateTime
  assetType    String
  currency     String   // USD | ILS | EUR | GBP
}
```

---

## Israeli Stocks & Securities

### Yahoo Finance (.TA suffix)
For Israeli stocks traded on TASE that exist on Yahoo Finance:
```
DORL  →  DORL.TA
TEVA  →  TEVA.TA
```
The system automatically retries with `.TA` appended if the initial ticker lookup fails.

### Israeli Securities by Paper Number (Bizportal)
For Israeli ETFs, mutual funds, and bonds **not available on Yahoo Finance**, use the TASE paper number.

**Source: `src/lib/bizportal.ts`** — HTML scraper from Bizportal  
**URL pattern:** `https://www.bizportal.co.il/capitalmarket/quote/generalview/{paperId}`

```
1143700  →  תכלית סל ת"א 35  →  ₪4,131 (-1.29%)
1166768  →  דוראל אנרגיה
```

**⚠️ DO NOT use TASE API (`api.tase.co.il`)** — blocked by Imperva/Incapsula WAF, returns 403 always.  
**⚠️ DO NOT use `maya.tase.co.il`** — also blocked.  
**✅ USE Bizportal scraping** — works from Node.js server-side, no auth required.

The proxy route `/api/tase/[securityId]` tries TASE first (fails) then falls back to Bizportal automatically.

---

## UI / Design

- **Theme**: Dark mode by default
- **Direction**: RTL (Hebrew)
- **Font**: Heebo (Hebrew)
- **Color coding**:
  - 🟢 Green → price increase
  - 🔴 Red → price decrease

---

## AI System Prompt (Summary)

- Role: מומחה יועץ פיננסי — Expert financial advisor
- Language: Always responds in Hebrew
- Coverage: מניות, ETF, קריפטו, אגח, OTC, פורקס, נוסטרו
- Analysis: Always covers **3 time horizons** — קצר / בינוני / ארוך (short / medium / long)
- Disclaimer (always appended):
  > "לצורכי לימוד בלבד — אין לראות בכך ייעוץ השקעות"

---

## Known Open Issues

### 🟡 Expected Behavior
1. **Charts don't load on weekends** — market is closed, this is normal
2. **Israeli stocks (.TA) require manual suffix** — auto-retry is in place but not always triggered

### ✅ Resolved
- Portfolio add holding — fixed (assetType was sent as "Stock" instead of "stock")
- Simulator state.trades null — fixed with `?? []` fallback
- Israeli securities pricing — solved via Bizportal scraping

---

## Common Development Notes

- Always use App Router conventions (`app/` directory, `page.tsx`, `layout.tsx`, `route.ts`)
- API routes live in `app/api/`
- Auth session available via `getServerSession()` or `useSession()` hook
- Prisma client: import from `@/lib/prisma`
- For AI features, use the Anthropic Claude API — do not use other LLM providers
- Keep all user-facing strings in Hebrew
- RTL layout: use `dir="rtl"` on root, Tailwind `rtl:` variants where needed
