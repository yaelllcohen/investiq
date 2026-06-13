import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/layout/navbar'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen" style={{ background: 'var(--iq-bg)' }}>
      <Navbar user={session.user} />
      <main className="container mx-auto px-4 pt-6 pb-24 md:py-8 max-w-7xl">
        {children}
      </main>
    </div>
  )
}
