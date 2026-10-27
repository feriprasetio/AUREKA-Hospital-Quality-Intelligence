begin;

-- Review the originally flagged same-name records against profession, credentials,
-- source category, and the PMKP clarification. These are distinct employees, not
-- duplicate rows. Their UUIDs and AUREKA codes remain unchanged.
update aureka_quality.staff_directory
set directory_status = 'available',
    review_note = '',
    updated_at = now()
where employee_code in (
  'AUR-0149', -- Sri Wahyuni, S.Kep. (perawat); distinct from cleaner without degree
  'AUR-0179', -- Ns. Nur Annisa, S.Kep.; distinct from dr. Nur Annisa, Sp.P.
  'AUR-0279', -- Herman, A.Md.Kep. (perawat); distinct from cleaner
  'AUR-0316', -- Rahmawati, A.Md.Keb.; distinct from pharmacy assistant
  'AUR-0364', -- dr. Nur Annisa, Sp.P.; different profession/credentials
  'AUR-0506', -- Rahmawati, A.Md.Farm.; distinct from midwife
  'AUR-0567', -- Herman, cleaner; distinct from nurse
  'AUR-0573'  -- Sri Wahyuni, cleaner; distinct from nurse
)
and directory_status = 'needs_review'
and review_note like 'Nama dasar sama muncul pada lebih dari satu baris sumber%';

-- Two people genuinely named Nurbani are retained. Use their unique internal
-- AUREKA codes for disambiguation; no physical descriptors are stored.
update aureka_quality.staff_directory
set directory_status = 'available',
    review_note = 'Klarifikasi PMKP: terdapat dua personel berbeda bernama Nurbani pada daftar tenaga kebersihan. Gunakan kode AUREKA AUR-0568 untuk memilih identitas ini; tidak memakai ciri fisik sebagai label.',
    updated_at = now()
where employee_code = 'AUR-0568'
  and directory_status = 'needs_review';

update aureka_quality.staff_directory
set directory_status = 'available',
    review_note = 'Klarifikasi PMKP: terdapat dua personel berbeda bernama Nurbani pada daftar tenaga kebersihan. Gunakan kode AUREKA AUR-0570 untuk memilih identitas ini; tidak memakai ciri fisik sebagai label.',
    updated_at = now()
where employee_code = 'AUR-0570'
  and directory_status = 'needs_review';

-- Keep only source-integrity problems in review until an official source is
-- available. Do not guess spelling or resolve them by silently deleting data.
comment on table aureka_quality.staff_directory is
'Canonical personnel identity for AUREKA modules. AUREKA employee_code is unique; same-name personnel are not merged by normalized_name alone. Use profession, credentials, source, and official verification where needed.';

commit;
