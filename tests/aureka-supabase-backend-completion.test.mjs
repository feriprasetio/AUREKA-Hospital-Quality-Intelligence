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
  has(sql, 'No matching by name')
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

test('SPO ingestion worker authenticates users, creates 768-dimensional Gemini embeddings and persists chunks', async () => {
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
  has(worker, 'MAX_FILE_BYTES')
  has(worker, 'claim_document_ingestion_job')
})

test('SPO storage policies use the active analyzer path and trusted role gate', async () => {
  const sql = await read('supabase/migrations/20261120234500_aureka_spo_storage_policy_alignment.sql')
  has(sql, "(storage.foldername(name))[1] = 'spo'")
  has(sql, 'aureka_system.can_process_spo()')
})
