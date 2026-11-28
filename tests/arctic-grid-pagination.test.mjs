import test from 'node:test'
import assert from 'node:assert/strict'
import { GRID_PAGE_SIZES, normalizeGridPageSize, paginateGrid } from '../lib/aureka/grid-pagination.ts'
test('shared grid pagination is bounded and never mutates input',()=>{
 const rows=Object.freeze(Array.from({length:61},(_,i)=>i+1))
 for(const size of GRID_PAGE_SIZES) {
   const first=paginateGrid(rows,1,size)
   assert.equal(first.rows.length,Math.min(size,61))
   assert.equal(first.start,1)
   const last=paginateGrid(rows,999,size)
   assert.equal(last.end,61)
   assert.equal(last.current,last.pages)
 }
 assert.deepEqual(paginateGrid(rows,2,25).rows,rows.slice(25,50))
 assert.equal(rows.length,61)
})
test('empty, invalid and shrinking grids have stable ranges',()=>{
 assert.deepEqual(paginateGrid([],99,NaN),{rows:[],current:1,pages:1,start:0,end:0})
 assert.equal(normalizeGridPageSize(50000),25)
 assert.equal(normalizeGridPageSize(15,[25,50,100]),25)
 assert.equal(paginateGrid([1,2],-20,15).current,1)
 assert.equal(paginateGrid([1,2],NaN,15).end,2)
})
