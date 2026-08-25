import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BGM · Tableau de bord',
  description: 'Pilotez vos magasins, vos ventes et votre trésorerie depuis un seul espace.',
  generator: 'BGM Barry-Gate Multi Service',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f9fc',
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="bg-background">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
