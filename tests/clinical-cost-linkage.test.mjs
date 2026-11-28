import test from 'node:test'
import assert from 'node:assert/strict'
import {parseClinicalCostLinkage} from '../lib/aureka/clinical-cost-linkage.ts'
const fixture={import_id:'test',method:'mrn_normalized_admission_discharge_unique_candidate_v1',episodes:2,states:[{state:'ambiguous',count:1},{state:'unique_unvalidated_candidate',count:1}],cohorts:[],minimum_cohort:5,cohort_limit:100}
test('clinical cost linkage reconciles counts and rejects wrong import',()=>{assert.equal(parseClinicalCostLinkage(fixture,'test').episodes,2);assert.throws(()=>parseClinicalCostLinkage(fixture,'other'));assert.throws(()=>parseClinicalCostLinkage({...fixture,episodes:3},'test'));assert.throws(()=>parseClinicalCostLinkage({...fixture,states:[...fixture.states,fixture.states[0]]},'test'))})
test('clinical cost linkage rejects small cohort and never assigns it to unmatched records',()=>{const c={template_code:'T',inacbg_code:'X',class_code:'1',n:1,mean_tarif_rs:10,mean_tariff_inacbg:9,mean_gap:1,mean_los:3,tarif_n:1,ina_n:1,los_n:1};assert.throws(()=>parseClinicalCostLinkage({...fixture,cohorts:[c]},'test'));assert.throws(()=>parseClinicalCostLinkage({...fixture,cohorts:[{...c,n:5}]},'test'))})
