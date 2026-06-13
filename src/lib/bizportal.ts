// Scrapes Israeli security prices from Bizportal.
// Works for stocks, ETFs, and mutual funds via paper number (6–9 digits).
//
// URL routing (capitalmarket follows redirects automatically):
//   Stock      → https://www.bizportal.co.il/capitalmarket/quote/generalview/{id}  (HTTP 200)
//   ETF / Fund → same URL  →  301  →  tradedfund/quote/generalview/{id}
//   Invalid ID → 302  →  /tradedata/paperslist

const BASE = 'https://www.bizportal.co.il/capitalmarket/quote/generalview'

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
}

export interface BizportalSecurity {
  price: number
  changePercent: number | null
  name: string | null
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getBizportalPrice(paperId: string): Promise<BizportalSecurity | null> {
  const url = `${BASE}/${encodeURIComponent(paperId)}`

  let html: string
  let finalUrl: string
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    finalUrl = res.url
    if (!res.ok) return null

    // If we landed on the papers-list search page the paper ID is invalid
    if (finalUrl.includes('/tradedata/paperslist') || finalUrl.includes('/list/')) {
      return null
    }

    html = await res.text()
  } catch {
    return null
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[bizportal] fetched ${url} → finalUrl=${finalUrl} (${html.length} bytes)`)
  }

  const price = extractPrice(html)
  if (!price) return null

  const changePercent = extractChangePercent(html)
  const name          = extractName(html)

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[bizportal] paperId=${paperId} price=${price} change=${changePercent} name=${name}`)
  }

  return { price, changePercent, name }
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractPrice(html: string): number | null {
  // Stock pattern: <div id="paper_rate" ...><span class="num">6,703</span>
  const stockMatch = html.match(/id="paper_rate"[^>]*>[\s\S]*?<span class="num">([\d,\.]+)<\/span>/)
  if (stockMatch) return parseILPrice(stockMatch[1])

  // ETF / Traded fund pattern: <div class="top-rate-line" ...><div class="num">4,131</div>
  const etfMatch = html.match(/top-rate-line[^>]*>\s*<div class="num">([\d,\.]+)<\/div>/)
  if (etfMatch) return parseILPrice(etfMatch[1])

  // Money market / mutual fund pattern (קרן כספית, קרן נאמנות):
  //   <div class="label">מחיר פדיון</div><div class="num">119.41</div>
  const fundMatch = html.match(/מחיר פדיון<\/div><div class="num">([\d,\.]+)<\/div>/)
  if (fundMatch) return parseILPrice(fundMatch[1])

  return null
}

function extractChangePercent(html: string): number | null {
  // Stock: <div id="paper_change" ...>...<span class="num">-0.55%</span>
  const stockMatch = html.match(/id="paper_change"[\s\S]*?<span class="num">([-+]?[\d,\.]+)%/)
  if (stockMatch) return parseFloat(stockMatch[1].replace(',', ''))

  // ETF: <span class="num percent [drop|rise]"><span>-1.29%</span>
  const etfMatch = html.match(/num percent[^>]*><span>([-+]?[\d,\.]+)%<\/span>/)
  if (etfMatch) return parseFloat(etfMatch[1].replace(',', ''))

  return null
}

function extractName(html: string): string | null {
  // <title>TYPE NAME | ביזפורטל</title>
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/)
  if (!titleMatch) return null

  const raw = titleMatch[1].trim()
  // Remove "| ביזפורטל" suffix
  const withoutSite = raw.replace(/\s*\|\s*ביזפורטל.*$/, '').trim()
  if (!withoutSite) return null

  // Strip known type prefixes while keeping the name
  const stripped = withoutSite
    .replace(/^מניית\s+/, '')
    .replace(/^קרן סל\s+/, '')
    .replace(/^קרן נאמנות\s+/, '')
    .replace(/^קרן כספית\s+/, '')
    .replace(/^אגרת חוב\s+/, '')
    .replace(/^ניירות ערך\s+/, '')
    .trim()

  return stripped || withoutSite
}

// Israeli number format: "4,131" or "6,703.50" → number
function parseILPrice(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}
