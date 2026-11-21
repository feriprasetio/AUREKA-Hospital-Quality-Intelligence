import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

test('mobile viewport preserves user zoom while retaining responsive sizing', () => {
  const viewport = layout.match(/export const viewport: Viewport = \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.match(viewport, /width: 'device-width'/)
  assert.match(viewport, /initialScale: 1/)
  assert.doesNotMatch(viewport, /maximumScale\s*:/, 'do not artificially cap pinch-to-zoom')
  assert.doesNotMatch(viewport, /userScalable\s*:\s*false/, 'never disable browser zoom')
})
