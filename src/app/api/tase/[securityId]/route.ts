import { NextResponse } from 'next/server'
import { getBizportalPrice } from '@/lib/bizportal'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC RESULT (tested 2026-06-08 with securityId 1143700):
//
// TASE API at api.tase.co.il is behind Imperva/Incapsula WAF.
// The WAF serves a JavaScript challenge page (HTTP 403) to ALL non-browser
// requests, including server-side Node.js fetches — regardless of headers.
// The challenge injects a <script> tag that runs in a real browser, computes
// a fingerprint, and sets a session cookie. Without that cookie every fetch
// returns 403 with an Incapsula incident ID.
//
// Confirmed blocked paths:
//   - api.tase.co.il/api/security/trading/data    (primary API)
//   - api.tase.co.il/graphql                       (GraphQL)
//   - maya.tase.co.il/api                          (regulatory/MAYA API)
//
// Confirmed unblocked alternatives:
//   - Yahoo Finance with .TA suffix for stocks that have a Yahoo symbol
//     e.g. TEVA.TA, NICE.TA (already used in getTaseSecurityData fallback)
//   - Manual price entry (already implemented in the portfolio UI)
//
// To unblock automatic pricing for paper numbers (6–9 digit IDs) you need
// one of:
//   (a) Playwright/Puppeteer headless browser that can solve JS challenges
//   (b) A scraping-proxy service (ScraperAPI / Bright Data) — requires API key
//   (c) Official TASE Data Feed subscription (tase.co.il/he/data)
// ─────────────────────────────────────────────────────────────────────────────

const TASE_BASE = 'https://api.tase.co.il/api'

const HEADER_SETS: { label: string; headers: Record<string, string> }[] = [
  {
    label: 'full-browser',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://www.tase.co.il/',
      Origin: 'https://www.tase.co.il',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
    },
  },
  {
    label: 'minimal',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.tase.co.il/',
      Accept: 'application/json',
    },
  },
  {
    label: 'bare',
    headers: { Accept: 'application/json' },
  },
]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ securityId: string }> }
) {
  const { securityId } = await params
  const url = `${TASE_BASE}/security/trading/data?securityId=${encodeURIComponent(securityId)}`
  const results: { label: string; status: number; isIncapsula: boolean; error?: string }[] = []

  console.log(`\n[tase-proxy] ▶ securityId=${securityId}`)
  console.log(`[tase-proxy]   url: ${url}`)

  for (const { label, headers } of HEADER_SETS) {
    try {
      const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
      const rawText = await res.text()
      const isIncapsula = rawText.includes('_Incapsula_Resource') || rawText.includes('Incapsula incident')

      console.log(`[tase-proxy]   [${label}] HTTP ${res.status} | incapsula=${isIncapsula}`)
      if (!isIncapsula) console.log(`[tase-proxy]   body: ${rawText.slice(0, 400)}`)

      results.push({ label, status: res.status, isIncapsula })

      if (res.ok && !isIncapsula) {
        let data: unknown
        try { data = JSON.parse(rawText) } catch {
          return NextResponse.json({ error: 'Non-JSON response', raw: rawText.slice(0, 400) }, { status: 502 })
        }
        console.log(`[tase-proxy]   ✓ SUCCESS with "${label}" — keys: ${Object.keys(data as object).join(', ')}`)
        return NextResponse.json({ ok: true, usedSet: label, securityId, data })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[tase-proxy]   [${label}] fetch error: ${msg}`)
      results.push({ label, status: 0, isIncapsula: false, error: msg })
    }
  }

  const allIncapsula = results.every((r) => r.isIncapsula || r.status === 403)
  console.log(`[tase-proxy]   ✗ TASE API blocked | allIncapsula=${allIncapsula}`)

  // ── Bizportal fallback ───────────────────────────────────────────────────
  console.log(`[tase-proxy]   trying Bizportal scraper for ${securityId}…`)
  const biz = await getBizportalPrice(securityId)
  if (biz) {
    console.log(`[tase-proxy]   ✓ Bizportal SUCCESS — price=${biz.price} change=${biz.changePercent}% name=${biz.name}`)
    return NextResponse.json({ ok: true, source: 'bizportal', securityId, ...biz })
  }

  console.log(`[tase-proxy]   ✗ Bizportal also failed`)
  return NextResponse.json(
    {
      ok: false,
      securityId,
      taseConclusion: allIncapsula ? 'Incapsula WAF blocked all attempts' : 'All header sets exhausted',
      bizportalConclusion: 'Bizportal scrape returned null — invalid paper ID or page structure changed',
      taseResults: results,
    },
    { status: 502 }
  )
}
