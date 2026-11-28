import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('public INM and internal results share one dataset and one calculation engine',()=>{
 for(const p of ['components/QualityResultsWorkspace.tsx','lib/aureka/public-publication-source.ts']){
  const source=read(p);assert.match(source,/readIndicatorResultDataset/);assert.match(source,/calculateIndicatorResultsForProfiles/);assert.doesNotMatch(source,/normalizedResponseByKey/)
 }
 const loader=read('lib/aureka/quality-result-dataset.ts')
 assert.match(loader,/quality_record_responses/)
 assert.match(loader,/reviewByRecordProfile/)
 assert.match(loader,/eq\('status','validated'\)/)
 assert.match(loader,/ilike\('indicator_type', 'INM%'\)/)
})
