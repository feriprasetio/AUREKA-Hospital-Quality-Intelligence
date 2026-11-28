import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveVisibleRiskRelations} from '../lib/aureka/visible-risk-relations.ts'
const rows=Object.freeze([{id:'a',name:'A'},{id:'b',name:'B'}])
const edge=(id,source_risk_id,target_risk_id)=>({id,source_risk_id,target_risk_id,relationship_type:'shared_control',created_at:'2026-11-28'})
test('only visible endpoints and stored edges are resolved',()=>{
 const edges=[edge('1','a','b'),edge('2','hidden','a'),edge('3','a','a'),edge('4','b','a')]
 const resolved=resolveVisibleRiskRelations(rows,edges,'a')
 assert.deepEqual(resolved.map(x=>[x.edge.id,x.other.id,x.direction]),[['1','b','outgoing'],['4','b','incoming']])
 assert.equal(JSON.stringify(resolved).includes('hidden'),false)
 assert.deepEqual(resolveVisibleRiskRelations(rows,edges,'hidden'),[])
 assert.deepEqual(resolveVisibleRiskRelations([rows[0]],edges,'a'),[])
})
