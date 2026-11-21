'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

const q = () => aurekaSupabase.schema('aureka_quality')
const PAGE_SIZE = 500
const MATERIALS = [
  'Sasaran Keselamatan Pasien',
  'Peningkatan Mutu dan Keselamatan Pasien',
  'Pelayanan Kefarmasian dan Penggunaan Obat',
  'Pengendalian dan Pencegahan Infeksi',
  'Bantuan Hidup Dasar',
  'Manajemen Fasilitas dan Keselamatan (APAR dan Evakuasi)',
  'Hak dan Kewajiban Pasien',
] as const

type QualitySource = {
  id: string
  profile_year: number
  record_date: string | null
  core_data: Record<string, unknown> | null
  status: string
}
type SavedOrientation = {
  id: string
  source_quality_record_id: string
  profile_year: number
  role_type: 'Peserta' | 'Narasumber' | 'Sumpah Rekam Medik'
  activity_name: string
  period_label: string
  signed_date: string | null
  materials: string[]
  notes: string
  certificate_number: string | null
  certificate_issued_at: string | null
}
type OrientationRow = {
  source: QualitySource
  name: string
  profession: string
  campus: string
  rotation: string
  ci: string
  defaultPeriod: string
  saved: SavedOrientation | null
}
type Draft = {
  roleType: 'Peserta' | 'Narasumber' | 'Sumpah Rekam Medik'
  activityName: string
  periodLabel: string
  signedDate: string
  materials: string[]
  notes: string
}

