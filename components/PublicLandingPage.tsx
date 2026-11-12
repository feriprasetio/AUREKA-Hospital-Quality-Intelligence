'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import LandingProductPreview from '@/components/LandingProductPreview'

type LandingProps = {
  logoSrc: string
  onLogin: () => void
}

type IconName =
  | 'home'
  | 'chart'
  | 'shield'
  | 'risk'
  | 'people'
  | 'report'
  | 'settings'
  | 'arrow'
  | 'check'
  | 'lock'
  | 'workflow'
  | 'clipboard'
  | 'heart'
  | 'menu'
  | 'close'
  | 'chevron'
  | 'network'

const iconArtwork: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M9 20v-6h6v6" /></>,
  chart: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
  shield: <><path d="M12 3 19 6v5.2c0 4.4-2.7 7.9-7 9.3-4.3-1.4-7-4.9-7-9.3V6l7-3Z" /><path d="m8.7 12.1 2.1 2.1 4.5-4.7" /></>,
  risk: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.3 7.5-4.3" /><path d="M12 12.1V21" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.3 2.3-5 5.5-5s5 1.7 5.5 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 15c2.1.3 3.3 1.9 3.6 4.5" /></>,
  report: <><path d="M6 3.5h8l4 4V20H6z" /><path d="M14 3.5V8h4" /><path d="M9 12h6M9 15.5h6" /></>,
  settings: <><path d="M12 3.5 14 5l2.4-.2 1 2.2 2 1.2-.7 2.3 1.1 2-1.5 1.9.2 2.3-2.2 1-1.2 2-2.3-.7-2 1.1-1.9-1.5-2.3.2-1-2.2-2-1.2.7-2.3-1.1-2 1.5-1.9-.2-2.3 2.2-1 1.2-2 2.3.7 2-1.1Z" /><circle cx="12" cy="12" r="3" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></>,
  workflow: <><rect x="3" y="4" width="7" height="6" rx="1.5" /><rect x="14" y="14" width="7" height="6" rx="1.5" /><path d="M10 7h3a2 2 0 0 1 2 2v5M12 14l3 0" /><path d="m12 11 3 3-3 3" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  heart: <><path d="M20.5 8.5c0 5-8.5 11-8.5 11s-8.5-6-8.5-11A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5Z" /><path d="M8 12h2l1.2-2.2 2 4.4 1.1-2.2H16" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  network: <><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="5" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="m7.3 10.8 9.4-4.6M7.3 13.2l9.4 4.6" /></>,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconArtwork[name]}
    </svg>
  )
}

const navItems = [
  { href: '#platform', label: 'Fitur' },
  { href: '#modules', label: 'Modul' },
  { href: '#workflow', label: 'Alur Kerja' },
  { href: '#transparency', label: 'Transparansi' },
]

const modules: Array<{
  number: string
  title: string
  description: string
  icon: IconName
  tags: string[]
}> = [
  {
    number: '01',
    title: 'Ringkasan',
    description: 'Ikhtisar operasional, antrean prioritas, dan status data sesuai lingkup kewenangan pengguna.',
    icon: 'home',
    tags: ['Dashboard', 'Prioritas'],
  },
  {
    number: '02',
    title: 'Mutu Klinis',
    description: 'Audit Indikator Mutu, Clinical Pathway, serta Audit Klinis dan Kematian dalam workspace terstruktur.',
    icon: 'chart',
    tags: ['INM & IMP-RS', 'Clinical Pathway'],
  },
  {
    number: '03',
    title: 'Keselamatan Pasien',
    description: 'Pelaporan insiden, klasifikasi, investigasi, analisis akar masalah, pembelajaran, dan tindak lanjut.',
    icon: 'shield',
    tags: ['IKP', 'RCA', 'Budaya Keselamatan'],
  },
  {
    number: '04',
    title: 'Manajemen Risiko',
    description: 'Risk Register, penilaian risiko, FMEA/HFMEA, Rencana Tindak Pengendalian, dan eskalasi.',
    icon: 'risk',
    tags: ['Risk Register', 'RTP'],
  },
  {
    number: '05',
    title: 'Tenaga Klinis',
    description: 'Direktori tenaga, tim dan penugasan, serta evaluasi OPPE dan FPPE yang dapat ditelusuri per individu.',
    icon: 'people',
    tags: ['Direktori', 'OPPE', 'FPPE'],
  },
  {
    number: '06',
    title: 'Analitik & Laporan',
    description: 'Statistik, tren, kelengkapan data, dan ekstraksi laporan sesuai scope serta hak akses pengguna.',
    icon: 'report',
    tags: ['Analitik', 'Ekspor'],
  },
  {
    number: '07',
    title: 'Administrasi',
    description: 'Pengelolaan akun, role, unit, master indikator, versi aturan, dan konfigurasi yang berwenang.',
    icon: 'settings',
    tags: ['Pengguna', 'Master Data'],
  },
]

