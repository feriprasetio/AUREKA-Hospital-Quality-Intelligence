import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const safety=readFileSync(new URL('../components/PatientSafetyWorkspace.tsx', import.meta.url),'utf8');
const pathway=readFileSync(new URL('../components/ClinicalPathwayWorkspace.tsx', import.meta.url),'utf8');
test('no redundant workflow badges in incident reporting',()=>{
 for(const label of ['Pengelola alur','Ruang kerja PIC','Investigation workspace','WORKFLOW','Buka Workspace Investigasi']) assert.equal(safety.includes(label),false,label);
 assert.match(safety,/canManageWorkflow && incidentId/);
 assert.match(safety,/<option value="closed">Selesai<\/option>/);
});
test('clinical pathway shows usable formats without redundant labels',()=>{
 for(const label of ['Format aktif','Format keseluruhan','format CP aktif','item master']) assert.equal(pathway.includes(label),false,label);
 assert.match(pathway,/template\.status === 'published'/);
 assert.match(pathway,/<label>Status publikasi<\/label>/);
});
