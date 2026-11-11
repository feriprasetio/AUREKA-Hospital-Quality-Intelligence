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
import './survey-wizard.css'
import './theme-arktik-accents.css'
import './theme-arktik-dark.css'
import './theme-arktik.css'
import './theme-arktik-modern.css'
import './overview-bento.css'
import './settings-modern.css'
import './kpi-bento.css'
import './tanya-aureka.css'
import './mobile-nav.css'
import './perf.css'
import './modal.css'
import './landing-motion.css'
import './proportional-ui.css'
import './motion.css'

export const metadata: Metadata = {
  title: 'AUREKA — Hospital Quality Intelligence',
  description: 'AUREKA Hospital Quality Intelligence Platform',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-skin="solid" data-mode="terang" suppressHydrationWarning>
      <head>
        {/* AUREKA Solid Default: workspace selalu dimulai dalam tema terang yang konsisten. */}
        <script dangerouslySetInnerHTML={{ __html: "try{localStorage.setItem('aureka-mode','terang');document.documentElement.setAttribute('data-mode','terang')}catch(e){}window.addEventListener('error',function(e){var t=String((e&&e.message)||'')+String(e&&e.error&&e.error.name||'');if(/ChunkLoadError|Loading chunk|Failed to load chunk/i.test(t)){try{if(!sessionStorage.getItem('aureka-chunk-reload')){sessionStorage.setItem('aureka-chunk-reload','1');location.reload()}}catch(x){}}});window.addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem('aureka-chunk-reload')}catch(x){}},10000)});" }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
