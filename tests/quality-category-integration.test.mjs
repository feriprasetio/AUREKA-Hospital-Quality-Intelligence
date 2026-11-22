import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('category report is navigable without profile import or Supabase mutations',async()=>{
 const home=await readFile(new URL('../components/HomeClient.tsx',import.meta.url),'utf8')
 const reports=await readFile(new URL('../components/QualityResultsWorkspace.tsx',import.meta.url),'utf8')
 assert.match(home,/id:'result-category',label:'Hasil Capaian per Kategori'/)
 assert.match(home,/id:'result-unit',label:'Hasil Capaian per Unit'/)
 assert.match(reports,/QualityCategoryIntelligence/)
 assert.match(reports,/onAskNara/)
 assert.match(reports,/buildInmRows\(officialIndicatorResults/)
})
