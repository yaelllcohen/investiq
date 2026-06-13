import type { Metadata, Viewport } from 'next'
import { Heebo, Plus_Jakarta_Sans } from 'next/font/google'
import PwaRegister from '@/components/pwa-register'
import './globals.css'

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500', '700', '800'],
  display: 'swap',
})

const jakartaSans = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'InvestIQ — פלטפורמת השקעות מבוססת AI',
  description: 'ניתוח שוק מקצועי, גרפים בזמן אמת וניהול תיק השקעות — מופעל על ידי AI',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'InvestIQ',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png',   sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#0f1117',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${jakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
