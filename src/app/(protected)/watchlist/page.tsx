import WatchlistTable from '@/components/watchlist/watchlist-table'
import { Star } from 'lucide-react'

export default function WatchlistPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <Star className="h-5 w-5" style={{ color: '#F59E0B' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--iq-text)' }}>
            רשימת מעקב
          </h1>
          <p className="text-sm" style={{ color: 'var(--iq-text-3)' }}>
            מניות במעקב שלך
          </p>
        </div>
      </div>

      <WatchlistTable items={[]} />
    </div>
  )
}
