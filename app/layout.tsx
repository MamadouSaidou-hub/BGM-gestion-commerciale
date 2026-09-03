import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BGM · Tableau de bord',
  description: 'Pilotez vos magasins, vos ventes et votre trésorerie depuis un seul espace.',
  generator: 'BGM Barry-Gate Multi Service',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#f7f9fc',
  userScalable: true,
}

// Runs before paint to avoid a flash of the wrong theme/accent color.
const themeScript = `
try {
  var theme = localStorage.getItem('bgm-theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } else {
    document.documentElement.style.colorScheme = 'light dark';
  }
  var accent = localStorage.getItem('bgm-accent-color');
  if (accent) document.documentElement.style.setProperty('--primary', accent);
} catch (e) {}
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="bg-background">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
