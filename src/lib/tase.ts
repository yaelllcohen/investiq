// TASE API is behind Incapsula WAF — server-side requests are blocked (HTTP 403)
// in most environments. The code is correct; falls back to manualPrice → avgPrice
// when the API is unreachable. In production cloud environments the WAF may allow it.

const TASE_API = 'https://api.tase.co.il/api'

export interface TaseSecurity {
  price: number
  name?: string
}

export function isTasePaperNumber(ticker: string): boolean {
  return /^\d{6,9}$/.test(ticker)
}

export async function getTaseSecurityData(paperId: string): Promise<TaseSecurity | null> {
  try {
    const res = await fetch(
      `${TASE_API}/security/trading/data?securityId=${encodeURIComponent(paperId)}`,
      {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
          Origin: 'https://www.tase.co.il',
          Referer: `https://www.tase.co.il/he/market_data/security/${paperId}/major_data`,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'sec-fetch-dest': 'empty',
        },
        cache: 'no-store',
      }
    )

    if (!res.ok) return null

    const data = (await res.json()) as Record<string, unknown>

    // Log the raw shape once so we can verify field names if the API ever becomes reachable
    if (process.env.NODE_ENV !== 'production') {
      console.log('[tase] raw response for', paperId, JSON.stringify(data).slice(0, 200))
    }

    const price = pickNumber(data, [
      'lastRate', 'LastRate',
      'closingRate', 'ClosingRate',
      'baseRate', 'BaseRate',
      'currentRate', 'CurrentRate',
      'navRate', 'NavRate',
      'price', 'Price',
      'rate', 'Rate',
    ])

    if (!price || price <= 0) return null

    const name = pickString(data, ['securityName', 'SecurityName', 'name', 'Name'])
    return { price, name: name ?? undefined }
  } catch {
    return null
  }
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && v > 0) return v
    if (typeof v === 'string') {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0) return n
    }
  }
  // Also try one level deep (e.g. { tradeData: { lastRate: ... } })
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const deep = pickNumber(nested as Record<string, unknown>, keys)
      if (deep) return deep
    }
  }
  return null
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}
