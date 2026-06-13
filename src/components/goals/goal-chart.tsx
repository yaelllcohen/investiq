'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

export interface ChartPoint {
  label: string
  projected: number
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}

interface GoalChartProps {
  data: ChartPoint[]
  targetAmount: number
  currency: string
}

export default function GoalChart({ data, targetAmount, currency }: GoalChartProps) {
  const sym = currency === 'ILS' ? '₪' : currency === 'EUR' ? '€' : '$'

  return (
    <div style={{ width: '100%', minHeight: 160 }}>
      <ResponsiveContainer width="100%" height={160} minWidth={200}>
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="goalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#71717A' }}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#71717A' }}
            tickFormatter={(v) => `${sym}${compact(v as number)}`}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v) => [`${sym}${(v as number).toLocaleString('he-IL')}`, 'צפי']}
            contentStyle={{
              background: '#18181B',
              border: '1px solid #3F3F46',
              borderRadius: 6,
              fontSize: 11,
            }}
            labelStyle={{ color: '#A1A1AA' }}
            itemStyle={{ color: '#818CF8' }}
          />
          <ReferenceLine
            y={targetAmount}
            stroke="#10B981"
            strokeDasharray="4 2"
            strokeWidth={1.5}
            label={{ value: 'יעד', position: 'insideTopRight', fill: '#10B981', fontSize: 9 }}
          />
          <Area
            type="monotone"
            dataKey="projected"
            stroke="#6366F1"
            fill="url(#goalGradient)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
