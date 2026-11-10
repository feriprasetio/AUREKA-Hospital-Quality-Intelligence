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
import './theme-arktik.css'

export const metadata: Metadata = {
  title: 'AUREKA — Hospital Quality Intelligence',
  description: 'AUREKA Hospital Quality Intelligence Platform',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-skin="arktik" suppressHydrationWarning>
      <head>
        {/* Tema tampilan: "arktik" (kaca) atau "klasik"; pilihan disimpan per perangkat. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('aureka-theme');if(t==='klasik'||t==='arktik')document.documentElement.setAttribute('data-skin',t)}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