const styles = [
  '.studentOrientation{display:grid;gap:14px;min-width:0;color:var(--text,#0b1f33)}',
  '.soPanel{padding:18px 20px;border:1px solid var(--border,rgba(100,125,150,.24));border-radius:16px;background:var(--panel,rgba(255,255,255,.76));min-width:0}',
  '.soEyebrow{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#58718a)}',
  '.soTitle{font-size:23px;line-height:1.2;letter-spacing:-.035em;font-weight:850;margin:5px 0 7px}',
  '.soDesc{font-size:13px;line-height:1.6;color:var(--muted,#58718a);max-width:900px;margin:0}',
  '.soHead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}',
  '.soActions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
  '.soBtn{min-height:40px;padding:9px 13px;border-radius:10px;border:1px solid var(--border,rgba(100,125,150,.3));background:var(--surface,rgba(255,255,255,.7));color:var(--text,#0b1f33);font:inherit;font-size:12px;font-weight:800;cursor:pointer}',
  '.soBtn.primary{background:#164b7a;border-color:#164b7a;color:#fff}',
  '.soBtn:disabled{opacity:.48;cursor:not-allowed}',
  '.soKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
  '.soKpi{padding:13px 15px;border:1px solid var(--border,rgba(100,125,150,.22));border-radius:13px;background:var(--surface,rgba(255,255,255,.58));min-width:0}',
  '.soKpi span{display:block;color:var(--muted,#58718a);font-size:11px;font-weight:750}',
  '.soKpi strong{display:block;margin-top:5px;font-size:25px;line-height:1.1;font-weight:850;font-variant-numeric:tabular-nums}',
  '.soSource{display:flex;align-items:flex-start;gap:9px;padding:12px 14px;border-radius:11px;background:rgba(22,75,122,.07);border:1px solid rgba(22,75,122,.16);font-size:12px;line-height:1.55;color:var(--text,#0b1f33)}',
  '.soSource b{display:block;margin-bottom:2px}',
  '.soToolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:14px}',
  '.soToolbar input,.soToolbar select,.soEditor input,.soEditor select,.soEditor textarea{min-height:40px;border:1px solid var(--border,rgba(100,125,150,.3));border-radius:9px;background:var(--surface,#fff);color:var(--text,#0b1f33);padding:8px 10px;font:inherit;font-size:13px;min-width:0}',
  '.soSearch{flex:1 1 260px}',
  '.soTableWrap{overflow:auto;max-width:100%;border:1px solid var(--border,rgba(100,125,150,.22));border-radius:12px;margin-top:13px}',
  '.soTable{border-collapse:separate;border-spacing:0;width:100%;min-width:1580px;font-size:12px}',
  '.soTable th{position:sticky;top:0;z-index:1;background:var(--surface,#edf3f8);color:var(--text,#0b1f33);font-size:11px;font-weight:850;text-align:left;padding:10px 9px;border-bottom:1px solid var(--border,rgba(100,125,150,.25));white-space:nowrap}',
  '.soTable td{padding:10px 9px;vertical-align:top;border-bottom:1px solid var(--border,rgba(100,125,150,.16));max-width:190px;line-height:1.45}',
  '.soTable tr:last-child td{border-bottom:0}',
  '.soTable td:first-child,.soTable th:first-child{text-align:center;width:48px}',
  '.soName{font-weight:800;min-width:190px}',
  '.soMeta{display:block;margin-top:4px;color:var(--muted,#58718a);font-size:10px;line-height:1.5}',
  '.soMaterial{min-width:125px;white-space:normal}',
  '.soEmpty{padding:24px 16px;text-align:center;color:var(--muted,#58718a);font-size:13px}',
  '.soStatus{display:inline-block;padding:4px 7px;border-radius:7px;background:rgba(22,75,122,.08);color:#164b7a;font-size:10px;font-weight:800}',
  '.soEditor{display:grid;gap:13px;margin-top:14px;border:1px solid var(--border,rgba(100,125,150,.25));border-radius:14px;padding:16px;background:var(--surface,rgba(255,255,255,.52))}',
  '.soEditorHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}',
  '.soEditorGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
  '.soField{display:grid;gap:5px;min-width:0}',
  '.soField label{font-size:11px;font-weight:800;color:var(--muted,#58718a)}',
  '.soField input,.soField select,.soField textarea{width:100%;box-sizing:border-box}',
  '.soField textarea{min-height:66px;resize:vertical}',
  '.soMaterials{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
  '.soMaterialInput{display:grid;grid-template-columns:24px minmax(0,1fr);gap:7px;align-items:center}',
  '.soMaterialInput span{font-size:11px;font-weight:850;color:var(--muted,#58718a)}',
  '.soMaterialInput input{width:100%;box-sizing:border-box}',
  '.soMessage{padding:11px 13px;border-radius:10px;background:rgba(22,75,122,.07);border:1px solid rgba(22,75,122,.17);font-size:12px;line-height:1.5}',
  '.soError{background:rgba(185,28,28,.07);border-color:rgba(185,28,28,.2);color:#991b1b}',
  '@media(max-width:760px){.soKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.soEditorGrid{grid-template-columns:1fr}.soMaterials{grid-template-columns:1fr}.soPanel{padding:14px}.soTitle{font-size:20px}}',
  '[data-mode="gelap"] .studentOrientation .soBtn{background:rgba(255,255,255,.06);color:var(--text,#eef2fa)}',
  '[data-mode="gelap"] .studentOrientation .soTable th{background:#18263a;color:#eef2fa}',
  '[data-mode="gelap"] .studentOrientation .soTable td{color:#eef2fa}',
  '[data-mode="gelap"] .studentOrientation .soToolbar input,[data-mode="gelap"] .studentOrientation .soToolbar select,[data-mode="gelap"] .studentOrientation .soEditor input,[data-mode="gelap"] .studentOrientation .soEditor select,[data-mode="gelap"] .studentOrientation .soEditor textarea{background:#111c2d;color:#eef2fa;border-color:rgba(180,200,225,.2)}',
].join('\n')

