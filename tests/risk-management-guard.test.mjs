import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../components/RiskManagementWorkspace.tsx', import.meta.url), 'utf8')

test('risk deletion is disabled when a risk is referenced by FMEA or mitigation plans', () => {
  assert.match(source, /const hasRiskReferences = \(riskId: string\) =>/)
  assert.match(source, /fmeas\.some\(fmea => fmea\.risk_register_id === riskId\)/)
  assert.match(source, /planRisks\.some\(item => item\.risk_id === riskId\)/)
  assert.match(source, /const canDeleteRisk = \(risk: RiskRow\) => canEditRisk\(risk\) && !hasRiskReferences\(risk\.id\)/)
  assert.match(source, /disabled=\{!canDeleteRisk\(activeRisk\)\}/)
  assert.match(source, /Tidak dapat dihapus karena masih menjadi referensi FMEA atau rencana mitigasi/)
})
