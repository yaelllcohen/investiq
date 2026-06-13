'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export const EMOTION_COLORS: Record<string, string> = {
  planned: '#10B981',
  FOMO:    '#F59E0B',
  panic:   '#F43F5E',
  other:   '#6B7280',
}

export const EMOTION_LABELS: Record<string, string> = {
  planned: '🎯 תכנון רגוע',
  FOMO:    '📈 FOMO',
  panic:   '😱 פאניקה',
  other:   '💭 אחר',
}

interface EmotionData {
  emotion:     string
  count:       number
  successRate: number | null
}

interface CustomTooltipProps {
  active?:  boolean
  payload?: { payload: EmotionData }[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-zinc-100">{EMOTION_LABELS[d.emotion] ?? d.emotion}</p>
      <p className="text-zinc-400">{d.count} עסקאות</p>
      {d.successRate != null && (
        <p style={{ color: EMOTION_COLORS[d.emotion] }}>{d.successRate}% הצלחה</p>
      )}
    </div>
  )
}

export default function EmotionPieChart({ data }: { data: EmotionData[] }) {
  return (
    <div style={{ width: '100%', minHeight: 220 }}>
      <ResponsiveContainer width="100%" height={220} minWidth={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={3}
            dataKey="count"
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell
                key={entry.emotion}
                fill={EMOTION_COLORS[entry.emotion] ?? '#6B7280'}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
