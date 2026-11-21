import { readWorkspaceHash } from '../lib/aureka/workspace-route.ts'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const home=await readFile(new URL('../components/HomeClient.tsx',import.meta.url),'utf8');
const workspace=await readFile(new URL('../components/StandardsProcedureWorkspace.tsx',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20261121070000_standard_operating_procedures.sql',import.meta.url),'utf8');
const edge=await readFile(new URL('../supabase/functions/aureka-spo-analyze/index.ts',import.meta.url),'utf8');
const config=await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8');
test('SPO is enabled under the quality development navigation',()=>{
 assert.match(home,/id:'sop',label:'Standar Prosedur Operasional'/);
 assert.doesNotMatch(home,/id:'sop',label:'Standar Prosedur Operasional',disabled:true/);
 assert.deepEqual(readWorkspaceHash('#indikator-mutu/spo'), {module:'quality',section:'sop'});
 assert.match(home,/setSpoOpen\(section==='sop'\)/);
 assert.match(home,/StandardsProcedureWorkspace/);
});
test('SPO workspace provides upload, review, approval and structured text fields',()=>{
 for(const text of ['Upload SPO','aureka-spo-analyze','Simpan Draf SPO','Ajukan Review','Sahkan SPO','procedure_steps','flowchart_code'])assert.ok(workspace.includes(text),text);
});
test('SPO foreign-key indexes cover audit user references',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261121073000_standard_operating_procedures_fk_indexes.sql',import.meta.url),'utf8');
 for(const column of ['created_by','updated_by','approved_by']) {
  assert.ok(sql.includes('ON aureka_quality.standard_operating_procedures ('+column+')'));
 }
});

test('SPO records do not store file bytes',()=>{
 assert.doesNotMatch(migration,/\bbytea\b|\bblob\b/i);
 assert.match(migration,/source_storage_path text/);assert.match(migration,/procedure_steps jsonb/);assert.match(migration,/flowchart jsonb/);
});
test('SPO storage, table RLS and server analysis are restricted',()=>{
 for(const p of ['spo_register_read','spo_register_insert','spo_register_update','spo_source_documents_read','spo_source_documents_insert','spo_register_password_rotation'])assert.ok(migration.includes(p),p);
 assert.match(migration,/aureka_system\.current_role_code\(\)/);
 assert.match(edge,/getUser\(jwt\)/);
 assert.match(edge,/pdfjs\.getDocument/);
 assert.match(edge,/JSZip\.loadAsync/);
 assert.match(edge,/parseStructuredSPO/);
 assert.match(edge,/AUREKA Local Document Parser v1/);
 assert.doesNotMatch(edge,/GEMINI_API_KEY|generativelanguage\.googleapis\.com|openai\.com\/v1/);
 assert.match(config,/\[functions\.aureka-spo-analyze\]/);
});

test('SPO uses deterministic PDF and DOCX extraction without external AI APIs',()=>{
 assert.match(edge,/pdfjs\.getDocument/);
 assert.match(edge,/JSZip\.loadAsync/);
 assert.match(edge,/SECTION_PATTERN/);
 assert.match(edge,/labelledValue/);
 assert.match(edge,/extracted_diagram_labels/);
 assert.doesNotMatch(edge,/GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
 assert.match(workspace,/AUREKA Local Document Parser v1/);
});

test('SPO typography and mobile touch controls honor design accessibility baseline', async () => {
  const css = await readFile(new URL('../app/aureka-global.css',import.meta.url), 'utf8');
  for (const selector of ['.spoEyebrow{font-size:11px', '.spoRecordTop,.spoRecordBottom{width:100%;font-size:11px', '.spoStatus{display:inline-flex']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /\.spoStatus\{[^}]*font-size:11px/);
  assert.match(css, /\.spoStep\{[^}]*grid-template-columns:28px minmax\(0,1fr\) 44px/);
  assert.match(css, /\.spoStep button\{[^}]*height:44px;width:44px/);
  assert.match(css, /@media\(max-width:760px\)\{\.spoStats[^\n]*\.spoRegisterToolbar input,\.spoSection input,\.spoSection textarea,\.spoStep textarea\{font-size:16px\}/);
  assert.match(css, /\.spoButton,\.spoFilters button,\.spoLinkButton\{min-height:44px\}/);
});
