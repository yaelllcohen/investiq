import type { Metadata } from 'next'
import { Heebo, Plus_Jakarta_Sans } from 'next/font/google'
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
