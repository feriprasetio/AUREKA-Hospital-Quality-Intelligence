import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../supabase/functions/aureka-tanya/index.ts', import.meta.url), 'utf8')

test('NARA risk-matrix sanitizer contains the correct literal opening and closing marker patterns', () => {
  const openingLine = String.raw`    .replace(/\[\[NARA_VISUAL\]\][\s\S]*$/i, "")`
  const closingLine = String.raw`    .replace(/\[\[\/NARA_VISUAL\]\]/gi, "")`
  assert.ok(source.includes(openingLine), 'opening marker regex must match [[NARA_VISUAL]] literally')
  assert.ok(source.includes(closingLine), 'closing marker regex must match [[/NARA_VISUAL]] literally')

  const opening = new RegExp(String.raw`\[\[NARA_VISUAL\]\][\s\S]*$`, 'i')
  const closing = new RegExp(String.raw`\[\[\/NARA_VISUAL\]\]`, 'gi')
  const rawVisualAnswer = 'Safe answer [[NARA_VISUAL]]{"chartType":"heatmap"}[[/NARA_VISUAL]]'
  assert.equal(rawVisualAnswer.replace(opening, '').trim(), 'Safe answer')
  assert.equal('[[/NARA_VISUAL]]'.replace(closing, ''), '')
})
