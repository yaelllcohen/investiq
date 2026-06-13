export interface TradeMetrics {
  rrRatio: number
  stopPct: number
  targetPct: number
  positionSize: number | null
  shares: number | null
  maxRisk: number | null
}

export function calcTradeMetrics(
  entry: number,
  stop: number,
  target: number,
  portfolioSize?: number,
  riskPct?: number
): TradeMetrics {
  const riskPerShare   = entry - stop
  const rewardPerShare = target - entry
  const rrRatio        = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
  const stopPct        = entry > 0 ? (riskPerShare / entry) * 100 : 0
  const targetPct      = entry > 0 ? (rewardPerShare / entry) * 100 : 0

  if (portfolioSize && riskPct && riskPerShare > 0) {
    const maxRisk     = portfolioSize * (riskPct / 100)
    const shares      = maxRisk / riskPerShare
    const positionSize = shares * entry
    return { rrRatio, stopPct, targetPct, positionSize, shares, maxRisk }
  }

  return { rrRatio, stopPct, targetPct, positionSize: null, shares: null, maxRisk: null }
}
