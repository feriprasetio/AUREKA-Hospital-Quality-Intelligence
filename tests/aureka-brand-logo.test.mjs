import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homeClient = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
const landing = readFileSync(new URL('../components/PublicLandingPage.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../app/aureka-brand.css', import.meta.url), 'utf8')
const logo = readFileSync(new URL('../public/logo-aureka-v2.png', import.meta.url))

test('the RGBA 3D AUREKA artwork is used across landing, authentication, and workspace', () => {
  assert.match(homeClient, /const LOGO=\x60\$\{BASE_PATH\}\/logo-aureka-v2\.png\x60/)
  assert.match(homeClient, /width=\{160\} height=\{136\}/)
  assert.doesNotMatch(homeClient, /brandLogoFallback/)
  assert.match(landing, /width=\{160\} height=\{136\}/)
  assert.match(layout, /import '\.\/aureka-brand\.css'/)
  assert.match(styles, /\.workspaceRoot \.sideBrand \.workspaceLogo[\s\S]*?background:\s*transparent\s*!important/)
  assert.match(styles, /object-fit:\s*contain\s*!important/)
  assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(logo.readUInt32BE(16), 160)
  assert.equal(logo.readUInt32BE(20), 136)
  assert.equal(logo[25], 6, 'PNG must use standard truecolor RGBA')
  assert.ok(!logo.includes(Buffer.from('tRNS')), 'RGBA transparency does not depend on palette transparency')
})

test('obsolete logo assets are removed so browsers cannot resolve a stale file', () => {
  for (const name of ['logo-aureka.jpg', 'logo-aureka.png']) {
    assert.throws(() => readFileSync(new URL('../public/' + name, import.meta.url)), { code: 'ENOENT' })
  }
})
