import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
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
import './typography.css'
import './aureka-brand.css'
import './motion.css'
import './aureka-navigation-consolidated.css'
import './dark-mode-mobile-fixes.css'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-aureka' })

export const metadata: Metadata = {
  title: 'AUREKA: Hospital Quality Intelligence',
  description: 'AUREKA Hospital Quality Intelligence Platform',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-skin="arktik" data-mode="terang" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/* Setelah deploy, halaman lama di cache bisa merujuk CSS/JS yang sudah dihapus → muat ulang sekali dengan versi terbaru. */}
        <script dangerouslySetInnerHTML={{ __html: '(function(){var K=\'aureka-stale-reload\';function fresh(){try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,\'1\')}catch(e){}var u=new URL(location.href);u.searchParams.set(\'v\',Date.now().toString(36));location.replace(u.toString())}window.addEventListener(\'error\',function(e){var t=e.target;if(t&&(t.tagName===\'LINK\'||t.tagName===\'SCRIPT\')&&/\\/_next\\//.test(t.href||t.src||\'\'))fresh()},true);window.addEventListener(\'unhandledrejection\',function(e){var r=e.reason;if(r&&(/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Loading CSS chunk/i.test(String(r&&r.name)+\' \'+String(r&&r.message))))fresh()});window.addEventListener(\'load\',function(){var bad=[].some.call(document.querySelectorAll(\'link[rel=stylesheet][href*="/_next/"]\'),function(l){return !l.sheet});if(bad){fresh();return}try{sessionStorage.removeItem(K)}catch(e){}var u=new URL(location.href);if(u.searchParams.has(\'v\')){u.searchParams.delete(\'v\');history.replaceState(history.state,\'\',u.toString())}})})();' }} />
        {/* Tema Arktik: mode "terang" atau "gelap"; pilihan disimpan per perangkat. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var m=localStorage.getItem('aureka-mode');if(m==='gelap'||m==='terang')document.documentElement.setAttribute('data-mode',m);var ts=localStorage.getItem('aureka-text-size');if(ts==='besar'||ts==='sangat-besar')document.documentElement.setAttribute('data-text-size',ts);if(localStorage.getItem('aureka-motion')==='off')document.documentElement.setAttribute('data-motion','off')}catch(e){}window.addEventListener('error',function(e){var t=String((e&&e.message)||'')+String(e&&e.error&&e.error.name||'');if(/ChunkLoadError|Loading chunk|Failed to load chunk/i.test(t)){try{if(!sessionStorage.getItem('aureka-chunk-reload')){sessionStorage.setItem('aureka-chunk-reload','1');location.reload()}}catch(x){}}});window.addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem('aureka-chunk-reload')}catch(x){}},10000)});" }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
