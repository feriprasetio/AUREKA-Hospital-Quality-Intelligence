import test from 'node:test'
import assert from 'node:assert/strict'
import { nationalCode, safePublicPartition, buildPublicInm } from '../lib/aureka/public-publication-engine.ts'
import { NATIONAL_INDICATORS } from '../lib/aureka/national-indicators.ts'
test('INM alias uses national catalog',()=>{assert.equal(nationalCode('Kepatuhan Jam Visite Dokter Spesialis'),'KWVD');assert.equal(nationalCode('Waktu Lapor Hasil Tes Kritis Laboratorium'),'PHKL');assert.equal(nationalCode('unmapped'),undefined)})
test('small cells suppress entire partition',()=>{assert.deepEqual(safePublicPartition([{label:'a',count:1},{label:'b',count:12}]),[]);assert.deepEqual(safePublicPartition([{label:'a',count:0}]),[]);assert.equal(safePublicPartition([{label:'a',count:5}]).length,1)})
test('INM requires complete unique profile mapping and validated observations',()=>{
 const results=NATIONAL_INDICATORS.map(([code,title])=>({profile:{code,title,indicator_type:'INM Indikator Nasional Mutu',target_value:80,target_operator:'>='},continuous:false,monthly:[{month:1,validatedRecords:2,rate:90,numerator:9,denominator:10}]}))
 assert.equal(buildPublicInm(results,2026,1).indicators.length,13)
 assert.throws(()=>buildPublicInm(results.slice(1),2026,1),/Cakupan/)
 assert.throws(()=>buildPublicInm([...results,results[0]],2026,1),/ganda/)
 assert.throws(()=>buildPublicInm(results,2026,2),/Belum ada/)
})
