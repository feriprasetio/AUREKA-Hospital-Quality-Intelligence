import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../supabase/functions/aureka-tanya/index.ts', import.meta.url), 'utf8')

function extractRegexLiterals(sourceText) {
  return [...sourceText.matchAll(/\\.replace\\((\\/(?:\\\\.|[^/])+\\/[a-z]*), ""\\)/g)]
    .map((match) => {
      const literal = match[1]
      const lastSlash = literal.lastIndexOf('/')
      return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1))
    })
}

test('NARA risk-matrix sanitizer recognizes literal opening and closing visual markers', () => {
  const regexes = extractRegexLiterals(source)
  const opening = regexes.find((regex) => regex.test('[[NARA_VISUAL]]{"chartType":"heatmap"}[[/NARA_VISUAL]]'))
  const closing = regexes.find((regex) => regex.test('[[/NARA_VISUAL]]'))

  assert.ok(opening, 'opening marker sanitizer must match [[NARA_VISUAL]] and its payload')
  assert.ok(closing, 'closing marker sanitizer must match [[/NARA_VISUAL]]')
  assert.equal('Safe answer [[NARA_VISUAL]]{"x":1}'.replace(opening, '').trim(), 'Safe answer')
  assert.equal('[[/NARA_VISUAL]]'.replace(closing, ''), '')
})

test('NARA risk-matrix sanitizer uses single escaped brackets, not backslash-prefixed markers', () => {
  assert.match(source, /\\.replace\\(\\/\\\\\\[\\\\\\[NARA_VISUAL\\\\\\]\\\\\\]\\[\\\\s\\\\S\\]\\*\\$\\/i/)
})
