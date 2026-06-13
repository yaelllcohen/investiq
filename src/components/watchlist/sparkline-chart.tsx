'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function SparklineChart({ data, color }: { data: { value: number }[]; color: string }) {
  return (
    <div style={{ width: 80, minWidth: 80, height: 36, minHeight: 36 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={80}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