const improvementSteps = [
  { number: '01', title: 'Temuan teridentifikasi', text: 'Sumber dapat berasal dari audit mutu, IKP, RCA, risiko, FMEA, Clinical Pathway, maupun evaluasi tenaga klinis.' },
  { number: '02', title: 'Analisis dan rencana', text: 'Masalah, akar penyebab, tindakan korektif dan preventif, PIC, serta target waktu dicatat secara terstruktur.' },
  { number: '03', title: 'Pelaksanaan dan bukti', text: 'Penanggung jawab memperbarui progres dan melampirkan bukti pelaksanaan sesuai kewenangannya.' },
  { number: '04', title: 'Verifikasi efektivitas', text: 'Verifikator menilai bukti dan efektivitas. Tindakan yang belum efektif dapat dikembalikan untuk perbaikan.' },
]

const workSteps = [
  { number: '01', title: 'Catat', text: 'PIC mencatat data, temuan, atau hasil audit pada modul yang sesuai.' },
  { number: '02', title: 'Periksa', text: 'Kelengkapan dan konsistensi diperiksa sebelum proses review atau validasi.' },
  { number: '03', title: 'Analisis', text: 'Data yang memenuhi kriteria diolah menjadi informasi dan prioritas tindak lanjut.' },
  { number: '04', title: 'Tingkatkan', text: 'Tindakan perbaikan dipantau sampai bukti dan efektivitasnya dinilai.' },
]

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="a2-section-heading">
      <span className="a2-eyebrow">{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

export default function PublicLandingPage({ logoSrc, onLogin }: LandingProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [transparencyOpen, setTransparencyOpen] = useState(false)
  const [moduleQuery, setModuleQuery] = useState('')
  const visibleModules = modules.filter((module) =>
    `${module.title} ${module.description} ${module.tags.join(' ')}`.toLocaleLowerCase('id-ID')
      .includes(moduleQuery.trim().toLocaleLowerCase('id-ID')),
  )

  const openLogin = () => {
    setMobileOpen(false)
    onLogin()
  }

  const rootRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)

  // Animasi: elemen muncul saat di-scroll, header mengecil, kartu produk miring mengikuti kursor (desktop).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof IntersectionObserver === 'undefined') return () => window.removeEventListener('scroll', onScroll)
    root.classList.add('a2-motion')
    const groups = [
      '.a2-institution-strip', '.a2-section-heading',
      '.a2-domain-card', '.a2-module-toolbar', '.a2-module-card', '.a2-capa-copy', '.a2-capa-step',
      '.a2-workflow-card', '.a2-governance-panel', '.a2-transparency-section > *', '.a2-footer-main > *',
    ]
    const targets: HTMLElement[] = []
    groups.forEach((sel) => {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        const sib: Element[] = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.matches(sel)) : [el]
        el.style.setProperty('--a2-i', String(Math.min(sib.indexOf(el), 6)))
        el.classList.add('a2-reveal')
        targets.push(el)
      })
    })
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) } })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    targets.forEach((t) => io.observe(t))
    // Pengaman: bila observer tidak berjalan, tampilkan semuanya.
    const safety = window.setTimeout(() => targets.forEach((t) => { const r = t.getBoundingClientRect(); if (r.top < window.innerHeight) t.classList.add('is-in') }), 1800)

    const show = root.querySelector<HTMLElement>('.a2-product-showcase')
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    let raf = 0
    const onMove = (ev: PointerEvent) => {
      if (!show) return
      const r = show.getBoundingClientRect()
      const x = (ev.clientX - r.left) / r.width - 0.5
      const y = (ev.clientY - r.top) / r.height - 0.5
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { show.style.setProperty('--tilt-x', (y * -5).toFixed(2) + 'deg'); show.style.setProperty('--tilt-y', (x * 7).toFixed(2) + 'deg') })
    }
    const onLeave = () => { show?.style.setProperty('--tilt-x', '0deg'); show?.style.setProperty('--tilt-y', '0deg') }
    if (show && fine) { show.addEventListener('pointermove', onMove); show.addEventListener('pointerleave', onLeave) }
    return () => {
      window.removeEventListener('scroll', onScroll)
      io.disconnect(); window.clearTimeout(safety); cancelAnimationFrame(raf)
      if (show && fine) { show.removeEventListener('pointermove', onMove); show.removeEventListener('pointerleave', onLeave) }
    }
  }, [])


  return (
    <main className={'a2-landing' + (scrolled ? ' a2-scrolled' : '')} id="top" ref={rootRef}>
      <div className="a2-aurora" aria-hidden="true"><i /><i /><i /></div>
      <a className="a2-skip-link" href="#main-content">Lewati ke konten utama</a>

      <header className="a2-header">
        <div className="a2-container a2-header-inner">
          <a className="a2-brand" href="#top" aria-label="AUREKA — kembali ke awal halaman">
            <span className="a2-brand-mark">
              <img src={logoSrc} width={384} height={323} alt="Logo AUREKA Hospital Quality Intelligence" />
            </span>
            <span className="a2-brand-copy">
              <strong>AUREKA</strong>
              <small>Hospital Quality Intelligence</small>
            </span>
          </a>

          <nav className="a2-desktop-nav" aria-label="Navigasi utama">
            {navItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>

          <div className="a2-header-actions">
            <button type="button" className="a2-button a2-button-primary a2-button-workspace" onClick={openLogin}>
              Masuk Workspace <Icon name="arrow" size={15} />
            </button>
          </div>

          <button
            type="button"
            className="a2-mobile-toggle"
            aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}
            aria-expanded={mobileOpen}
            aria-controls="a2-mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} size={21} />
          </button>
        </div>

        {mobileOpen && (
          <div className="a2-mobile-nav" id="a2-mobile-navigation">
            <nav aria-label="Navigasi utama mobile">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
                  {item.label}
                  <Icon name="arrow" size={16} />
                </a>
              ))}
            </nav>
          </div>
        )}
      </header>

      <div className="a2-container" id="main-content" tabIndex={-1}>
        <section className="a2-hero" aria-labelledby="a2-hero-title">
          <div className="a2-hero-copy">
            <div className="a2-institution-chip">
              <span className="a2-chip-dot" />
              PLATFORM MUTU & KESELAMATAN PASIEN
            </div>
            <h1 id="a2-hero-title">
              <span className="a2-line"><span>Pelayanan lebih baik.</span></span>
              <span className="a2-line a2-accent-line"><span>Dimulai dari mutu</span></span>
              <span className="a2-line a2-accent-line"><span>yang terukur.</span></span>
            </h1>
            <p className="a2-hero-description">
              Dari pencatatan hingga keputusan. Satukan mutu klinis, keselamatan pasien,
              dan pengendalian risiko dalam satu ruang kerja yang jelas, terarah, dan dapat ditelusuri.
            </p>
            <div className="a2-hero-links">
              <a href="#modules">Kenali ruang kerja <Icon name="arrow" size={17} /></a>
              <a href="#workflow">Lihat cara kerjanya <span aria-hidden="true">↗</span></a>
            </div>
            <div className="a2-hero-principles" aria-label="Fokus utama AUREKA">
              <span><Icon name="chart" size={15} /> Evaluasi kualitas</span>
              <span><Icon name="shield" size={15} /> Keselamatan pasien</span>
              <span><Icon name="risk" size={15} /> Unifikasi risiko</span>
            </div>
            <p className="a2-hero-expansion">Alkadrie · Unifikasi Risiko, Evaluasi Kualitas, dan Asesmen</p>
          </div>

          <aside className="a2-hero-showcase a2-product-showcase" aria-label="Tur produk interaktif AUREKA">
            <LandingProductPreview />
            <div className="a2-product-note"><span><Icon name="network" size={19} /></span><div><strong>Terhubung. Terstruktur. Tertelusur.</strong><small>Satu ekosistem untuk siklus peningkatan mutu.</small></div></div>
          </aside>
        </section>

        <div className="a2-institution-strip">
          <span className="a2-institution-seal"><Icon name="heart" size={25} /></span>
          <div><strong>Dibangun untuk pelayanan yang lebih bermakna.</strong><p>UPT RSUD Sultan Syarif Mohamad Alkadrie · Komite PMKP</p></div>
          <span className="a2-institution-note"><Icon name="lock" size={15} /> Berbasis peran & kewenangan</span>
        </div>

        <section className="a2-section a2-platform-section" id="platform" aria-labelledby="a2-platform-title">
          <SectionHeading
            id="a2-platform-title"
            eyebrow="Satu platform · Banyak proses"
            title="Lebih sedikit fragmentasi. Lebih jelas arah perbaikan."
            description="AUREKA menyatukan proses pencatatan, pemeriksaan, analisis, dan peningkatan mutu dalam ruang kerja yang mengikuti peran serta tanggung jawab pengguna."
          />
          <div className="a2-domain-grid">
            <article className="a2-domain-card">
              <span className="a2-domain-icon"><Icon name="chart" size={22} /></span>
              <p className="a2-eyebrow">MEASUREMENT</p>
              <h3>Pengukuran dan audit mutu</h3>
              <p>Definisi indikator, periode pengukuran, numerator-denominator, hasil audit, dan status validasi dikelola secara terstruktur.</p>
            </article>
            <article className="a2-domain-card">
              <span className="a2-domain-icon a2-domain-blue"><Icon name="heart" size={22} /></span>
              <p className="a2-eyebrow">LEARNING</p>
              <h3>Keselamatan dan pembelajaran</h3>
              <p>Pelaporan insiden, investigasi, analisis akar masalah, rekomendasi, serta pembelajaran menjadi bagian dari siklus perbaikan.</p>
            </article>
            <article className="a2-domain-card">
              <span className="a2-domain-icon a2-domain-amber"><Icon name="risk" size={22} /></span>
              <p className="a2-eyebrow">GOVERNANCE</p>
              <h3>Risiko dan akuntabilitas</h3>
              <p>Risiko, pengendalian, penugasan tenaga klinis, dan pemantauan tindakan dapat dikelola dengan jejak yang jelas.</p>
            </article>
          </div>
        </section>

        <section className="a2-section a2-modules-section" id="modules" aria-labelledby="a2-modules-title">
          <SectionHeading
            id="a2-modules-title"
            eyebrow="Ruang kerja AUREKA"
            title="Tujuh area kerja dalam satu ekosistem"
            description="Setiap area memiliki fungsi khusus, tetapi tetap mengikuti identitas data, hak akses, dan pola interaksi yang konsisten."
          />
          <div className="a2-module-toolbar">
            <label className="a2-module-search">
              <Icon name="report" size={18} />
              <span className="a2-sr-only">Cari area kerja</span>
              <input type="search" value={moduleQuery} onChange={(event) => setModuleQuery(event.target.value)} placeholder="Cari modul, proses, atau kebutuhan Anda…" />
            </label>
            <span role="status" aria-live="polite">{visibleModules.length} area kerja</span>
          </div>
          <div className="a2-module-grid">
            {visibleModules.map((module) => (
              <article className="a2-module-card" key={module.number}>
                <div className="a2-module-top">
                  <span className="a2-module-icon"><Icon name={module.icon} size={21} /></span>
                  <span className="a2-module-number">{module.number}</span>
                </div>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
                <ul className="a2-module-tags">
                  {module.tags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
              </article>
            ))}
          </div>
          {visibleModules.length === 0 && <div className="a2-module-empty"><strong>Area kerja tidak ditemukan</strong><p>Coba kata kunci “mutu”, “risiko”, atau “tenaga”.</p><button type="button" className="a2-button a2-button-outline" onClick={() => setModuleQuery('')}>Tampilkan semua area</button></div>}
        </section>

        <section className="a2-capa-section" id="capa" aria-labelledby="a2-capa-title">
          <div className="a2-capa-copy">
            <p className="a2-eyebrow">CONTINUOUS IMPROVEMENT</p>
            <h2 id="a2-capa-title">Temuan tidak berhenti pada laporan.</h2>
            <p>
              CAPA dirancang sebagai jalur tindak lanjut lintas modul. Temuan dapat ditelusuri ke sumbernya,
              diberikan penanggung jawab, dipantau penyelesaiannya, lalu dinilai bukti dan efektivitasnya.
            </p>
            <div className="a2-capa-sources" aria-label="Sumber temuan CAPA">
              <span>Audit mutu</span><span>IKP / RCA</span><span>Manajemen risiko</span>
              <span>Clinical Pathway</span><span>OPPE / FPPE</span><span>FMEA</span>
            </div>
            <p className="a2-capa-note">CAPA merupakan arah pengembangan terintegrasi AUREKA 2.0; ketersediaan fungsi mengikuti tahapan implementasi dan validasi.</p>
          </div>
          <div className="a2-capa-flow">
            {improvementSteps.map((step, index) => (
              <article className="a2-capa-step" key={step.number}>
                <span className="a2-step-number">{step.number}</span>
                <div><strong>{step.title}</strong><p>{step.text}</p></div>
                {index < improvementSteps.length - 1 && <span className="a2-step-connector" aria-hidden="true" />}
              </article>
            ))}
          </div>
        </section>

        <section className="a2-section a2-workflow-section" id="workflow" aria-labelledby="a2-workflow-title">
          <SectionHeading
            id="a2-workflow-title"
            eyebrow="Alur kerja terstruktur"
            title="Dari pencatatan menuju peningkatan"
            description="Alur berikut menjadi pola kerja lintas modul. Detail validasi dan persetujuan tetap mengikuti aturan masing-masing domain."
          />
          <div className="a2-workflow-grid">
            {workSteps.map((step) => (
              <article className="a2-workflow-card" key={step.number}>
                <span className="a2-workflow-number">{step.number}</span>
                <span className="a2-workflow-icon">
                  <Icon name={step.number === '01' ? 'clipboard' : step.number === '02' ? 'check' : step.number === '03' ? 'chart' : 'workflow'} size={21} />
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="a2-section a2-governance-section" id="governance" aria-labelledby="a2-governance-title">
          <SectionHeading
            id="a2-governance-title"
            eyebrow="Keamanan dan tata kelola"
            title="Data dikelola dengan prinsip kehati-hatian"
            description="Arsitektur AUREKA memisahkan tampilan antarmuka dari kontrol akses serta proses penyimpanan pada backend."
          />
          <div className="a2-governance-panel">
            <article>
              <span><Icon name="lock" size={20} /></span>
              <h3>Autentikasi dan otorisasi</h3>
              <p>Supabase Auth, RLS, dan RPC menjadi lapisan backend untuk membatasi akses berdasarkan identitas, role, dan lingkup unit.</p>
            </article>
            <article>
              <span><Icon name="heart" size={20} /></span>
              <h3>Perlindungan informasi</h3>
              <p>Data individu dan narasi klinis tidak ditampilkan pada halaman publik. Informasi operasional hanya tersedia melalui alur yang berwenang.</p>
            </article>
            <article>
              <span><Icon name="clipboard" size={20} /></span>
              <h3>Jejak dan provenance</h3>
              <p>Data perlu ditelusuri ke sumber, periode, pelaku, status review, dan versi definisi atau aturan yang digunakan.</p>
            </article>
            <article>
              <span><Icon name="check" size={20} /></span>
              <h3>Validasi sebelum publikasi</h3>
              <p>Angka publik tidak ditampilkan sebelum snapshot agregat, definisi, periode, dan persetujuan publikasinya tervalidasi.</p>
            </article>
          </div>
        </section>

        <section className="a2-section a2-transparency-section" id="transparency" aria-labelledby="a2-transparency-title">
          <div className="a2-transparency-head">
            <SectionHeading
              id="a2-transparency-title"
              eyebrow="Transparansi publik"
              title="Informasi yang dapat dipublikasikan"
              description="AUREKA menyiapkan ruang transparansi untuk agregat mutu rumah sakit, tanpa membuka identitas pasien, narasi insiden, atau detail risiko yang bersifat sensitif."
            />
            <button
              type="button"
              className="a2-button a2-button-outline"
              aria-expanded={transparencyOpen}
              aria-controls="a2-transparency-panel"
              onClick={() => setTransparencyOpen((open) => !open)}
            >
              {transparencyOpen ? 'Tutup informasi' : 'Lihat informasi publik'}
              <Icon name="chevron" size={16} />
            </button>
          </div>

          {transparencyOpen && (
            <div className="a2-transparency-panel" id="a2-transparency-panel">
              <div className="a2-transparency-status">
                <span className="a2-status-icon"><Icon name="report" size={20} /></span>
                <div>
                  <strong>Snapshot publik belum tersedia</strong>
                  <p>Angka capaian belum ditampilkan karena kontrak data agregat dan persetujuan publikasi belum dinyatakan siap.</p>
                </div>
                <span className="a2-status-pill">Belum dipublikasikan</span>
              </div>
              <div className="a2-transparency-grid">
                <article><span>01 · MUTU KLINIS</span><h3>Indikator Nasional Mutu</h3><p>Capaian tingkat rumah sakit, target, periode pengukuran, dan tren setelah validasi.</p><small>Menunggu snapshot yang disetujui</small></article>
                <article><span>02 · KESELAMATAN PASIEN</span><h3>Laporan IKP menurut jenis</h3><p>Jumlah agregat laporan per jenis insiden, sesuai kebijakan publikasi dan ambang perlindungan informasi.</p><small>Menunggu snapshot yang disetujui</small></article>
                <article><span>03 · MANAJEMEN RISIKO</span><h3>Risiko aktif menurut kategori</h3><p>Jumlah agregat risiko aktif per kategori tanpa menampilkan skor, lokasi, atau uraian risiko individual.</p><small>Menunggu snapshot yang disetujui</small></article>
              </div>
              <p className="a2-transparency-footnote">Halaman ini tidak mengambil angka contoh atau mengubah metrik operasional menjadi informasi publik tanpa kontrak snapshot yang disetujui.</p>
            </div>
          )}
        </section>

        <section className="a2-faq-section" aria-labelledby="a2-faq-title">
          <div className="a2-faq-intro">
            <p className="a2-eyebrow">INFORMASI PENGGUNA</p>
            <h2 id="a2-faq-title">Pertanyaan yang sering diajukan</h2>
            <p>Informasi singkat bagi pengguna internal dan pengunjung halaman publik.</p>
          </div>
          <div className="a2-faq-list">
            <details>
              <summary>Siapa yang menggunakan AUREKA?</summary>
              <p>AUREKA ditujukan untuk proses kerja Komite PMKP, pengelola rumah sakit, validator, PIC unit, dan peran lain sesuai penetapan kewenangan.</p>
            </details>
            <details>
              <summary>Apakah halaman publik dapat membuka data pasien?</summary>
              <p>Tidak. Halaman publik hanya menyiapkan informasi institusional dan agregat yang secara khusus disetujui untuk dipublikasikan.</p>
            </details>
            <details>
              <summary>Bagaimana cara memperoleh akun?</summary>
              <p>Gunakan tautan pendaftaran yang tersedia pada form autentikasi. Aktivasi dan pemberian kewenangan tetap mengikuti proses administrasi Komite PMKP atau pengelola yang berwenang.</p>
            </details>
            <details>
              <summary>Apakah seluruh fitur sudah tersedia?</summary>
              <p>AUREKA dikembangkan bertahap. Status tiap modul dan fungsi mengikuti hasil implementasi, validasi, serta pengujian sebelum digunakan secara operasional.</p>
            </details>
          </div>
        </section>
      </div>


      <footer className="a2-footer">
        <div className="a2-container a2-footer-main">
          <div className="a2-footer-brand">
            <img src={logoSrc} width={384} height={323} alt="" aria-hidden="true" />
            <span><strong>AUREKA</strong><small>Hospital Quality Intelligence</small></span>
          </div>
          <p>UPT RSUD Sultan Syarif Mohamad Alkadrie<br />Komite Peningkatan Mutu dan Keselamatan Pasien</p>
          <a href="#top">Kembali ke atas ↑</a>
        </div>
        <div className="a2-container a2-footer-bottom">
          <span>Platform tata kelola mutu dan keselamatan pasien rumah sakit.</span>
          <span>Informasi publik mengikuti persetujuan dan kebijakan rumah sakit.</span>
        </div>
      </footer>
    </main>
  )
}
