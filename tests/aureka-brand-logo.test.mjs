import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homeClient = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
const landing = readFileSync(new URL('../components/PublicLandingPage.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../app/aureka-brand.css', import.meta.url), 'utf8')
const logo = readFileSync(new URL('../public/logo-aureka.png', import.meta.url))

test('one optimized transparent AUREKA logo is used on landing, auth and workspace surfaces', () => {
  assert.match(homeClient, /const LOGO=\x60\$\{BASE_PATH\}\/logo-aureka\.png\x60/)
  assert.doesNotMatch(homeClient, /logo-aureka\.jpg/)
  assert.match(homeClient, /width=\{384\} height=\{323\}/)
  assert.match(landing, /width=\{384\} height=\{323\}/)
  assert.match(layout, /import '\.\/aureka-brand\.css'/)
  assert.match(styles, /background:\s*transparent\s*!important/)
  assert.match(styles, /object-fit:\s*contain\s*!important/)
  assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(logo.readUInt32BE(16), 384)
  assert.equal(logo.readUInt32BE(20), 323)
  assert.equal(logo[25], 3, 'PNG must use indexed color')
  assert.ok(logo.includes(Buffer.from('tRNS')), 'PNG must preserve transparency')
})

test('old JPEG logo is removed from the deployed public assets', () => {
  assert.throws(() => readFileSync(new URL('../public/logo-aureka.jpg', import.meta.url)), { code: 'ENOENT' })
})
