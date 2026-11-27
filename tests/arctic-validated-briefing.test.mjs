import test from 'node:test'
import assert from 'node:assert/strict'
import {buildValidatedIndicatorBriefing} from '../lib/aureka/validated-indicator-briefing.ts'
import {readFileSync} from 'node:fs'
test('briefing counts existing assessed profiles, never averages percentages or converts missing to zero',()=>{
 assert.deepEqual(buildValidatedIndicatorBriefing([{observations:4,targetMet:true},{observations:2,targetMet:false},{observations:0,targetMet:null},{observations:3,targetMet:null}]),{active:4,observed:3,assessed:2,met:1,below:1,unassessed:2})
 assert.deepEqual(buildValidatedIndicatorBriefing([]),{active:0,observed:0,assessed:0,met:0,below:0,unassessed:0})
 assert.equal(buildValidatedIndicatorBriefing([{observations:0,targetMet:true}]).assessed,0)
})
test('briefing uses existing validated engine and resets for scope changes; certificate resets when code changes',()=>{
 const q=readFileSync(new URL('../components/QualityResultsWorkspace.tsx',import.meta.url),'utf8')
 assert.match(q,/ValidatedIndicatorBriefing key=\{scope\} results=\{officialIndicatorResults\}/)
 const p=readFileSync(new URL('../components/PublicLandingPage.tsx',import.meta.url),'utf8')
 assert.match(p,/CertificateVerification key=\{verificationCode\}/)
})
