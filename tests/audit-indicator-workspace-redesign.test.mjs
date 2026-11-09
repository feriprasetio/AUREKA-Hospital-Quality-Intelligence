import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Audit Indikator Mutu keeps its operational engine and adds a scoped balanced workspace skin', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /return <div className="aq aqAuditWorkspace">/)
  assert.match(source, /className="aq aqPortal aqAuditWorkspace"/)
  assert.match(source, /calculateInclusiveDurationDays|compareToTarget/)
  assert.match(source, /responseComplete\(/)
  assert.match(source, /const save=async\(\)=>/)
  assert.match(source, /openImportDialog\(/)
  assert.match(source, /archivePatient\(/)
  assert.match(source, /reviewRecord\(/)
  assert.match(source, /\.aqAuditWorkspace \.aqGrid\{grid-template-columns:minmax\(220px,1\.45fr\)/)
  assert.match(source, /\.aqAuditWorkspace \.aqComplaintKpi \.glass\{min-height:78px/)
  assert.match(source, /table\.aqData\{width:100%;min-width:1050px;table-layout:auto/)
})

test('Logbook editor remains an accessible centered modal with responsive internal scrolling', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /createPortal\(/)
  assert.match(source, /role="dialog" aria-modal="true"/)
  assert.match(source, /useAccessibleDialog<HTMLDivElement>\(\{open:patientOpen/)
  assert.match(source, /\.aqAuditWorkspace \.aqBack\.aqEditorBack\{align-items:center;justify-content:center/)
  assert.match(source, /\.aqAuditWorkspace \.aqEditorDialog\{[\s\S]*max-height:calc\(100dvh - 40px\)/)
  assert.match(source, /\.aqAuditWorkspace \.aqEditorDialog \.aqBody\{flex:1 1 auto;min-height:0;overflow:auto/)
})

test('Results tab retains the validated indicator calculation engine and balanced presentation', () => {
  const source = read('components/QualityResultsWorkspace.tsx')
  assert.match(source, /calculateIndicatorResult\(/)
  assert.match(source, /aggregateClinicalPathwayRows\(/)
  assert.match(source, /aggregateClinicalDeathAudits\(/)
  assert.match(source, /\.qraHero\{padding:14px 16px/)
  assert.match(source, /\.qraTable\{min-width:1080px/)
})


test('Every indicator uses the professional compact assessment UI without evidence or draft labels', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  const editorStart = source.indexOf('const indicatorEditor=')
  const editorEnd = source.indexOf('const reviewRecord=', editorStart)
  const editor = source.slice(editorStart, editorEnd)
  assert.ok(editorStart >= 0 && editorEnd > editorStart)
  assert.doesNotMatch(editor, /Bukti & catatan audit|Definisi operasional & rumus indikator|Pilih hasil sesuai Logbook|Nama master:/)
  assert.match(source, /<h5>Penilaian Indikator Mutu<\/h5>/)
  assert.match(source, /className="aqIndicatorMeta"/)
  assert.match(source, /className="aqField aqChoiceField"/)
  assert.match(source, /aqResultSummary/)
  assert.match(source, /review_required===true\|\|choice\.code==null/)
  assert.match(source, /Compact professional indicator assessment — shared by every unit/)
})