function stringValue(value: unknown): string {
  return value == null ? '' : String(value).trim()
}
function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const datePart = String(value).slice(0, 10)
  const parsed = new Date(datePart + 'T00:00:00')
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}
function sourcePeriod(form: Record<string, unknown>, recordDate: string | null): string {
  const start = stringValue(form['Tanggal Mulai Praktek'] ?? form['Tanggal Mulai Praktik'])
  const end = stringValue(form['Tanggal Selesai Praktek'] ?? form['Tanggal Selesai Praktik'])
  if (start && end) return formatDate(start) + ' s.d. ' + formatDate(end)
  if (start || end) return formatDate(start || end)
  return formatDate(recordDate)
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] || char))
}
function buildCertificateHtml(row: OrientationRow, certificateNumber: string): string {
  const saved = row.saved
  const materials = (saved?.materials || []).filter(Boolean)
  const list = materials.length
    ? '<ol>' + materials.map((material) => '<li>' + escapeHtml(material) + '</li>').join('') + '</ol>'
    : '<p>-</p>'
  return [
    '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Sertifikat Orientasi Mahasiswa</title>',
    '<style>',
    '@page{size:A4 landscape;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#132b42;margin:0;background:#fff}',
    '.cert{min-height:170mm;border:5px double #164b7a;padding:19mm 22mm;position:relative;text-align:center}',
    '.brand{font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase;color:#164b7a}',
    'h1{font-size:31px;letter-spacing:4px;margin:11px 0 3px;color:#153d61} .rule{width:90px;height:3px;background:#b28a3a;margin:13px auto 18px}',
    '.intro{font-size:14px;margin:0 0 7px}.name{font-size:27px;font-weight:700;margin:8px 0 13px;color:#153d61}',
    '.body{font-size:14px;line-height:1.65;max-width:760px;margin:0 auto}.details{font-size:12px;line-height:1.5;margin:8px auto;max-width:760px}',
    '.topics{display:inline-block;text-align:left;font-size:11px;line-height:1.55;margin:5px auto 8px}.number{position:absolute;top:9mm;right:12mm;font-size:10px;color:#526779}',
    '.signature{width:220px;margin:12px 0 0 auto;text-align:center;font-size:11px}.signline{height:34px;border-bottom:1px solid #263b50;margin-bottom:5px}',
    '@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}',
    '</style></head><body><main class="cert">',
    '<div class="number">' + escapeHtml(certificateNumber) + '</div>',
    '<div class="brand">UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak</div>',
    '<h1>SERTIFIKAT</h1><div class="rule"></div>',
    '<p class="intro">Diberikan kepada</p><div class="name">' + escapeHtml(row.name) + '</div>',
    '<div class="body">Sebagai <b>' + escapeHtml(saved?.role_type || 'Peserta') + '</b>, telah mengikuti kegiatan <b>' + escapeHtml(saved?.activity_name || 'Orientasi Mahasiswa') + '</b> pada periode ' + escapeHtml(saved?.period_label || row.defaultPeriod) + ' dengan materi sebagai berikut:</div>',
    '<div class="topics">' + list + '</div>',
    '<div class="details">Program/Profesi: ' + escapeHtml(row.profession || '-') + ' &nbsp; | &nbsp; Institusi Pendidikan: ' + escapeHtml(row.campus || '-') + '</div>',
    '<div class="details">Tanggal tanda tangan: ' + escapeHtml(formatDate(saved?.signed_date)) + '</div>',
    '<div class="signature"><div class="signline"></div><b>Pejabat yang berwenang</b><br>UPT RSUD Sultan Syarif Mohamad Alkadrie</div>',
    '</main><script>window.addEventListener("load",function(){window.focus();setTimeout(function(){window.print()},500)})</script></body></html>',
  ].join('')
}

