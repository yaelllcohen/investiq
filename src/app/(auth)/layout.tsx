import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--iq-bg)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-extrabold gradient-text font-jakarta" style={{ letterSpacing: '-0.03em' }}>
            InvestIQ
          </Link>
          <p className="text-sm mt-2" style={{ color: 'var(--iq-text-2)' }}>
            פלטפורמת השקעות מבוססת AI
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
