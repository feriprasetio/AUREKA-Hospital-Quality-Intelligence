import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const component = read('components/PublicLandingPage.tsx')
const stylesheet = read('app/public-landing-auth-redesign.css')
const homeClient = read('components/HomeClient.tsx')

test('public entry provides one sign-in action and registration remains available in the form', () => {
  assert.equal(component.match(/onClick=\{onLogin\}/g)?.length, 1)
  assert.match(component, /className="aurekaEntryAction"[\s\S]*?Masuk/)
  assert.doesNotMatch(component, /onSignup|Daftar akun unit/)
  assert.match(homeClient, /<PublicLandingPage[\s\S]*onLogin=/)
  assert.match(homeClient, /if\(view==='login'\|\|view==='signup'\)/)
  assert.match(homeClient, /setView\(l\?'signup':'login'\)/)
})

test('public entry keeps the official identity and removes tours, walkthroughs and sample data', () => {
  assert.match(component, /<h1>AUREKA<\/h1>/)
  assert.match(component, /Hospital Quality Intelligence/)
  assert.match(component, /RSUD Sultan Syarif Mohamad Alkadrie/)
  assert.doesNotMatch(component, /LandingProductPreview|transparencyOpen|demo-data|publicMetrics|useSupabase/)
  assert.doesNotMatch(component, /Tur produk|Jelajahi modul|Continuous improvement/)
})

test('entry adapts to small screens with labeled theme control and visible focus', () => {
  assert.match(component, /<main className="aurekaEntry">/)
  assert.match(component, /aria-label=\{mode === 'gelap' \? 'Ganti ke tema terang' : 'Ganti ke tema gelap'\}/)
  assert.match(component, /useAurekaMode\(\)/)
  assert.match(component, /setAurekaMode\(mode === 'gelap' \? 'terang' : 'gelap'\)/)
  assert.match(stylesheet, /\.aurekaEntryAction:focus-visible/)
  assert.match(stylesheet, /@media \(max-width: \d+px\)[\s\S]*?\.aurekaEntryCard \{ grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(stylesheet, /var\(--aureka-color-foreground-secondary\)/)
  assert.match(component, /className="aurekaEntryImage" aria-hidden="true"/)
  assert.match(component, /basePath \+ '\/images\/architecture-joel-filipe\.jpg'/)
  assert.ok(existsSync(new URL('../public/images/architecture-joel-filipe.jpg', import.meta.url)))
})
