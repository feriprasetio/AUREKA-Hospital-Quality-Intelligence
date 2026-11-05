'use client'

import { useState, type ReactNode } from 'react'

type LandingProps = {
  logoSrc: string
  onLogin: () => void
  onSignup: () => void
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
  { href: '#platform', label: 'Platform' },
  { href: '#modules', label: 'Modul' },
  { href: '#workflow', label: 'Alur kerja' },
  { href: '#capa', label: 'CAPA' },
  { href: '#governance', label: 'Tata kelola' },
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
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="a2-section-heading">
      <span className="a2-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

export default function PublicLandingPage({ logoSrc, onLogin, onSignup }: LandingProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [transparencyOpen, setTransparencyOpen] = useState(false)

  const openLogin = () => {
    setMobileOpen(false)
    onLogin()
  }

  const openSignup = () => {
    setMobileOpen(false)
    onSignup()
  }

  return (
    <main className="a2-landing" id="top">
      <a className="a2-skip-link" href="#main-content">Lewati ke konten utama</a>

      <header className="a2-header">
        <div className="a2-container a2-header-inner">
          <a className="a2-brand" href="#top" aria-label="AUREKA — kembali ke awal halaman">
            <span className="a2-brand-mark">
              <img src={logoSrc} alt="Logo UPT RSUD Sultan Syarif Mohamad Alkadrie" />
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
            <button type="button" className="a2-button a2-button-quiet" onClick={openLogin}>Masuk</button>
            <button type="button" className="a2-button a2-button-primary a2-button-compact" onClick={openSignup}>Daftar akun unit</button>
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
            <div className="a2-mobile-actions">
              <button type="button" className="a2-button a2-button-quiet" onClick={openLogin}>Masuk</button>
              <button type="button" className="a2-button a2-button-primary" onClick={openSignup}>Daftar akun unit</button>
            </div>
          </div>
        )}
      </header>

      <div className="a2-container">
        <section className="a2-hero" aria-labelledby="a2-hero-title">
          <div className="a2-hero-copy">
            <div className="a2-institution-chip">
              <span className="a2-chip-dot" />
              UPT RSUD Sultan Syarif Mohamad Alkadrie · Komite PMKP
            </div>
            <p className="a2-kicker">HOSPITAL QUALITY INTELLIGENCE PLATFORM</p>
            <h1 id="a2-hero-title">Mutu terukur.<br /><span>Keselamatan terjaga.</span></h1>
            <p className="a2-hero-description">
              Satu ekosistem kerja untuk menghubungkan pengukuran mutu, keselamatan pasien, manajemen risiko,
              tenaga klinis, analitik, dan tindak lanjut perbaikan rumah sakit.
            </p>
            <div className="a2-hero-actions">
              <button type="button" className="a2-button a2-button-primary a2-button-large" onClick={openLogin}>
                Masuk ke workspace <Icon name="arrow" size={17} />
              </button>
              <a className="a2-button a2-button-outline a2-button-large" href="#modules">
                Jelajahi modul <Icon name="chevron" size={16} />
              </a>
            </div>
            <div className="a2-hero-principles" aria-label="Prinsip platform">
              <span><Icon name="check" size={15} /> Alur kerja terstruktur</span>
              <span><Icon name="check" size={15} /> Akses sesuai kewenangan</span>
              <span><Icon name="check" size={15} /> Tindak lanjut terlacak</span>
            </div>
          </div>

          <aside className="a2-hero-preview" aria-label="Ilustrasi struktur workspace AUREKA">
            <div className="a2-preview-top">
              <div className="a2-preview-brand">
                <span className="a2-preview-logo">A</span>
                <span><strong>AUREKA Workspace</strong><small>Ilustrasi struktur platform</small></span>
              </div>
              <span className="a2-preview-pill">ROLE BASED</span>
            </div>
            <div className="a2-preview-heading">
              <span>AREA KERJA TERINTEGRASI</span>
              <strong>Satu alur, lintas fungsi</strong>
            </div>
            <div className="a2-preview-list">
              <div className="a2-preview-row">
                <span className="a2-preview-icon"><Icon name="chart" size={19} /></span>
                <span><strong>Mutu Klinis</strong><small>Pengukuran · Audit · Clinical Pathway</small></span>
                <Icon name="arrow" size={16} />
              </div>
              <div className="a2-preview-row">
                <span className="a2-preview-icon a2-preview-blue"><Icon name="shield" size={19} /></span>
                <span><strong>Keselamatan Pasien</strong><small>Pelaporan · Investigasi · Pembelajaran</small></span>
                <Icon name="arrow" size={16} />
              </div>
              <div className="a2-preview-row">
                <span className="a2-preview-icon a2-preview-amber"><Icon name="risk" size={19} /></span>
                <span><strong>Manajemen Risiko</strong><small>Register · Pengendalian · Eskalasi</small></span>
                <Icon name="arrow" size={16} />
              </div>
              <div className="a2-preview-row">
                <span className="a2-preview-icon a2-preview-violet"><Icon name="people" size={19} /></span>
                <span><strong>Tenaga Klinis</strong><small>Direktori · Penugasan · Evaluasi</small></span>
                <Icon name="arrow" size={16} />
              </div>
            </div>
            <div className="a2-preview-foot">
              <span><Icon name="lock" size={14} /> Modul operasional tersedia setelah autentikasi</span>
            </div>
            <p className="a2-preview-disclaimer">Ilustrasi antarmuka; bukan tampilan atau capaian data aktual.</p>
          </aside>
        </section>

        <section className="a2-principle-strip" aria-label="Prinsip pengelolaan AUREKA">
          <div><Icon name="network" size={19} /><span><strong>Terintegrasi</strong><small>Antarmodul saling terhubung</small></span></div>
          <div><Icon name="shield" size={19} /><span><strong>Berbasis kewenangan</strong><small>Akses mengikuti role dan unit</small></span></div>
          <div><Icon name="clipboard" size={19} /><span><strong>Terketertelusuran</strong><small>Aktivitas dan tindak lanjut tercatat</small></span></div>
        </section>

        <section className="a2-section a2-platform-section" id="platform" aria-labelledby="a2-platform-title">
          <SectionHeading
            eyebrow="Satu platform · Banyak proses"
            title="Menghubungkan tata kelola mutu rumah sakit"
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
            eyebrow="Ruang kerja AUREKA"
            title="Tujuh area kerja dalam satu ekosistem"
            description="Setiap area memiliki fungsi khusus, tetapi tetap mengikuti identitas data, hak akses, dan pola interaksi yang konsisten."
          />
          <div className="a2-module-grid">
            {modules.map((module) => (
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
              <p>Gunakan tombol Daftar akun unit. Aktivasi dan pemberian kewenangan tetap mengikuti proses administrasi Komite PMKP atau pengelola yang berwenang.</p>
            </details>
            <details>
              <summary>Apakah seluruh fitur sudah tersedia?</summary>
              <p>AUREKA dikembangkan bertahap. Status tiap modul dan fungsi mengikuti hasil implementasi, validasi, serta pengujian sebelum digunakan secara operasional.</p>
            </details>
          </div>
        </section>
      </div>

      <section className="a2-final-cta" aria-labelledby="a2-final-cta-title">
        <div className="a2-container a2-final-cta-inner">
          <div>
            <p className="a2-eyebrow">AUREKA · UPT RSUD SSMA</p>
            <h2 id="a2-final-cta-title">Bangun perbaikan mutu dalam satu alur kerja.</h2>
            <p>Masuk ke workspace untuk melanjutkan tugas sesuai akun dan kewenangan Anda.</p>
          </div>
          <button type="button" className="a2-button a2-button-white" onClick={openLogin}>
            Masuk ke AUREKA <Icon name="arrow" size={17} />
          </button>
        </div>
      </section>

      <footer className="a2-footer">
        <div className="a2-container a2-footer-main">
          <div className="a2-footer-brand">
            <img src={logoSrc} alt="" aria-hidden="true" />
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
