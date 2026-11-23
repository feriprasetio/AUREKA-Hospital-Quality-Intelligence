import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

function luminance(hex) {
  const values = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
    .map(x => x <= .04045 ? x / 12.92 : ((x+.055)/1.055) ** 2.4)
  return values[0]*.2126 + values[1]*.7152 + values[2]*.0722
}
function contrast(x,y) {
  const a=luminance(x),b=luminance(y)
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)
}

test('Workbook baku unit uses an element-level important contrast fallback', () => {
  const src=read('components/QualityIndicatorWorkspace.tsx')
  const index=src.indexOf('function enforceImportChoiceContrast(button: HTMLButtonElement | null): void')
  assert.ok(index>0)
  const fn=src.slice(index,src.indexOf('const CSS=',index))
  for(const required of [
    "'background': '#0b467a'","'border-color': '#0b467a'",
    "'color': '#ffffff'","'-webkit-text-fill-color': '#ffffff'",
    "button.style.setProperty(property, value, 'important')",
  ]) assert.ok(fn.includes(required),required)
  const choice=src.indexOf('Workbook baku unit</button>')
  assert.ok(choice>index)
  const jsx=src.slice(choice-420,choice+22)
  assert.ok(jsx.includes('className="aqBtn primary aqImportChoicePrimary"'))
  assert.ok(jsx.includes('ref={enforceImportChoiceContrast}'))
  assert.ok(contrast('#ffffff','#0b467a')>=7)
  assert.ok(contrast('#253543','#0b467a')<2)
})

test('modal CSS carries independent narrow fallback for the same choice', () => {
  const css=read('app/modal.css')
  assert.ok(css.includes('.akModalRoot .akModal .aqWorkbookChoices > button.aqBtn.primary.aqImportChoicePrimary'))
  assert.ok(css.includes('-webkit-text-fill-color: #ffffff !important'))
  assert.ok(css.includes('background: #0b467a !important'))
  assert.ok(css.includes(':is(:hover,:focus-visible,:active)'))
  const guard=read('app/aureka-contrast-guardrails.css')
  assert.ok(guard.includes('--aureka-action-fg: #ffffff'))
})

test('static export verification is mandatory for every Next production build', () => {
  const pkg=JSON.parse(read('package.json'))
  assert.match(pkg.scripts.build,/next build && node scripts\/verify-import-contrast-export.mjs/)
  const script=read('scripts/verify-import-contrast-export.mjs')
  for(const term of [
    "'aqImportChoicePrimary'","'--aureka-action-fg'","'aqWorkbookChoices'",
    "'Workbook baku unit'",
  ]) assert.ok(script.includes(term))
})
