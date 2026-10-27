begin;

-- Review the originally flagged same-name records against profession, credentials,
-- source category, and the PMKP clarification. These are distinct employees, not
-- duplicate rows. Their UUIDs and AUREKA codes remain unchanged.
update aureka_quality.staff_directory
set directory_status = 'available',
    review_note = '',
    updated_at = now()
where employee_code in (
  'AUR-0149',
  'AUR-0179',
  'AUR-0279',
  'AUR-0316',
  'AUR-0364',
  'AUR-0506',
  'AUR-0567',
  'AUR-0573'
)
and directory_status = 'needs_review'
and review_note like 'Nama dasar sama muncul pada lebih dari satu baris sumber%';

-- Two people genuinely named Nurbani are retained. Use their unique internal
-- AUREKA codes for disambiguation; no physical descriptors are stored.
update aureka_quality.staff_directory
set directory_status = 'available',
    review_note = 'Klarifikasi PMKP: identitas ini adalah salah satu dari dua personel berbeda dengan nama dasar yang sama pada daftar tenaga kebersihan. Gunakan kode AUREKA yang tampil di daftar untuk memilih identitas; tidak memakai ciri fisik sebagai label.',
    updated_at = now()
where employee_code = 'AUR-0568'
  and directory_status = 'needs_review';

update aureka_quality.staff_directory
set directory_status = 'available',
    review_note = 'Klarifikasi PMKP: identitas ini adalah salah satu dari dua personel berbeda dengan nama dasar yang sama pada daftar tenaga kebersihan. Gunakan kode AUREKA yang tampil di daftar untuk memilih identitas; tidak memakai ciri fisik sebagai label.',
    updated_at = now()
where employee_code = 'AUR-0570'
  and directory_status = 'needs_review';

-- Keep only source-integrity problems in review until an official source is
-- available. Do not guess spelling or resolve them by silently deleting data.
comment on table aureka_quality.staff_directory is
'Canonical personnel identity for AUREKA modules. AUREKA employee_code is unique; same-name personnel are not merged by normalized_name alone. Use profession, credentials, source, and official verification where needed.';

commit;
