import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[anthropic] ANTHROPIC_API_KEY is not set')
}

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export const ANTHROPIC_MODEL = 'claude-opus-5'

/**
 * Extracts the first JSON object from a Claude text response, stripping
 * markdown code fences if present.
 */
export function extractJson(raw: string): unknown {
  const clean = raw.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON in response')
    return JSON.parse(match[0])
  }
}
