import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('inbox accepts multiple real File objects without saving original workbooks remotely',()=>{
 const workspace=read('components/QualityExcelMappingWorkspace.tsx')
 assert.match(workspace, /const \[queuedWorkbooks, setQueuedWorkbooks\] = useState<File\[\]>\(\[\]\)/)
 assert.match(workspace, /<input type="file" accept="\.xlsx" multiple/)
 assert.match(workspace, /combined\.length > 35/)
 assert.match(workspace, /256 \* 1024 \* 1024/)
 assert.match(workspace, /Petakan dan pratinjau/)
 assert.match(workspace, /Kosongkan antrean/)
 assert.doesNotMatch(workspace.slice(workspace.indexOf('Antrean workbook unit'),workspace.indexOf("{activeTab === 'indicator'")),/storage\.from\(|upload\(/)
})

test('switching room or workbook remounts importer and cannot reuse previous unit draft data',()=>{
 const workspace=read('components/QualityExcelMappingWorkspace.tsx')
 const panel=read('components/QualityWorkbookImportPanel.tsx')
 assert.match(workspace, /key=\{roomId \+ ':' \+ profileYear/)
 assert.match(workspace, /selectedQueuedIndex/)
 assert.match(workspace, /!ready \? \(/)
 assert.match(workspace, /initialFile=\{selectedQueuedIndex == null \? null : queuedWorkbooks\[selectedQueuedIndex\]/)
 assert.match(panel, /initialFile\?: File \| null/)
 assert.match(panel, /useEffect\(\(\) => \{\s*if \(!initialFile \|\| lastInitialFile\.current === initialFile\) return/)
 assert.match(panel, /void inspect\(initialFile\)/)
})

test('inbox does not send Farmasi multi-sheet or Rawat Jalan date matrices to generic parser',()=>{
 const workspace=read('components/QualityExcelMappingWorkspace.tsx')
 assert.match(workspace, /kind === 'pharmacy_multisheet' \|\| hint\?\.kind === 'outpatient_matrix'/)
 assert.match(workspace, /Master tahunan bukan data logbook/)
 assert.match(workspace, /Memerlukan parser baku khusus unit/)
 assert.match(workspace, /classifyQualityWorkbookName\(file\.name\)/)
})
