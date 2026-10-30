import type { Metadata } from 'next'
import './globals.css'
import './clinical-ui.css'
import './medidash-ui.css'
import './solid-default.css'

export const metadata: Metadata = {
  title: 'AUREKA — Hospital Quality Intelligence',
  description: 'AUREKA Hospital Quality Intelligence Platform',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
