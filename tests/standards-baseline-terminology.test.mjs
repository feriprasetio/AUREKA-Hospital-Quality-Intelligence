import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const component = readFileSync(new URL('../components/ClinicalPathwayWorkspace.tsx', import.meta.url), 'utf8')
const risk = readFileSync(new URL('../components/RiskManagementWorkspace.tsx', import.meta.url), 'utf8')
const safety = readFileSync(new URL('../components/PatientSafetyWorkspace.tsx', import.meta.url), 'utf8')

test('Clinical Pathway labels episode checklist metrics separately from official INM', () => {
  assert.match(component, /Keterisian jadwal CP \(internal\)/)
  assert.match(component, /Kepatuhan item CP per episode \(internal\)/)
  assert.match(component, /INM Kepatuhan terhadap Alur Klinis/)
  assert.match(component, /bukan pembilang\/penyebut INM/i)
})

test('FMEA is identified as preventive and is not presented as reactive incident investigation', () => {
  assert.match(risk, /FMEA Preventif/)
  assert.match(risk, /bukan metode investigasi pascainsiden/i)
  assert.match(risk, /bukan batas universal IHI/i)
  assert.match(safety, /Investigasi Pascainsiden \/ RCA2/)
  assert.match(safety, /Hierarki kekuatan tindakan/)
  assert.match(safety, /verifikasi efektivitas/)
})
