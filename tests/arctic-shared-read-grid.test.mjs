import test from 'node:test'
import assert from 'node:assert/strict'
import {readGridRows,readGridPage} from '../lib/aureka/read-grid.ts'
const cols=[{id:'name',label:'Nama',value:r=>r.name},{id:'count',label:'Jumlah',value:r=>r.count}]
test('all loaded rows are searched and sorted before paging; null last in either direction',()=>{
 const rows=Array.from({length:61},(_,i)=>({id:i,name:'Unit '+i,count:i===60?null:i}))
 const snapshot=JSON.stringify(rows)
 assert.equal(readGridPage(rows,cols,'Unit 59',[],1,15).rows[0].id,59)
 const page=readGridPage(rows,cols,'',[{key:'count',direction:-1}],1,15)
 assert.equal(page.rows[0].id,59);assert.equal(page.total,61);assert.equal(page.rows.length,15)
 assert.equal(readGridRows(rows,cols,'',[{key:'count',direction:-1}]).at(-1).id,60)
 assert.equal(JSON.stringify(rows),snapshot)
})
test('search does not inspect arbitrary or unlisted fields; invalid criteria ignored',()=>{
 const rows=[{name:'A',count:1,secret:'hidden'},{name:'A',count:2}]
 assert.deepEqual(readGridRows(rows,cols,'hidden',[]),[])
 assert.deepEqual(readGridRows(rows,cols,'',[{key:'secret',direction:1}]),rows)
 assert.equal(readGridRows(rows,cols,'a',[{key:'name',direction:1},{key:'count',direction:-1}])[0].count,2)
})