export default function StudentOrientationWorkspace({
  role,
  userId,
  canManage,
}: {
  role: string | null
  userId: string
  canManage: boolean
}) {
  const [selectedYear, setSelectedYear] = useState(2026)
  const [rows, setRows] = useState<OrientationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showList, setShowList] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const sourceRows: QualitySource[] = []
      for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
        const { data, error: sourceError } = await q().from('quality_records')
          .select('id,profile_year,record_date,core_data,status')
          .eq('room_id', 30)
          .eq('profile_year', selectedYear)
          .eq('measurement_grain', 'activity')
          .neq('status', 'archived')
          .is('archived_at', null)
          .order('record_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)
        if (sourceError) throw sourceError
        const page = (data || []) as QualitySource[]
        sourceRows.push(...page)
        if (page.length < PAGE_SIZE) break
      }

      let savedRows: SavedOrientation[] = []
      let savedError = ''
      for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
        const { data, error: orientationError } = await q().from('student_orientation_records')
          .select('id,source_quality_record_id,profile_year,role_type,activity_name,period_label,signed_date,materials,notes,certificate_number,certificate_issued_at')
          .eq('profile_year', selectedYear)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)
        if (orientationError) {
          savedError = orientationError.message || 'Tabel orientasi belum dapat dibaca.'
          break
        }
        const page = (data || []) as SavedOrientation[]
        savedRows.push(...page)
        if (page.length < PAGE_SIZE) break
      }
      const savedBySource = new Map(savedRows.map((item) => [item.source_quality_record_id, item]))
      const mapped = sourceRows.flatMap((source) => {
        const core = (source.core_data || {}) as Record<string, unknown>
        const form = (core.form_fields || core.form_data || {}) as Record<string, unknown>
        const name = stringValue(form['Nama Mahasiswa'] ?? core.student_name)
        if (!name) return []
        return [{
          source,
          name,
          profession: stringValue(form['Profesi/Prodi'] ?? form['Profesi'] ?? form['Prodi']),
          campus: stringValue(form['Kampus']),
          rotation: stringValue(form['Stase Terakhir'] ?? form['Stase']),
          ci: stringValue(form['CI/Penanggung Jawab'] ?? form['CI / Penanggung Jawab']),
          defaultPeriod: sourcePeriod(form, source.record_date),
          saved: savedBySource.get(source.id) || null,
        }]
      })
      mapped.sort((a, b) => a.name.localeCompare(b.name, 'id'))
      setRows(mapped)
      if (savedError) {
        setError('Daftar mahasiswa berhasil dibaca dari logbook Tim Koordinasi Pendidikan, tetapi metadata orientasi belum dapat dimuat. Pastikan migration student orientation sudah diterapkan. Detail: ' + savedError)
      }
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Daftar mahasiswa Tim Koordinasi Pendidikan belum dapat dimuat. Periksa akses ke unit dan koneksi AUREKA.' }))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => { void load() }, [load])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id')
    return rows.filter((row) => {
      const rowRole = row.saved?.role_type || 'Peserta'
      if (roleFilter !== 'all' && rowRole !== roleFilter) return false
      if (!term) return true
      return [
        row.name, row.profession, row.campus, row.rotation, row.ci,
        row.saved?.activity_name || 'Orientasi Mahasiswa',
      ].some((value) => String(value || '').toLocaleLowerCase('id').includes(term))
    })
  }, [rows, search, roleFilter])

  const participantCount = useMemo(() => new Set(rows.map((row) => row.name.trim().toLocaleLowerCase('id'))).size, [rows])
  const savedCount = rows.filter((row) => row.saved).length
  const signedCount = rows.filter((row) => !!row.saved?.signed_date).length
  const certificateCount = rows.filter((row) => !!row.saved?.certificate_number).length
  const selectedRow = selectedSourceId ? rows.find((row) => row.source.id === selectedSourceId) || null : null

  const beginEdit = (row: OrientationRow) => {
    if (!canManage) return
    const saved = row.saved
    setSelectedSourceId(row.source.id)
    setDraft({
      roleType: saved?.role_type || 'Peserta',
      activityName: saved?.activity_name || 'Orientasi Mahasiswa',
      periodLabel: saved?.period_label || row.defaultPeriod,
      signedDate: saved?.signed_date || '',
      materials: saved?.materials?.length ? [...saved.materials, '', '', '', '', '', '', ''].slice(0, 7) : [MATERIALS[0], MATERIALS[1], MATERIALS[2], MATERIALS[3], '', '', ''],
      notes: saved?.notes || '',
    })
    setError('')
    setMessage('')
    setShowList(true)
  }

  const cancelEdit = () => {
    if (saving || issuing) return
    setSelectedSourceId(null)
    setDraft(null)
  }

  const save = async () => {
    if (!canManage || !selectedRow || !draft || saving) return
    if (!draft.activityName.trim() || !draft.periodLabel.trim()) {
      setError('Kegiatan dan Periode/Tanggal wajib diisi.')
      return
    }
    if (!userId) {
      setError('Sesi pengguna tidak ditemukan. Silakan login ulang.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        source_quality_record_id: selectedRow.source.id,
        profile_year: selectedYear,
        role_type: draft.roleType,
        activity_name: draft.activityName.trim(),
        period_label: draft.periodLabel.trim(),
        signed_date: draft.signedDate || null,
        materials: draft.materials.map((item) => item.trim()).filter(Boolean).slice(0, 7),
        notes: draft.notes.trim(),
        updated_by: userId,
      }
      const { data, error: saveError } = await q().from('student_orientation_records')
        .upsert(payload, { onConflict: 'source_quality_record_id' })
        .select('id,source_quality_record_id,profile_year,role_type,activity_name,period_label,signed_date,materials,notes,certificate_number,certificate_issued_at')
        .single()
      if (saveError) throw saveError
      const saved = data as SavedOrientation
      setRows((current) => current.map((row) => row.source.id === selectedRow.source.id ? { ...row, saved } : row))
      setSelectedSourceId(null)
      setDraft(null)
      setMessage('Data orientasi ' + selectedRow.name + ' berhasil disimpan.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Data orientasi belum dapat disimpan.' }))
    } finally {
      setSaving(false)
    }
  }

  const issueCertificate = async (row: OrientationRow) => {
    if (!canManage || !row.saved || !row.saved.signed_date || !row.saved.materials?.length || issuing) {
      setError('Simpan data orientasi, tanggal tanda tangan, dan sekurang-kurangnya satu materi sebelum menerbitkan sertifikat.')
      return
    }
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setError('Jendela sertifikat diblokir browser. Izinkan pop-up untuk AUREKA, lalu ulangi penerbitan.')
      return
    }
    setIssuing(true)
    setError('')
    setMessage('')
    try {
      const { data, error: issueError } = await q().rpc('issue_student_orientation_certificate', { p_record_id: row.saved.id })
      if (issueError) throw issueError
      const result = (Array.isArray(data) ? data[0] : data) as { certificate_number?: string; certificate_issued_at?: string } | null
      const number = stringValue(result?.certificate_number || row.saved.certificate_number)
      if (!number) throw new Error('Nomor sertifikat tidak dikembalikan oleh server.')
      const updatedSaved = {
        ...row.saved,
        certificate_number: number,
        certificate_issued_at: result?.certificate_issued_at || row.saved.certificate_issued_at,
      }
      setRows((current) => current.map((item) => item.source.id === row.source.id ? { ...item, saved: updatedSaved } : item))
      printWindow.document.open()
      printWindow.document.write(buildCertificateHtml({ ...row, saved: updatedSaved }, number))
      printWindow.document.close()
      printWindow.focus()
      setMessage('Nomor sertifikat ' + number + ' diterbitkan. Pada dialog cetak, pilih "Simpan sebagai PDF".')
    } catch (cause) {
      printWindow.close()
      setError(toUserFacingError(cause, { fallback: 'Sertifikat belum dapat diterbitkan.' }))
    } finally {
      setIssuing(false)
    }
  }

  return (
    <section className="studentOrientation">
      <style>{styles}</style>
      <section className="soPanel">
        <div className="soHead">
          <div>
            <div className="soEyebrow">Pendidikan dan Pelatihan</div>
            <h2 className="soTitle">Orientasi Mahasiswa</h2>
            <p className="soDesc">Register orientasi dan dokumentasi materi mahasiswa praktik yang sumber identitasnya ditarik otomatis dari Laporan Indikator Mutu Tim Koordinasi Pendidikan.</p>
          </div>
          <div className="soActions">
            <select aria-label="Tahun data orientasi" value={selectedYear} onChange={(event) => { setSelectedYear(Number(event.target.value)); setSelectedSourceId(null); setDraft(null) }}>
              {[2025, 2026, 2027, 2028, 2029].map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button className="soBtn" type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
            <button className="soBtn primary" type="button" onClick={() => setShowList((value) => !value)}>{showList ? 'Tutup Daftar' : 'Lihat Orientasi Mahasiswa'}</button>
          </div>
        </div>
      </section>

      <section className="soKpis" aria-label="Ringkasan orientasi mahasiswa">
        <div className="soKpi"><span>Rekam mahasiswa dari logbook</span><strong>{loading ? '…' : rows.length.toLocaleString('id-ID')}</strong></div>
        <div className="soKpi"><span>Mahasiswa unik</span><strong>{loading ? '…' : participantCount.toLocaleString('id-ID')}</strong></div>
        <div className="soKpi"><span>Data orientasi tersimpan</span><strong>{savedCount.toLocaleString('id-ID')}</strong></div>
        <div className="soKpi"><span>Sertifikat diterbitkan</span><strong>{certificateCount.toLocaleString('id-ID')}</strong></div>
      </section>

      <div className="soSource">
        <div>
          <b>Sumber data utama: Tim Koordinasi Pendidikan · Unit 30</b>
          Nama, profesi/prodi, kampus, stase, CI, dan periode praktik dibaca langsung dari logbook indikator mutu. AUREKA tidak membuat ulang direktori mahasiswa dan tidak memetakan catatan ini sebagai rekam medis pasien.
        </div>
      </div>

      {error && <div className="soMessage soError" role="alert">{error}</div>}
      {message && <div className="soMessage" role="status">{message}</div>}

      {showList && (
        <section className="soPanel">
          <div className="soHead">
            <div>
              <div className="soEyebrow">Register</div>
              <h3 className="soTitle">Daftar Orientasi Mahasiswa {selectedYear}</h3>
              <p className="soDesc">Format register mengikuti kolom pada Database.xlsx. Baris peserta muncul otomatis ketika PIC Tim Koordinasi Pendidikan mengisi logbook indikator mutu.</p>
            </div>
            {!canManage && <span className="soStatus">Akses lihat saja · {role || 'Pengguna'}</span>}
          </div>
          <div className="soToolbar">
            <input className="soSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, kampus, profesi, stase, atau kegiatan…" aria-label="Cari mahasiswa orientasi" />
            <select aria-label="Filter peran" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">Semua peran</option>
              <option value="Peserta">Peserta</option>
              <option value="Narasumber">Narasumber</option>
              <option value="Sumpah Rekam Medik">Sumpah Rekam Medik</option>
            </select>
            <span className="soStatus">{filteredRows.length.toLocaleString('id-ID')} baris</span>
          </div>
          {loading ? <div className="soEmpty">Memuat daftar mahasiswa dari logbook Tim Koordinasi Pendidikan…</div> :
            filteredRows.length === 0 ? <div className="soEmpty">Belum ada mahasiswa pada logbook Tim Koordinasi Pendidikan untuk tahun {selectedYear}, atau hasil pencarian tidak ditemukan.</div> :
            <div className="soTableWrap">
              <table className="soTable">
                <thead><tr>
                  <th>No.</th><th>Nama</th><th>Sebagai</th><th>Kegiatan</th><th>Periode/Tanggal</th><th>Tanggal TTD</th>
                  <th>Materi 1</th><th>Materi 2</th><th>Materi 3</th><th>Materi 4</th><th>Materi 5</th><th>Materi 6</th><th>Materi 7</th><th>Aksi</th>
                </tr></thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const materials = row.saved?.materials?.length ? row.saved.materials : [MATERIALS[0], MATERIALS[1], MATERIALS[2], MATERIALS[3]]
                    return <tr key={row.source.id}>
                      <td>{index + 1}</td>
                      <td className="soName">{row.name}<span className="soMeta">{[row.profession, row.campus, row.rotation, row.ci ? 'CI: ' + row.ci : ''].filter(Boolean).join(' · ')}</span></td>
                      <td>{row.saved?.role_type || 'Peserta'}</td>
                      <td>{row.saved?.activity_name || 'Orientasi Mahasiswa'}</td>
                      <td>{row.saved?.period_label || row.defaultPeriod}</td>
                      <td>{formatDate(row.saved?.signed_date)}</td>
                      {Array.from({ length: 7 }, (_, i) => <td className="soMaterial" key={i}>{materials[i] || '-'}</td>)}
                      <td>
                        <div className="soActions">
                          <button type="button" className="soBtn" disabled={!canManage} onClick={() => beginEdit(row)}>{row.saved ? 'Ubah' : 'Lengkapi'}</button>
                          <button type="button" className="soBtn primary" disabled={!canManage || !row.saved?.signed_date || !row.saved?.materials?.length || issuing} onClick={() => void issueCertificate(row)}>{row.saved?.certificate_number ? 'Cetak PDF' : 'Terbitkan PDF'}</button>
                        </div>
                        {row.saved?.certificate_number && <span className="soMeta">{row.saved.certificate_number}</span>}
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          }

          {selectedRow && draft && (
            <div className="soEditor">
              <div className="soEditorHead">
                <div><div className="soEyebrow">Lengkapi register</div><h3 className="soTitle">{selectedRow.name}</h3><p className="soDesc">{[selectedRow.profession, selectedRow.campus, selectedRow.rotation].filter(Boolean).join(' · ')}</p></div>
                <div className="soActions">
                  <button type="button" className="soBtn" onClick={cancelEdit} disabled={saving || issuing}>Batal</button>
                  <button type="button" className="soBtn primary" onClick={() => void save()} disabled={saving || !canManage}>{saving ? 'Menyimpan…' : 'Simpan Orientasi'}</button>
                </div>
              </div>
              <div className="soEditorGrid">
                <div className="soField"><label>Sebagai</label><select value={draft.roleType} onChange={(event) => setDraft((current) => current ? { ...current, roleType: event.target.value as Draft['roleType'] } : current)}><option>Peserta</option><option>Narasumber</option><option>Sumpah Rekam Medik</option></select></div>
                <div className="soField"><label>Kegiatan</label><input value={draft.activityName} onChange={(event) => setDraft((current) => current ? { ...current, activityName: event.target.value } : current)} maxLength={240} required /></div>
                <div className="soField"><label>Periode/Tanggal</label><input value={draft.periodLabel} onChange={(event) => setDraft((current) => current ? { ...current, periodLabel: event.target.value } : current)} maxLength={160} required /></div>
                <div className="soField"><label>Tanggal TTD</label><input type="date" value={draft.signedDate} onChange={(event) => setDraft((current) => current ? { ...current, signedDate: event.target.value } : current)} /></div>
              </div>
              <div className="soField"><label>Materi 1–7</label><div className="soMaterials">
                {Array.from({ length: 7 }, (_, index) => <div className="soMaterialInput" key={index}><span>{index + 1}.</span><input value={draft.materials[index] || ''} onChange={(event) => setDraft((current) => current ? { ...current, materials: Array.from({ length: 7 }, (_, i) => i === index ? event.target.value : (current.materials[i] || '')) } : current)} placeholder={MATERIALS[index]} maxLength={240} aria-label={'Materi ' + (index + 1)} /></div>)}
              </div></div>
              <div className="soField"><label>Catatan internal (opsional)</label><textarea value={draft.notes} onChange={(event) => setDraft((current) => current ? { ...current, notes: event.target.value } : current)} maxLength={1000} /></div>
            </div>
          )}
          <p className="soMeta">Tanggal TTD, materi, dan nomor sertifikat disimpan sebagai metadata orientasi. Data nama dan identitas akademik tetap mengikuti laporan sumber Tim Koordinasi Pendidikan.</p>
        </section>
      )}
    </section>
  )
}
