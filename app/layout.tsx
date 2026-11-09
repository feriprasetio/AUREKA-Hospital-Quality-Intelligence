import type { Metadata } from 'next'
import './globals.css'
import './clinical-ui.css'
import './medidash-ui.css'
import './solid-default.css'
import './medidash-polish.css'
import './design-tokens.css'
import './layout-responsive.css'
import './aureka-solid-enterprise.css'
import './aureka-solid-navigation.css'
import './public-landing-auth-redesign.css'
import './aureka-landing.css'
import './aureka-refined.css'
import './workspace-desk.css'
import './workspace-redesign.css'

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
