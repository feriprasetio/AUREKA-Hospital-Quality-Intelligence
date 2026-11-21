import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const has = (source, text, message = text) => assert.ok(source.includes(text), message)

test('backend completion migration covers all newly specified operating domains', async () => {
  const sql = await read('supabase/migrations/20261120233000_aureka_backend_completion.sql')
  for (const table of [
    'realcost_import_batches', 'realcost_audits', 'realcost_cost_items', 'realcost_revenue_items',
    'pmkp_meetings', 'pmkp_meeting_invitees', 'pmkp_meeting_documents', 'pmkp_meeting_attendance', 'pmkp_meeting_minutes',
    'education_events', 'education_participants', 'education_attendance', 'education_assessments', 'education_certificates',
    'controlled_documents', 'controlled_document_versions', 'knowledge_ingestion_jobs', 'knowledge_chunks',
    'asset_register', 'generated_artifacts', 'document_approval_requests', 'document_signatures',
  ]) {
    has(sql.toLowerCase(), 'create table if not exists ', 'table declaration exists')
    has(sql.toLowerCase(), table.toLowerCase(), table + ' must be present')
  }
  has(sql, 'alter table aureka_quality.realcost_audits enable row level security')
  has(sql, 'alter table aureka_system.controlled_documents enable row level security')
  has(sql, 'security_invoker')
  has(sql, 'OPERATOR(extensions.<=>)')
})

test('patient cross-domain joins require verified UUID links and exact normalized MRN backfill', async () => {
  const sql = await read('supabase/migrations/20261120233000_aureka_backend_completion.sql')
  has(sql, 'references aureka_quality.patient_index(patient_id)')
  has(sql, 'normalize_no_rm')
  has(sql, '= p.no_rm')
  has(sql, 'public.aureka_patient_detail_bundle')
  has(sql, 'patient_record_access_audit')
  has(sql, 'never match on names or similarity')
  has(sql, 'where i.patient_index_id=v_patient.patient_id')
})

test('document governance hardening requires sequential role-matched approvals and audited signatures', async () => {
  const sql = await read('supabase/migrations/20261120235500_aureka_document_governance_hardening.sql')
  has(sql, 'aureka_document_approval_decide')
  has(sql, "v_request.required_role <> v_role")
  has(sql, "prior.status <> 'approved'")
  has(sql, 'aureka_sign_document_artifact')
  has(sql, 'signer_display_name,signer_role,signed_file_sha256')
  has(sql, 'document_signature_event_capture')
  has(sql, 'bukan tanda tangan elektronik tersertifikasi PSrE')
})

test('NARA ingestion worker authenticates users, indexes structured text, and creates 768-dimensional Gemini embeddings', async () => {
  const worker = await read('supabase/functions/aureka-document-ingest/index.ts')
  const config = await read('supabase/config.toml')
  has(config, '[functions.aureka-document-ingest]')
  const workerConfig = config.split('[functions.aureka-document-ingest]')[1] || ''
  has(workerConfig, 'verify_jwt = true')
  has(worker, 'auth.getUser(jwt)')
  has(worker, 'GEMINI_API_KEY')
  has(worker, 'gemini-embedding-2')
  has(worker, 'EMBEDDING_DIMENSIONS = 768')
  has(worker, 'batchEmbedContents')
  has(worker, 'knowledge_chunks')
  has(worker, 'analysis_status: "completed"')
  has(worker, 'MAX_EXTRACTED_CHARS')
  has(worker, 'version.extracted_text')
  for (const forbidden of ['.storage.from(', 'inline_data', 'file.arrayBuffer(']) {
    assert.ok(!worker.includes(forbidden), 'binary file access forbidden: ' + forbidden)
  }
  has(worker, 'claim_document_ingestion_job')
})

test('SPO storage policies use the active analyzer path and trusted role gate', async () => {
  const sql = await read('supabase/migrations/20261120234500_aureka_spo_storage_policy_alignment.sql')
  has(sql, "(storage.foldername(name))[1] = 'spo'")
  has(sql, 'aureka_system.can_process_spo()')
})

test('document ingestion queue uses an atomic PostgreSQL claim and bounded retry eligibility', async () => {
  const sql = await read('supabase/migrations/20261121001500_aureka_document_ingestion_atomic_claim.sql')
  has(sql, 'claim_document_ingestion_job')
  has(sql, 'for update skip locked')
  has(sql, "interval '10 minutes'")
  has(sql, 'j.attempts < j.max_attempts')
  has(sql, 'grant execute on function aureka_system.claim_document_ingestion_job(uuid) to authenticated')
})

test('Realcost encounter uniqueness and signature revocation preserve auditability', async () => {
  const sql = await read('supabase/migrations/20261121002000_aureka_realcost_signature_lifecycle.sql')
  has(sql, "btrim(encounter_ref) <> ''")
  has(sql, 'realcost_import_batches_source_sha_uidx')
  has(sql, 'aureka_revoke_document_signature')
  has(sql, 'revoke_reason=left(trim(p_reason),1000)')
})
