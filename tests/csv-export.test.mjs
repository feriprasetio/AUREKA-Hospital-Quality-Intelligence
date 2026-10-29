import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCsv, escapeSpreadsheetCell } from '../lib/aureka/csv-export.ts'

test('neutralizes spreadsheet formula prefixes in text cells', () => {
  for (const value of ['=1+1', '+cmd|x', '-2+3', '@SUM(A1:A2)', '  =HYPERLINK("x")', '\t=1+1']) {
    const escaped = escapeSpreadsheetCell(value)
    // A field containing a comma or quote is wrapped in CSV quotes; inspect the decoded field.
    const decoded = escaped.startsWith('"')
      ? escaped.slice(1, -1).replace(/""/g, '"')
      : escaped
    assert.equal(decoded.startsWith("'"), true, String(value))
  }
})

test('preserves native numeric cells and correctly quotes CSV delimiters', () => {
  assert.equal(escapeSpreadsheetCell(-12), '-12')
  assert.equal(escapeSpreadsheetCell('A; "B"'), '"A; ""B"""')
})

test('builds semicolon-delimited UTF-8 CSV with a BOM and formula-safe cells', () => {
  const csv = buildCsv([{ title: '=2+2', count: 3 }], ['title', 'count'])
  assert.equal(csv.charCodeAt(0), 0xFEFF)
  assert.equal(csv.includes("'=2+2;3"), true)
})
