import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('animation layers load after visual theme and component styles', () => {
  const layout = read('app/layout.tsx')
  const imports = [...layout.matchAll(/import ['"]\.\/([^'"]+\.css)['"]/g)].map((match) => match[1])
  assert.ok(imports.indexOf('landing-motion.css') > imports.indexOf('modal.css'))
  assert.equal(imports.at(-1), 'motion.css', 'workspace motion layer must be the final stylesheet')
})

test('risk-matrix animation selectors are valid and cover staggered rows', () => {
  const css = read('app/motion.css')
  assert.doesNotMatch(css, /:is\.[A-Za-z_-]/, 'invalid :is selector syntax must not regress')
  for (const row of ['2', '3', '4', 'n\\+5']) {
    assert.match(css, new RegExp('\\.rmMatrixRow:nth-child\\(' + row + '\\)'))
  }
  assert.match(css, /:is\(\.rmMatrixCell, \.ovCell\)/)
})

test('motion respects operating-system reduced-motion preference', () => {
  const css = read('app/motion.css')
  const landing = read('app/landing-motion.css')
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/)
  assert.match(landing, /@media \(prefers-reduced-motion: no-preference\)/)
  assert.match(read('app/aureka-refined.css'), /@media \(prefers-reduced-motion: reduce\)/)
})
