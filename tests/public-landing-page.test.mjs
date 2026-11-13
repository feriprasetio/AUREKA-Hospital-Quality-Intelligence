import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const component = readFileSync(new URL('../components/PublicLandingPage.tsx', import.meta.url), 'utf8')
const stylesheet = readFileSync(new URL('../app/aureka-landing.css', import.meta.url), 'utf8')
const homeClient = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')

test('landing page exposes the seven registered AUREKA work areas', () => {
  for (const label of ['Ringkasan', 'Mutu Klinis', 'Keselamatan Pasien', 'Manajemen Risiko', 'Tenaga Klinis', 'Analitik & Laporan', 'Administrasi']) {
    assert.ok(component.includes(label), `Missing landing area: ${label}`)
  }
})

test('landing page exposes one workspace login action and keeps registration inside the login form', () => {
  assert.match(component, /onLogin: \(\) => void/)
  assert.match(component, /Masuk Workspace/)
  assert.match(component, /onClick=\{openLogin\}/)
  assert.doesNotMatch(component, /onSignup|openSignup|Daftar akun unit|Jelajahi modul|Masuk ke workspace/)
  assert.match(homeClient, /<PublicLandingPage[\s\S]*onLogin=/)
  assert.doesNotMatch(homeClient.slice(homeClient.lastIndexOf(' return <PublicLandingPage')), /onSignup=/)
  assert.match(homeClient, /if\(view==='login'\|\|view==='signup'\)/)
  assert.match(homeClient, /authSwitch/)
  assert.match(homeClient, /setView\(l\?'signup':'login'\)/)
})

test('hero uses the approved Alkadrie unification headline and compact focus chips', () => {
  assert.match(component, /Alkadrie[\s\S]*Unifikasi Risiko,[\s\S]*Evaluasi Kualitas,[\s\S]*dan Asesmen/)
  assert.match(component, /Evaluasi kualitas/)
  assert.match(component, /Keselamatan pasien/)
  assert.match(component, /Unifikasi risiko/)
  assert.doesNotMatch(component, /Mutu terukur|Keselamatan terjaga/)
})

test('right-side product tour explains real workflows without fabricated metrics', () => {
  const preview = readFileSync(new URL('../components/LandingProductPreview.tsx', import.meta.url), 'utf8')
  assert.match(component, /<LandingProductPreview \/>/)
  assert.match(component, /Tur produk interaktif AUREKA/)
  for (const workflow of ['Audit indikator mutu', 'Investigasi / RCA', 'Risk Register', 'Rencana pengendalian']) {
    assert.ok(preview.includes(workflow), `Missing workflow: ${workflow}`)
  }
  assert.match(preview, /Bukan data operasional/)
  assert.match(preview, /role="tablist"/)
  assert.match(preview, /role="tabpanel"/)
  assert.match(preview, /ArrowRight/)
  assert.match(preview, /ArrowLeft/)
  assert.match(preview, /hidden=\{selected !== index\}/)
  assert.doesNotMatch(preview, /\b\d+[.,]\d+\s*%|\.from\(|\.rpc\(/)
})

test('landing page keeps a single primary workspace CTA in the top navigation', () => {
  assert.match(component, /a2-header-actions/)
  assert.match(component, /Masuk Workspace/)
  assert.doesNotMatch(component, /a2-hero-actions|a2-final-cta|a2-mobile-actions/)
  assert.doesNotMatch(component, /Daftar akun unit/)
})

test('public transparency never invents operational values', () => {
  assert.match(component, /Snapshot publik belum tersedia/)
  assert.match(component, /Menunggu snapshot yang disetujui/)
  assert.doesNotMatch(component, /from ['"][^'"]*demo-data/)
  assert.doesNotMatch(component, /publicMetrics|achievementTrend|moduleScores|incidents\s*=/)
  assert.match(component, /tidak mengambil angka contoh/)
})

test('landing page contains integrated CAPA and workflow explanations', () => {
  assert.match(component, /Continuous improvement/)
  assert.match(component, /Temuan tidak berhenti pada laporan/)
  assert.match(component, /Verifikasi efektivitas/)
  assert.match(component, /Dari pencatatan menuju peningkatan/)
})

test('landing page provides responsive and accessible navigation patterns', () => {
  assert.match(component, /aria-expanded=\{mobileOpen\}/)
  assert.match(component, /aria-controls="a2-mobile-navigation"/)
  assert.match(component, /Lewati ke konten utama/)
  assert.match(stylesheet, /@media \(max-width: 640px\)/)
  assert.match(stylesheet, /prefers-reduced-motion/)
  assert.match(stylesheet, /:focus-visible/)
})

test('landing styles are isolated from authenticated workspace selectors', () => {
  assert.match(stylesheet, /\.a2-landing/)
  assert.doesNotMatch(stylesheet, /\.workspaceRoot/)
})

test('all aria-labelledby targets and the skip-link destination exist', () => {
  for (const id of [
    'main-content',
    'a2-hero-title',
    'a2-platform-title',
    'a2-modules-title',
    'a2-capa-title',
    'a2-workflow-title',
    'a2-governance-title',
    'a2-transparency-title',
    'a2-faq-title',
  ]) {
    assert.ok(component.includes(`id="${id}"`) || component.includes(`id={"${id}"}`), `Missing target id: ${id}`)
  }
  assert.match(component, /href="#main-content"/)
  assert.match(component, /aria-labelledby="a2-platform-title"/)
  assert.match(component, /aria-labelledby="a2-modules-title"/)
  assert.match(component, /aria-labelledby="a2-workflow-title"/)
  assert.match(component, /aria-labelledby="a2-governance-title"/)
  assert.match(component, /aria-labelledby="a2-transparency-title"/)
})
