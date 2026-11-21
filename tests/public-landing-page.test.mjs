import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const landing = read('components/PublicLandingPage.tsx')
const css = read('app/aureka-landing.css')
const homeClient = read('components/HomeClient.tsx')
const catalog = read('lib/aureka/national-indicators.ts')
const migration = read('supabase/migrations/20261122001000_aureka_public_intelligence_portal.sql')
const grants = read('supabase/migrations/20261122002000_aureka_public_portal_strict_grants.sql')

test('public portal provides a single intentional sign-in entry while registration remains in auth flow', () => {
  assert.equal(landing.match(/onClick=\{onLogin\}/g)?.length, 1)
  assert.match(landing, /Masuk Workspace/)
  assert.doesNotMatch(landing, /onSignup|Daftar akun unit/)
  assert.match(homeClient, /<PublicLandingPage[\s\S]*onLogin=/)
  assert.match(homeClient, /if\(view==='login'\|\|view==='signup'\)/)
})

test('public portal identifies the hospital and never displays fabricated patient-safety or INM figures', () => {
  assert.match(landing, /Hospital Quality Intelligence/)
  assert.match(landing, /RSUD Sultan Syarif Mohamad Alkadrie/)
  assert.match(landing, /NATIONAL_INDICATORS\.map/)
  assert.match(catalog, /Kepatuhan Kebersihan Tangan/)
  assert.match(landing, /Belum ada data terpublikasi/)
  assert.match(landing, /aureka_public_intelligence/)
  assert.doesNotMatch(landing, /demo-data|mockMetrics|publicMetrics|LandingProductPreview/)
  assert.doesNotMatch(landing, /Tur produk|Continuous improvement/)
})

test('guest portal is mobile-native-like and retains accessible theme and focus controls', () => {
  assert.match(landing, /<main className="aurekaPublic"/)
  assert.match(landing, /aria-label=\{mode==='gelap'\?'Ganti tema terang':'Ganti tema gelap'\}/)
  assert.match(landing, /useAurekaMode\(\)/)
  assert.match(landing, /setAurekaMode\(mode==='gelap'\?'terang':'gelap'\)/)
  assert.match(css, /\.aurekaPublic button:focus-visible/)
  assert.match(css, /@media\(max-width:640px\)/)
  assert.match(css, /\.aurekaPublicBottomNav\{/)
  assert.match(landing, /aria-label="Navigasi publik ponsel"/)
  assert.match(landing, /Lewati ke konten/)
})

test('certificate QR deep links open guest verification before workspace login', () => {
  assert.match(homeClient, /setPublicCertificateCode/)
  assert.match(homeClient, /#cert/)
  assert.match(homeClient, /if\(publicCertificateCode\)return <PublicLandingPage/)
  assert.match(landing, /aureka_verify_education_certificate/)
  assert.match(landing, /result\?\.status==='revoked'/)
  assert.match(landing, /result\?\.status==='not_ready'/)
  assert.match(landing, /Pemeriksaan belum tersedia/)
})

test('unauthenticated users can only call read-only public snapshot and certificate verification RPCs', () => {
  assert.match(migration, /create table if not exists aureka_system\.public_portal_snapshots/)
  assert.match(migration, /alter table aureka_system\.public_portal_snapshots enable row level security/)
  assert.match(migration, /v_actor=v_creator/)
  assert.match(grants, /revoke execute on function public\.aureka_stage_public_portal_snapshot\(text,text,jsonb\) from anon, public/)
  assert.match(grants, /revoke execute on function public\.aureka_approve_public_portal_snapshot\(uuid\) from anon, public/)
  assert.match(grants, /revoke execute on function public\.aureka_withdraw_public_portal_snapshot\(uuid\) from anon, public/)
})
