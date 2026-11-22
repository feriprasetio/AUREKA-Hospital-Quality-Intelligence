import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('uploading patient worksheets never automatically publishes missing indicator profiles',async()=>{
  const dialog=await readFile(new URL('../components/PatientEpisodeWorkbookDialog.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(dialog,/autofill_missing_indicator_profiles|readReference\(/)
  assert.match(dialog,/Tidak ada profil yang dibuat/)
  assert.match(dialog,/Profil di workbook hanya digunakan untuk pratinjau/)
})
