import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('backend completion migration covers all newly specified operating domains', async () => {
  const sql = await read('supabase/migrations/20261120233000_aureka_backend_completion.sql')
  for (const table of [
    'realcost_import_batches', 'realcost_audits', 'realcost_cost_items', 'realcost_revenue_items',
    'pmkp_meetings', 'pmkp_meeting_invitees', 'pmkp_meeting_documents', 'pmkp_meeting_attendance', 'pmkp_meeting_minutes',
    'education_events', 'education_participants', 'education_attendance', 'education_assessments', 'education_certificates',
    'controlled_documents', 'controlled_document_versions', 'knowledge_ingestion_jobs', 'knowledge_chunks',
    'asset_register', 'generated_artifacts', 'document_approval_requests', 'document_signatures',
  ]) {
    assert.match(sql, new RegExp('create table if not exists [a-z_]+\\.' + table + '\\b', 'i'), table + ' must be present')
  }
  assert.match(sql, /alter table aureka_quality\\.realcost_audits enable row level security/i)
  assert.match(sql, /alter table aureka_system\\.controlled_documents enable row level security/i)
  assert.match(sql, /security_invoker/i)
  assert.match(sql, /OPERATOR\\(extensions\\.<=>\\)/i)
})

test('patient cross-domain joins require verified UUID links and exact normalized MRN backfill', async () => {
  const sql = await read('supabase/migrations/20261120233000_aureka_backend_completion.sql')
  assert.match(sql, /patient_index_id uuid references aureka_quality\\.patient_index\\(patient_id\\)/i)
  assert.match(sql, /normalize_no_rm[\\s\\S]{0,300}= p\\.no_rm/i)
  assert.match(sql, /public\\.aureka_patient_detail_bundle/i)
  assert.match(sql, /patient_record_access_audit/i)
  assert.match(sql, /no matching by name|never match on names/i)
  assert.match(sql, /where i\\.patient_index_id=v_patient\\.patient_id/i)
})

test('document governance hardening requires sequential role-matched approvals and audited signatures', async () => {
  const sql = await read('supabase/migrations/20261120235500_aureka_document_governance_hardening.sql')
  assert.match(sql, /aureka_document_approval_decide/i)
  assert.match(sql, /required_role <> v_role/i)
  assert.match(sql, /prior\\.status <> 'approved'/i)
  assert.match(sql, /aureka_sign_document_artifact/i)
  assert.match(sql, /signer_display_name,signer_role,signed_file_sha256/i)
  assert.match(sql, /document_signature_event_capture/i)
  assert.match(sql, /not a certificate|bukan tanda tangan elektronik tersertifikasi PSrE/i)
})

test('SPO ingestion worker authenticates users, creates 768-dimensional Gemini embeddings and persists chunks', async () => {
  const worker = await read('supabase/functions/aureka-document-ingest/index.ts')
  const config = await read('supabase/config.toml')
  assert.match(config, /\\[functions\\.aureka-document-ingest\\][\\s\\S]*?verify_jwt = true/i)
  assert.match(worker, /auth\\.getUser\\(jwt\\)/i)
  assert.match(worker, /GEMINI_API_KEY/)
  assert.match(worker, /gemini-embedding-2/)
  assert.match(worker, /EMBEDDING_DIMENSIONS = 768/)
  assert.match(worker, /batchEmbedContents/)
  assert.match(worker, /knowledge_chunks/)
  assert.match(worker, /analysis_status: "completed"/)
  assert.match(worker, /MAX_FILE_BYTES/)
})

test('SPO storage policies use the active analyzer path and trusted role gate', async () => {
  const sql = await read('supabase/migrations/20261120234500_aureka_spo_storage_policy_alignment.sql')
  assert.match(sql, /storage\\.foldername\\(name\\)\\)\\[1\\] = 'spo'/i)
  assert.match(sql, /aureka_system\\.can_process_spo\\(\\)/i)
})
