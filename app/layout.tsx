import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './aureka-global.css'
import UpdateNotifier from '@/components/layout/UpdateNotifier'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-aureka' })

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''
// Penanda versi build (ditulis ke <meta name="aureka-build">) untuk pemberitahuan versi baru.
const BUILD_ID = (process.env.GITHUB_SHA || '').slice(0, 12) || String(Date.now())

export const metadata: Metadata = {
  title: 'AUREKA: Hospital Quality Intelligence',
  description: 'AUREKA Hospital Quality Intelligence Platform',
  // Bisa dipasang di HP/PC seperti aplikasi ("Tambah ke layar utama").
  manifest: BASE_PATH + '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AUREKA', statusBarStyle: 'default' },
  other: { 'aureka-build': BUILD_ID },
}

export const viewport: Viewport = {
  // iPhone memperbesar layar saat kotak isian disentuh; maximumScale 1 mencegahnya (cubit-zoom tetap bisa di iOS).
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef1f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d13' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-skin="arktik" data-mode="terang" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/* Setelah deploy, halaman lama di cache bisa merujuk CSS/JS yang sudah dihapus → muat ulang sekali dengan versi terbaru. */}
        <script dangerouslySetInnerHTML={{ __html: '(function(){var K=\'aureka-stale-reload\';function fresh(){try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,\'1\')}catch(e){}var u=new URL(location.href);u.searchParams.set(\'v\',Date.now().toString(36));location.replace(u.toString())}window.addEventListener(\'error\',function(e){var t=e.target;if(t&&(t.tagName===\'LINK\'||t.tagName===\'SCRIPT\')&&/\\/_next\\//.test(t.href||t.src||\'\'))fresh()},true);window.addEventListener(\'unhandledrejection\',function(e){var r=e.reason;if(r&&(/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Loading CSS chunk/i.test(String(r&&r.name)+\' \'+String(r&&r.message))))fresh()});window.addEventListener(\'load\',function(){var bad=[].some.call(document.querySelectorAll(\'link[rel=stylesheet][href*="/_next/"]\'),function(l){return !l.sheet});if(bad){fresh();return}try{sessionStorage.removeItem(K)}catch(e){}var u=new URL(location.href);if(u.searchParams.has(\'v\')){u.searchParams.delete(\'v\');history.replaceState(history.state,\'\',u.toString())}})})();' }} />
        {/* Tema Arktik: mode "terang" atau "gelap"; pilihan disimpan per perangkat. */}
        <script dangerouslySetInnerHTML={{ __html: "try{for(var i=0;i<localStorage.length;i++){if(/^sb-.+-auth-token$/.test(localStorage.key(i)||'')){document.documentElement.setAttribute('data-ak-booting','1');setTimeout(function(){document.documentElement.removeAttribute('data-ak-booting')},6000);break}}}catch(e){}try{var m=localStorage.getItem('aureka-mode');if(m==='gelap'||m==='terang')document.documentElement.setAttribute('data-mode',m);var ts=localStorage.getItem('aureka-text-size');if(ts==='besar'||ts==='sangat-besar')document.documentElement.setAttribute('data-text-size',ts);if(localStorage.getItem('aureka-motion')==='off')document.documentElement.setAttribute('data-motion','off')}catch(e){}window.addEventListener('error',function(e){var t=String((e&&e.message)||'')+String(e&&e.error&&e.error.name||'');if(/ChunkLoadError|Loading chunk|Failed to load chunk/i.test(t)){try{if(!sessionStorage.getItem('aureka-chunk-reload')){sessionStorage.setItem('aureka-chunk-reload','1');location.reload()}}catch(x){}}});window.addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem('aureka-chunk-reload')}catch(x){}},10000)});" }} />
      </head>
      <body>{children}<UpdateNotifier /></body>
    </html>
  )
}
