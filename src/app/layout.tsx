import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CS HANDOFF',
  description: 'Central Supply live shift handoff board',
  applicationName: 'CS HANDOFF',

  manifest: '/manifest.webmanifest',

  themeColor: '#000000',

  appleWebApp: {
    capable: true,
    title: 'CS HANDOFF',
    statusBarStyle: 'black-translucent',
  },

  icons: {
    icon: '/icons/cs-handoff-icon.svg',
    apple: '/icons/cs-handoff-icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
