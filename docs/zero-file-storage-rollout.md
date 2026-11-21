# AUREKA Zero-File Storage — phased deployment and recovery

## Required invariants

- Uploaded original bytes (including ZIP/Office/PDF/image), base64 encodings, and file Blob never leave the browser.
- Only parsed/validated **structured information** and minimal provenance metadata are submitted to Supabase; file hashes and names are allowed as audit metadata, not a guarantee of authenticity.
- All file downloads are derived anew from persisted structured data and template/version, not a replica of the original source.
- Existing Storage objects **must not be deleted automatically**. A manual legacy migration and legal-records retention review must precede any removal.
- Browser references are short lived. No IndexedDB, localStorage, Cache Storage or background uploads of original files.
- If a PDF is scanned or an image has no extractable text, mark it metadata-only and require manual entry; do not silently invent content.
- The browser-generated PDF certificate is not necessarily byte-for-byte reproducible after template changes. Freeze template and content snapshot before treating its hash as the official issued artifact.

## Deployment order (mandatory)

1. Backup and inventory existing Storage objects, legal archives and database tables; record counts and hashes.
2. Apply **only** `20261122180000_zero_file_archive_schema.sql` through the Supabase migration tool. This makes Secretariat's `bucket_id` and `object_path` nullable, marks `source_mode` and preserves legacy rows. Because Supabase remote migration timestamps currently differ from GitHub filenames, **never replay all migration files**.
3. Apply **only** `20261122180500_zero_file_certificate_snapshots.sql`; verify the signed-in education manager can freeze an immutable certificate manifest, and unauthorized users cannot.
4. Run PR CI (unit tests, typecheck, build), merge and deploy the frontend. Test SPO PDF/DOCX local parsing, Secretariat import and DOCX output, IHT and student orientation certificates, and quality provenance CSV export using synthetic test fixtures.
5. Confirm no browser Storage uploads; examine DevTools network traffic and verify Storage object count/size is unchanged after import and export.
6. Apply **only** `20261122181000_zero_file_storage_policies.sql`, which denies authenticated and anonymous clients INSERT/UPDATE on Storage. It does **not** remove historical files or their read privileges.
7. Confirm upload is rejected using a test authenticated session, while all data-only imports, generated downloads, and access controls continue to work. Check security advisors and PostgREST/edge logs.
8. Review `service_role` and Edge Functions independently: RLS does not block service roles. The `aureka-document-ingest` source now indexes pre-extracted structured text and no longer reads Storage or forwards PDF bytes; redeploy that function and test authorization and knowledge indexing. The legacy `aureka-spo-analyze` and `aureka-secretariat-parse` endpoints still read historical Storage objects and must be retired or restricted separately after confirming no remaining callers.
9. For existing documents where only a file exists and no extracted text, re-import original from an approved external source or preserve the archive in a separate institutional records system. Never claim that reconstructed files are identical to originals.

## Rollback

- Revert application release if local parsing or export fails.
- Revert restrictive Storage policies only if restoring the legacy workflow is explicitly authorized; do not relax security silently.
- `source_mode` and nullable storage path columns are additive; retain them during rollback.
- If any legacy original must be removed, secure a verified external backup, review retention obligations, and record approval. The current migration does not delete anything.

## Completion checks

- [ ] No Storage `upload`, `update`, or `upsert` calls in active frontend/Edge paths.
- [ ] No raw file, base64, data URI or binary is submitted to database or API.
- [ ] Browser only uses memory during parsing, and references are released on modal close/commit.
- [ ] SPO parsed fields are reviewed; PDFs with no text require manual entry.
- [ ] Secretariat persists `source_mode='data_only'`, null bucket/path, and searchable extracted text.
- [ ] Downloads can be regenerated on a different device using database-only data.
- [ ] Certificate template/content are snapshotted if cryptographic print reproducibility is required.
- [ ] Auth, unit-based RLS and audit trails remain tested.
- [ ] Existing file retention policy is documented outside AUREKA.

## Knowledge ingestion migration note

The updated `aureka-document-ingest` requires a reviewed `controlled_document_versions.extracted_text` value. Versions that have only an old `object_path` must be re-imported through the browser-local reader; the worker intentionally refuses to fetch the original file. Do not enable a server-side binary fallback. The embedding service still receives extracted text: review privacy, consent, data minimization and external processor requirements before ingesting patient-related content. Source-code changes do not deploy an Edge Function automatically; publish and verify the function separately.
