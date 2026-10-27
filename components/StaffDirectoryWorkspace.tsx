'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const q = () => aurekaSupabase.schema('aureka_quality')

type Staff = {
  id: string
  employee_code: string
  display_name: string
  normalized_name: string
  name_prefix: string
  credentials: string
  profession_group: string
  position_title: string
  source_unit: string
  staff_group: string
  source_sheet: string
  source_year: number | null
  directory_status: 'available' | 'needs_review' | 'inactive'
  review_note: string
  updated_at: string
}

type StaffDraft = Pick<Staff,
  'display_name' | 'normalized_name' | 'name_prefix' | 'credentials' |
  'profession_group' | 'position_title' | 'source_unit' |
  'directory_status' | 'review_note'
>

const statusLabel: Record<Staff['directory_status'], string> = {
  available: 'Siap dipetakan',
  needs_review: 'Perlu verifikasi',
  inactive: 'Nonaktif',
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

const requiredFields = [
  'staff_id', 'employee_code', 'display_name', 'normalized_name',
  'name_prefix', 'credentials', 'profession_group', 'position_title',
  'source_unit', 'staff_group', 'source_sheet', 'source_year',
  'directory_status', 'review_note',
] as const

export default function StaffDirectoryWorkspace() {
  const [rows, setRows] = useState<Staff[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [draft, setDraft] = useState<StaffDraft | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await q().from('staff_directory')
      .select('id,employee_code,display_name,normalized_name,name_prefix,credentials,profession_group,position_title,source_unit,staff_group,source_sheet,source_year,directory_status,review_note,updated_at')
      .order('display_name', { ascending: true })
      .limit(5000)
    if (loadError) setError('Gagal memuat master tenaga kerja: ' + loadError.message)
    else setRows((data || []) as Staff[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => [...new Set(rows.map((row) => row.profession_group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')), [rows])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id')
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.directory_status !== statusFilter) return false
      if (groupFilter !== 'all' && row.profession_group !== groupFilter) return false
      if (!term) return true
      return [row.employee_code, row.display_name, row.profession_group, row.position_title, row.source_unit, row.staff_group]
        .some((value) => String(value || '').toLocaleLowerCase('id').includes(term))
    })
  }, [rows, search, statusFilter, groupFilter])

  const availableCount = rows.filter((row) => row.directory_status === 'available').length
  const reviewCount = rows.filter((row) => row.directory_status === 'needs_review').length
  const inactiveCount = rows.filter((row) => row.directory_status === 'inactive').length

  const beginEdit = (staff: Staff) => {
    setEditingStaff(staff)
    setDraft({
      display_name: staff.display_name,
      normalized_name: staff.normalized_name,
      name_prefix: staff.name_prefix,
      credentials: staff.credentials,
      profession_group: staff.profession_group,
      position_title: staff.position_title,
      source_unit: staff.source_unit,
      directory_status: staff.directory_status,
      review_note: staff.review_note,
    })
    setError('')
    setMessage('')
  }

  const closeEdit = () => {
    if (busy) return
    setEditingStaff(null)
    setDraft(null)
  }

  const saveEdit = async () => {
    if (busy || !editingStaff || !draft) return
    if (!draft.display_name.trim() || !draft.normalized_name.trim() || !draft.profession_group.trim()) {
      setError('Nama tampilan, kunci nama, dan kelompok profesi wajib diisi.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
      const { error: updateError } = await q().from('staff_directory')
        .update({
          display_name: draft.display_name.trim(),
          normalized_name: draft.normalized_name.trim().toLocaleLowerCase('id'),
          name_prefix: draft.name_prefix.trim(),
          credentials: draft.credentials.trim(),
          profession_group: draft.profession_group.trim(),
          position_title: draft.position_title.trim(),
          source_unit: draft.source_unit.trim(),
          directory_status: draft.directory_status,
          review_note: draft.review_note.trim(),
          updated_by: authData.user.id,
        })
        .eq('id', editingStaff.id)
      if (updateError) throw new Error('Metadata tenaga tidak dapat disimpan: ' + updateError.message)
      setMessage(`Metadata ${editingStaff.employee_code} berhasil diperbarui. Kode AUREKA dan ID riwayat tidak berubah.`)
      setEditingStaff(null)
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Perubahan metadata tidak berhasil disimpan.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (staff: Staff, next: Staff['directory_status']) => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
    if (authError || !authData.user) {
      setError('Sesi login tidak ditemukan. Silakan login ulang.')
      setBusy(false)
      return
    }
    const { error: updateError } = await q().from('staff_directory')
      .update({ directory_status: next, updated_by: authData.user.id })
      .eq('id', staff.id)
    if (updateError) setError('Perubahan kelayakan tenaga gagal disimpan: ' + updateError.message)
    else {
      setMessage(`${staff.display_name}: ${statusLabel[next].toLowerCase()}.`)
      await load()
    }
    setBusy(false)
  }

  const importCsv = async (file?: File) => {
    if (!file || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length < 2) throw new Error('CSV tidak berisi baris data.')
      const headers = parsed[0].map((header) => header.trim().replace(/^\uFEFF/, '').toLowerCase())
      const index = new Map(headers.map((header, i) => [header, i]))
      const missing = requiredFields.filter((field) => !index.has(field))
      if (missing.length) throw new Error('Kolom wajib belum lengkap: ' + missing.join(', '))
      const seenIds = new Set<string>()
      const seenCodes = new Set<string>()
      const imported = parsed.slice(1).map((line, indexRow) => {
        const read = (field: typeof requiredFields[number]) => String(line[index.get(field)!] ?? '').trim()
        const status = read('directory_status') as Staff['directory_status']
        if (!['available', 'needs_review', 'inactive'].includes(status)) {
          throw new Error(`Status direktori tidak valid pada baris CSV ${indexRow + 2}.`)
        }
        const id = read('staff_id')
        const code = read('employee_code')
        const displayName = read('display_name')
        if (!id || !code || !displayName || !read('normalized_name')) {
          throw new Error(`ID, kode, nama, atau kunci nama kosong pada baris CSV ${indexRow + 2}.`)
        }
        if (seenIds.has(id) || seenCodes.has(code)) throw new Error(`ID atau kode tenaga ganda pada baris CSV ${indexRow + 2}.`)
        seenIds.add(id); seenCodes.add(code)
        const yearText = read('source_year')
        const yearValue = yearText ? Number(yearText) : null
        if (yearText && (!Number.isInteger(yearValue) || yearValue! < 1900 || yearValue! > 2200)) {
          throw new Error(`Tahun sumber tidak valid pada baris CSV ${indexRow + 2}.`)
        }
        return {
          id,
          employee_code: code,
          display_name: displayName,
          normalized_name: read('normalized_name'),
          name_prefix: read('name_prefix'),
          credentials: read('credentials'),
          profession_group: read('profession_group') || 'Tenaga pelayanan/pendukung',
          position_title: read('position_title'),
          source_unit: read('source_unit'),
          staff_group: read('staff_group'),
          source_sheet: read('source_sheet'),
          source_year: yearValue,
          directory_status: status,
          review_note: read('review_note'),
        }
      })
      const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
      if (authError || !authData.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')

      // Preserve canonical UUIDs when this CSV is re-imported after assignments
      // or historical module attributions already reference the existing staff row.
      const existingByCode = new Map<string, string>()
      const codes = imported.map((item) => item.employee_code)
      for (let start = 0; start < codes.length; start += 100) {
        const batchCodes = codes.slice(start, start + 100)
        const { data: existingRows, error: lookupError } = await q().from('staff_directory')
          .select('id,employee_code')
          .in('employee_code', batchCodes)
        if (lookupError) throw new Error('Gagal mencocokkan kode Tenaga AUREKA yang sudah ada: ' + lookupError.message)
        for (const row of existingRows || []) existingByCode.set(String(row.employee_code), String(row.id))
      }
      const stableImported = imported.map((item) => ({
        ...item,
        id: existingByCode.get(item.employee_code) || item.id,
      }))
      const stableIds = new Set<string>()
      for (const item of stableImported) {
        if (stableIds.has(item.id)) throw new Error('Impor dibatalkan: satu ID tenaga akan dipakai oleh lebih dari satu kode AUREKA.')
        stableIds.add(item.id)
      }

      for (let start = 0; start < stableImported.length; start += 100) {
        const batch = stableImported.slice(start, start + 100).map((item) => ({ ...item, updated_by: authData.user.id }))
        const { error: upsertError } = await q().from('staff_directory').upsert(batch, { onConflict: 'id' })
        if (upsertError) throw new Error(`Impor berhenti pada batch ${Math.floor(start / 100) + 1}: ${upsertError.message}`)
      }
      setMessage(`Impor selesai: ${stableImported.length.toLocaleString('id-ID')} rekam diproses. UUID staf yang sudah memiliki penetapan tim/atribusi dipertahankan berdasarkan kode AUREKA.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File CSV tidak dapat diproses.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="staffDirectory">
      <style>{`
        .staffDirectory{display:grid;gap:14px;min-width:0}
        .sdPanel{padding:18px 20px;border:1px solid rgba(255,255,255,.74);border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.56),rgba(255,255,255,.26));box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.8);backdrop-filter:blur(22px) saturate(150%)}
        .sdHead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
        .sdEyebrow{font-size:9px;letter-spacing:.15em;text-transform:uppercase;font-weight:900;color:var(--accent,#0f7656)}
        .sdTitle{font-size:23px;letter-spacing:-.04em;font-weight:950;margin:5px 0;color:var(--text,#20372d)}
        .sdDesc{font-size:11px;line-height:1.55;color:var(--muted,#64756b);max-width:780px;margin:0}
        .sdActions{display:flex;gap:8px;flex-wrap:wrap}
        .sdBtn{border:1px solid rgba(255,255,255,.78);background:rgba(255,255,255,.56);color:var(--text,#20372d);border-radius:12px;padding:10px 13px;font-size:11px;font-weight:900;cursor:pointer;min-height:40px}
        .sdBtn.primary{background:linear-gradient(135deg,var(--accent,#0f7656),var(--accent2,#084f3a));color:#fff;border-color:transparent}
        .sdBtn:disabled{opacity:.55;cursor:wait}
        .sdKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:15px}
        .sdKpi{padding:12px;border:1px solid rgba(255,255,255,.74);background:rgba(255,255,255,.32);border-radius:15px;min-width:0}
        .sdKpi span{font-size:9px;font-weight:850;color:var(--muted,#64756b);display:block}
        .sdKpi strong{font-size:23px;letter-spacing:-.03em;color:var(--text,#20372d);display:block;margin-top:3px}
        .sdFilters{display:grid;grid-template-columns:minmax(220px,1fr) minmax(160px,.45fr) minmax(190px,.65fr);gap:9px;margin-top:14px}
        .sdFilters input,.sdFilters select{width:100%;min-width:0;min-height:42px;padding:10px 12px;border-radius:12px;border:1px solid rgba(35,63,50,.14);background:rgba(255,255,255,.72);color:var(--text,#20372d);font-size:12px}
        .sdNotice{padding:10px 12px;border-radius:12px;background:rgba(15,118,86,.08);border:1px solid rgba(15,118,86,.14);font-size:11px;line-height:1.5;color:var(--text,#20372d);margin-top:10px}
        .sdError{padding:10px 12px;border-radius:12px;background:#fff0ef;border:1px solid #f3c6c1;color:#97372e;font-size:11px;line-height:1.5;margin-top:10px}
        .sdTableWrap{overflow:auto;max-height:65vh;border-radius:16px;border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.25)}
        .sdTable{width:100%;min-width:1120px;border-collapse:separate;border-spacing:0;font-size:11px}
        .sdTable th{position:sticky;top:0;z-index:2;background:#eff6f2;text-align:left;color:#5a6f63;font-size:9px;text-transform:uppercase;letter-spacing:.04em;padding:11px 10px;border-bottom:1px solid #d8e7de}
        .sdTable td{padding:11px 10px;vertical-align:top;border-bottom:1px solid rgba(37,67,51,.09);color:var(--text,#20372d);background:rgba(255,255,255,.2)}
        .sdName{font-weight:900;font-size:12px;color:var(--text,#20372d)}
        .sdSub{font-size:9px;color:var(--muted,#64756b);margin-top:3px;line-height:1.4}
        .sdPill{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;white-space:nowrap}
        .sdPill.available{background:#dcf4e7;color:#16643e}.sdPill.needs_review{background:#fff0d2;color:#835313}.sdPill.inactive{background:#e8ece9;color:#68756e}
        .sdActionsCell{display:flex;gap:5px;flex-wrap:wrap}
        .sdMini{border:1px solid #d7e2db;background:#fff;border-radius:9px;padding:6px 8px;font-size:9px;font-weight:850;cursor:pointer;color:#335143;white-space:nowrap}
        .sdMini:disabled{opacity:.55;cursor:wait}
        .sdEditBackdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(17,33,25,.48);backdrop-filter:blur(8px)}
        .sdEditDialog{width:min(880px,100%);max-height:min(92vh,920px);overflow:auto;padding:22px;border:1px solid rgba(255,255,255,.8);border-radius:22px;background:#f8fbf9;color:#20372d;box-shadow:0 24px 80px rgba(0,0,0,.24)}
        .sdEditHeader{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}
        .sdEditGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .sdEditField{display:grid;gap:6px;min-width:0}
        .sdEditField.full{grid-column:1/-1}
        .sdEditField span{font-size:10px;font-weight:900;color:#596f63}
        .sdEditField input,.sdEditField select,.sdEditField textarea{width:100%;min-width:0;padding:11px 12px;border:1px solid #d4e1d8;border-radius:11px;background:#fff;color:#20372d;font:inherit;font-size:12px}
        .sdEditField textarea{min-height:82px;resize:vertical;line-height:1.5}
        .sdEditHelp{margin:0;font-size:10px;line-height:1.5;color:#65776c}
        .sdEditFooter{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid #dce7df}
        .sdCodeLock{padding:11px 12px;border:1px dashed #b8cdbf;border-radius:11px;background:#edf5ef;font-size:12px;font-weight:900}
        .sdModalTitle{font-size:19px;font-weight:950;letter-spacing:-.03em;margin:4px 0;color:#20372d}
        .sdEditBtn{border:1px solid #cfded4;background:#fff;border-radius:9px;padding:6px 8px;font-size:9px;font-weight:900;cursor:pointer;color:#335143;white-space:nowrap}
        .sdEditBtn:disabled{opacity:.55;cursor:wait}
        .sdEmpty{padding:35px;text-align:center;color:var(--muted,#64756b);font-size:12px}
        @media(max-width:900px){.sdKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sdFilters{grid-template-columns:1fr 1fr}.sdFilters input{grid-column:1/-1}}
        @media(max-width:560px){.sdPanel{padding:14px}.sdKpis{grid-template-columns:1fr 1fr}.sdFilters{grid-template-columns:1fr}.sdFilters input{grid-column:auto}.sdTitle{font-size:21px}}
      `}</style>

      <div className="sdPanel">
        <div className="sdHead">
          <div>
            <div className="sdEyebrow">Metadata · Master Tenaga Kerja</div>
            <h3 className="sdTitle">Direktori Tenaga Kerja AUREKA</h3>
            <p className="sdDesc">Satu direktori induk untuk seluruh modul. Kode AUREKA menjadi penanda internal; nama ganda tidak digabungkan otomatis. NIP, NIK, dan status kepegawaian tidak digunakan sebagai identitas atau dasar penugasan AUREKA.</p>
          </div>
          <div className="sdActions">
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void importCsv(e.target.files?.[0])}/>
            <button type="button" className="sdBtn" disabled={busy} onClick={() => fileRef.current?.click()}>Impor CSV</button>
            <button type="button" className="sdBtn" disabled={busy || loading} onClick={() => void load()}>↻ Segarkan</button>
          </div>
        </div>
        <div className="sdKpis">
          <div className="sdKpi"><span>Total direktori</span><strong>{rows.length.toLocaleString('id-ID')}</strong></div>
          <div className="sdKpi"><span>Siap dipetakan</span><strong>{availableCount.toLocaleString('id-ID')}</strong></div>
          <div className="sdKpi"><span>Perlu verifikasi</span><strong>{reviewCount.toLocaleString('id-ID')}</strong></div>
          <div className="sdKpi"><span>Nonaktif</span><strong>{inactiveCount.toLocaleString('id-ID')}</strong></div>
        </div>
        <div className="sdFilters">
          <input aria-label="Cari tenaga kerja" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kode AUREKA, profesi, jabatan, atau unit…"/>
          <select aria-label="Filter kelayakan penugasan" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Semua kelayakan</option><option value="available">Siap dipetakan</option><option value="needs_review">Perlu verifikasi</option><option value="inactive">Nonaktif</option>
          </select>
          <select aria-label="Filter kelompok profesi" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">Semua kelompok profesi</option>{groups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>
        {message && <div className="sdNotice" role="status">{message}</div>}
        {error && <div className="sdError" role="alert">{error}</div>}
      </div>

      <div className="sdPanel">
        <div className="sdHead" style={{alignItems:'center',marginBottom:12}}>
          <div><div className="sdEyebrow">Direktori Terpadu</div><div style={{fontSize:13,fontWeight:900,marginTop:4}}>Menampilkan {filtered.length.toLocaleString('id-ID')} dari {rows.length.toLocaleString('id-ID')} rekam</div></div>
          <div className="sdSub">Kesamaan nama tidak otomatis dianggap data ganda; gunakan kode AUREKA, gelar, kelompok profesi, dan jabatan untuk memastikan identitas yang tepat.</div>
        </div>
        {loading ? <div className="sdEmpty">Memuat direktori tenaga kerja…</div> : (
          <div className="sdTableWrap">
            <table className="sdTable">
              <thead><tr><th>Kode AUREKA</th><th>Nama resmi dan gelar</th><th>Kelompok profesi</th><th>Jabatan / unit kerja</th><th>Kelayakan untuk pemetaan</th><th>Aksi</th></tr></thead>
              <tbody>
                {filtered.map((staff) => (
                  <tr key={staff.id}>
                    <td><div className="sdName">{staff.employee_code}</div><div className="sdSub">Identitas internal AUREKA</div></td>
                    <td><div className="sdName">{staff.display_name}</div>{staff.review_note && <div className="sdSub">{staff.review_note}</div>}</td>
                    <td>{staff.profession_group}</td>
                    <td>{staff.position_title || '—'}<div className="sdSub">{staff.source_unit || 'Unit sumber belum dicantumkan'}</div></td>
                    <td><span className={`sdPill ${staff.directory_status}`}>{statusLabel[staff.directory_status]}</span></td>
                    <td><div className="sdActionsCell">
                      <button type="button" className="sdEditBtn" disabled={busy} onClick={() => beginEdit(staff)}>Edit metadata</button>
                      {staff.directory_status !== 'available' && <button type="button" className="sdMini" disabled={busy} onClick={() => void changeStatus(staff,'available')}>Verifikasi / aktifkan</button>}
                      {staff.directory_status === 'available' && <button type="button" className="sdMini" disabled={busy} onClick={() => void changeStatus(staff,'needs_review')}>Tahan</button>}
                      {staff.directory_status !== 'inactive' && <button type="button" className="sdMini" disabled={busy} onClick={() => void changeStatus(staff,'inactive')}>Nonaktifkan</button>}
                    </div></td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={6} className="sdEmpty">Tidak ada tenaga kerja yang cocok dengan filter ini.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingStaff && draft && (
        <div className="sdEditBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit() }}>
          <section className="sdEditDialog" role="dialog" aria-modal="true" aria-labelledby="sd-edit-title">
            <div className="sdEditHeader">
              <div>
                <div className="sdEyebrow">Metadata · Perubahan Terkendali</div>
                <h4 id="sd-edit-title" className="sdModalTitle">Edit tenaga kerja</h4>
                <p className="sdDesc">Perubahan nama, profesi, gelar, jabatan, dan unit sumber berlaku sebagai master identitas lintas modul. ID internal serta kode AUREKA tidak dapat diedit agar riwayat OPPE dan audit tetap konsisten.</p>
              </div>
              <div className="sdCodeLock">{editingStaff.employee_code}<br/><span style={{fontSize:9,fontWeight:700}}>Kode identitas permanen</span></div>
            </div>
            <div className="sdEditGrid">
              <label className="sdEditField full"><span>Nama lengkap untuk ditampilkan di AUREKA *</span><input value={draft.display_name} onChange={(e) => setDraft((current) => current ? {...current,display_name:e.target.value} : current)} /></label>
              <label className="sdEditField"><span>Nama dasar / kunci nama *</span><input value={draft.normalized_name} onChange={(e) => setDraft((current) => current ? {...current,normalized_name:e.target.value} : current)} /><p className="sdEditHelp">Isi nama dasar tanpa gelar. Kesamaan nama tidak otomatis berarti orang yang sama; gunakan kode AUREKA, profesi, dan sumber untuk membedakan identitas.</p></label>
              <label className="sdEditField"><span>Gelar / prefiks nama</span><input value={draft.name_prefix} onChange={(e) => setDraft((current) => current ? {...current,name_prefix:e.target.value} : current)} placeholder="Contoh: dr., Ns., Apt."/></label>
              <label className="sdEditField full"><span>Gelar / kualifikasi setelah nama</span><input value={draft.credentials} onChange={(e) => setDraft((current) => current ? {...current,credentials:e.target.value} : current)} placeholder="Contoh: S.Kep., Sp.P., M.Kes."/></label>
              <label className="sdEditField"><span>Kelompok profesi *</span><input value={draft.profession_group} onChange={(e) => setDraft((current) => current ? {...current,profession_group:e.target.value} : current)} /></label>
              <label className="sdEditField"><span>Jabatan / peran</span><input value={draft.position_title} onChange={(e) => setDraft((current) => current ? {...current,position_title:e.target.value} : current)} /></label>
              <label className="sdEditField full"><span>Unit kerja / asal penugasan</span><input value={draft.source_unit} onChange={(e) => setDraft((current) => current ? {...current,source_unit:e.target.value} : current)} /></label>
              <label className="sdEditField"><span>Kelayakan penugasan</span><select value={draft.directory_status} onChange={(e) => setDraft((current) => current ? {...current,directory_status:e.target.value as StaffDraft['directory_status']} : current)}><option value="available">Siap dipetakan</option><option value="needs_review">Perlu verifikasi</option><option value="inactive">Nonaktif</option></select></label>
              <label className="sdEditField full"><span>Catatan verifikasi / pembedaan identitas</span><textarea value={draft.review_note} onChange={(e) => setDraft((current) => current ? {...current,review_note:e.target.value} : current)} placeholder="Catatan singkat untuk petugas metadata. Jangan masukkan NIP/NIK atau ciri fisik." /></label>
            </div>
            {error && <div className="sdError" role="alert">{error}</div>}
            <div className="sdEditFooter">
              <button type="button" className="sdBtn" disabled={busy} onClick={closeEdit}>Batal</button>
              <button type="button" className="sdBtn primary" disabled={busy} onClick={() => void saveEdit()}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
