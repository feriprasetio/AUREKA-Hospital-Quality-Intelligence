import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homeClient = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
const authStyles = readFileSync(new URL('../app/public-landing-auth-redesign.css', import.meta.url), 'utf8')

const loginStart = homeClient.indexOf("if(view==='login'||view==='signup')")
const workspaceStart = homeClient.indexOf("if(view==='workspace')return", loginStart)
const authScreen = homeClient.slice(loginStart, workspaceStart)

test('login and registration use the professional AUREKA authentication shell', () => {
  assert.ok(loginStart >= 0, 'Missing login/signup rendering branch')
  assert.ok(workspaceStart > loginStart, 'Missing workspace boundary')
  assert.match(authScreen, /className="authArctic"/)
  assert.match(authScreen, /authArcticTopbarActions/)
  assert.doesNotMatch(authScreen, /authAsideEyebrow|authAsideSignals/)
  assert.match(authScreen, /authArcticFormIntro/)
  assert.match(authStyles, /\.authArctic/)
})

test('login keeps username/email, password, password visibility and recovery actions', () => {
  assert.match(authScreen, /htmlFor="email"/)
  assert.match(authScreen, /Username atau email/)
  assert.match(authScreen, /autoComplete=\{l\?'username':'email'\}/)
  assert.match(authScreen, /autoComplete=\{l\?'current-password':'new-password'\}/)
  assert.match(authScreen, /setShowPw\(v=>!v\)/)
  assert.match(authScreen, /Lupa password\?/)
  assert.match(authScreen, /setAuthMode\('forgot'\)/)
  assert.match(authScreen, /Kirim ulang email verifikasi/)
})

test('unit registration remains available within the authentication form', () => {
  assert.match(authScreen, /Daftar akun unit/)
  assert.match(authScreen, /htmlFor="fullName"/)
  assert.match(authScreen, /htmlFor="signupRoom"/)
  assert.match(authScreen, /htmlFor="username"/)
  assert.match(authScreen, /Email aktif/)
  assert.match(authScreen, /l\?'signup':'login'/)
  assert.match(authScreen, /l\?login\(\):signup\(\)/)
})

test('authentication feedback and first-login password protection remain present', () => {
  assert.match(authScreen, /authInfo/)
  assert.match(authScreen, /role="status"/)
  assert.match(authScreen, /role="alert"/)
  assert.match(homeClient, /view==='force-password'/)
  assert.match(homeClient, /saveFirstPassword\(\)/)
  assert.match(homeClient, /setView\('force-password'\)/)
})

test('forgot-password, recovery and reset-success states remain present', () => {
  assert.match(homeClient, /authMode!=='normal'/)
  assert.match(homeClient, /saveNewPassword\(\)/)
  assert.match(homeClient, /sendReset\(\)/)
  assert.match(homeClient, /Kirim tautan reset/)
  assert.match(homeClient, /Cek email Anda/)
})

test('login shell avoids duplicate branding and keeps the return link in document flow', () => {
  assert.doesNotMatch(authScreen, /authAsideBrand/)
  assert.match(authStyles, /\.authArctic \.authArcticBack\s*\{\s*position: static/)
  assert.match(authStyles, /\.authArctic \.authArcticTopbar,\s*\.authArctic \.authArcticShell\s*\{\s*width: min\(1080px, 100%\)/)
  assert.match(authStyles, /\.authArctic \.authArcticTopbar\s*\{\s*position: static/)
})

test('browser autofill retains AUREKA neutral input styling', () => {
  assert.match(authStyles, /input:-webkit-autofill/)
  assert.match(authStyles, /-webkit-text-fill-color: var\(--auth-ink\)/)
  assert.match(authStyles, /0 0 0 1000px var\(--auth-control\) inset/)
})

test('professional auth styles provide responsive layouts and visible keyboard focus', () => {
  assert.match(authStyles, /\.authArctic \.authArcticShell/)
  assert.match(authStyles, /@media \(max-width: 780px\)/)
  assert.match(authStyles, /@media \(max-width: 420px\)/)
  assert.match(authStyles, /:focus-visible/)
  assert.match(authStyles, /prefers-reduced-motion/)
  assert.match(authStyles, /\.authArctic \.authArcticCard/)
})
