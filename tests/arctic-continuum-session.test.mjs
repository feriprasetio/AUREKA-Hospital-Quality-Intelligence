import test from 'node:test'
import assert from 'node:assert/strict'
import { continuumScopeDigest, allowedContinuumPins, encodeContinuumSession, decodeContinuumSession, moveContinuumPin } from '../lib/aureka/continuum-session.ts'
const scope='a'.repeat(64),other='b'.repeat(64)
const canOpen=d=>d.module==='home'||d.module==='safety'
test('restore persists only allowed static route ids and scope fingerprint',()=>{
 const raw=encodeContinuumSession(scope,['home:','patient-123','safety:incidents','staff:directory','home:'],canOpen)
 assert.deepEqual(JSON.parse(raw),{version:1,scope,pins:['home:','safety:incidents']})
 assert.deepEqual(decodeContinuumSession(raw,scope,canOpen),['home:','safety:incidents'])
 assert.deepEqual(decodeContinuumSession(raw,scope,d=>d.module==='home'),['home:'])
 assert.equal(decodeContinuumSession(raw,other,canOpen),null)
 assert.equal(decodeContinuumSession('{"version":1,"scope":"'+scope+'","pins":[],"draft":"private"}',scope,canOpen),null)
 assert.equal(decodeContinuumSession('{',scope,canOpen),null)
 assert.equal(encodeContinuumSession('raw-user',[],canOpen),null)
})
test('scope digest changes with role/unit and contains no raw context',async()=>{
 const a=await continuumScopeDigest('synthetic-account|ADMIN|unit1')
 const b=await continuumScopeDigest('synthetic-account|PIC|unit2')
 assert.match(a,/^[0-9a-f]{64}$/)
 assert.notEqual(a,b)
})
test('pin reordering is bounded and preserves original list',()=>{
 const pins=Object.freeze(['home:','safety:incidents'])
 assert.deepEqual(moveContinuumPin(pins,'safety:incidents',-1),['safety:incidents','home:'])
 assert.deepEqual(moveContinuumPin(pins,'home:',-1),pins)
 assert.deepEqual(allowedContinuumPins(['invalid',...pins],canOpen),pins)
})
