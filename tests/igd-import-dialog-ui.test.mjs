import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../components/IgdExcelImportDialog.tsx', import.meta.url), 'utf8')

test('IGD import actions remain visible in the persistent dialog footer', () => {
  const footerIndex = source.indexOf('<div className="aqFoot">')
  assert.notEqual(footerIndex, -1, 'dialog footer must exist')

  const footer = source.slice(footerIndex)
  assert.match(footer, /activeImportTab === 'logbook' && mainRows\.length > 0 && !mainResult/)
  assert.match(footer, /onClick=\{\(\) => void importMain\(\)\}/)
  assert.match(footer, /Impor \$\{mainRows\.length\.toLocaleString\('id-ID'\)\} episode IGD/)
  assert.match(footer, /activeImportTab === 'consultation' && consultRows\.length > 0 && !consultResult/)
  assert.match(footer, /onClick=\{\(\) => void importConsultations\(\)\}/)
  assert.match(footer, /Impor \$\{consultRows\.length\.toLocaleString\('id-ID'\)\} sampel konsultasi/)
  assert.match(footer, /ciImportAction/)
})

test('IGD import panels do not duplicate the action or block it behind the preview table', () => {
  const footerIndex = source.indexOf('<div className="aqFoot">')
  const panels = source.slice(source.indexOf('id="ci-igd-logbook-panel"'), footerIndex)
  assert.doesNotMatch(panels, /className="aqBtn primary ciImportAction"/)
  assert.doesNotMatch(panels, /Impor ' \+ mainRows\.length/)
  assert.doesNotMatch(panels, /Impor ' \+ consultRows\.length/)
  assert.match(source, /\.aqIgdImport \.aqFoot\{flex:0 0 auto;position:relative;z-index:6/)
})
