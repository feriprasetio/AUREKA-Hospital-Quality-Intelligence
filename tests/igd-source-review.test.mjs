import test from 'node:test'
import assert from 'node:assert/strict'
import {
  igdSourceReviewKey, igdSourceCode, isIgdHeaderPlaceholder,
  summarizeIgdUnmatchedOptions, approvedIgdSourceChoice,
} from '../lib/aureka/igd-source-review.ts'

const options = [
  {label:'Pasien Pindah ke Ruangan ≤ 2 Jam',code:1},
  {label:'Menunggu > 2 Jam (Kapasitas Bed Rawat Inap Penuh/BOR 100%)',code:2},
  {label:'Menunggu > 2 Jam (Masalah Kesiapan Kamar/Cleaning Service Lambat/Admin)',code:3},
]

test('unmatched IGD responses are counted per indicator and distinct source wording', () => {
  const rows=[
    {rawIndicators:{'6.4':'Sudah pindah','6.6':'IGD Padat'},matchedIndicators:{'6.4':null,'6.6':null}},
    {rawIndicators:{'6.4':'Sudah pindah','6.6':'IGD Padat'},matchedIndicators:{'6.4':null,'6.6':null}},
    {rawIndicators:{'6.4':'Antrian Rawat Inap','6.6':''},matchedIndicators:{'6.4':null,'6.6':null}},
    {rawIndicators:{'6.4':'Pasien Pindah','6.6':''},matchedIndicators:{'6.4':options[0],'6.6':null}},
  ]
  const result=summarizeIgdUnmatchedOptions(rows)
  assert.equal(result.length,3)
  assert.deepEqual(result.slice(0,2).map(x=>[x.code,x.count]),[['6.4',2],['6.6',2]])
  assert.equal(result.find(x=>x.sourceValue==='Antrian Rawat Inap')?.placeholder,true)
  assert.equal(result.find(x=>x.sourceValue==='Sudah pindah')?.placeholder,false)
})
test('source-code metadata is never overwritten by a contradictory manual mapping',()=>{
  const choice={profileId:'profile-6.4',sourceValue:'Menunggu lama (Code 3)',
    optionLabel:options[2].label,optionCode:3}
  assert.equal(igdSourceCode('Menunggu lama (Code 3)'),3)
  assert.equal(approvedIgdSourceChoice('6.4','Menunggu lama (Code 3)','profile-6.4',options,choice)?.code,3)
  assert.equal(approvedIgdSourceChoice('6.4','Menunggu lama (Code 3)','profile-6.4',options,{...choice,optionCode:2}),null)
  assert.equal(approvedIgdSourceChoice('6.4','Menunggu lama (Code 3)','old-profile',options,choice),null)
  assert.equal(approvedIgdSourceChoice('6.4','Menunggu lama (Code 3)','profile-6.4',options,{...choice,sourceValue:'other'}),null)
  assert.equal(approvedIgdSourceChoice('6.4','Antrian Rawat Inap','profile-6.4',options,{...choice,sourceValue:'Antrian Rawat Inap'}),null)
  assert.equal(igdSourceReviewKey('6.4',' Sudah   pindah '),igdSourceReviewKey('6.4','sudah pindah'))
})
test('header placeholder is never interpreted as a clinical Code 1/2/3 response',()=>{
  assert.equal(isIgdHeaderPlaceholder('6.4','Antrian Rawat Inap'),true)
  assert.equal(isIgdHeaderPlaceholder('6.6','Overcrowding Index'),true)
  assert.equal(isIgdHeaderPlaceholder('6.6','Overcrowding Index (Code 1)'),true)
  assert.equal(isIgdHeaderPlaceholder('6.4','Pasien Pindah ke Ruangan ≤ 2 Jam'),false)
  assert.equal(isIgdHeaderPlaceholder('6.1','Antrian Rawat Inap'),false)
})
