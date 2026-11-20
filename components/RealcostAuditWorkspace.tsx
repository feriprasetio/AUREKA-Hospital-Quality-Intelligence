'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requestSensitiveAccess } from '@/lib/aureka/sensitive-access'
import {
  REALCOST_COST_COMPONENTS,
  type RealcostDashboard,
  type RealcostEpisode,
} from '@/lib/aureka/realcost-engine'
import {
  hashRealcostWorkbook,
  prepareRealcostImport,
  type RealcostPatientIdentity,
  type RealcostPreparedImport,
} from '@/lib/aureka/realcost-xlsx-import'

type Props = { sb: SupabaseClient }
type ImportMeta = {
  id: string
  source_name: string
  source_sheet: string
  source_sha256: string
  period_start: string | null
  period_end: string | null
  source_rows: number
  imported_rows: number
  created_at: string
  completed_at: string | null
}
type DetailTab = 'episodes' | 'components' | 'inacbg' | 'diagnosis' | 'reconciliation'
type IdentityRecord = RealcostPatientIdentity | null

const MAX_FILE_BYTES = 15 * 1024 * 1024
const BATCH_SIZE = 250
const PAGE_SIZE = 50
const money = (value: number | null | undefined) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number.isFinite(Number(value)) ? Number(value) : 0)
const number = (value: number | null | undefined, digits = 0) => new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: digits, minimumFractionDigits: digits,
}).format(Number.isFinite(Number(value)) ? Number(value) : 0)
const dateLabel = (value: string | null | undefined) => {
  if (!value) return '-'
  const date = new Date(value + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
const dateTimeLabel = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
  : '-'

function cardStyle(): CSSProperties {
  return { border: '1px solid var(--line, #dbe4ec)', borderRadius: 12, padding: 16, background: 'var(--surface, #fff)', minWidth: 0 }
}
function mutedStyle(): CSSProperties {
  return { color: 'var(--muted, #50677e)', fontSize: 12, lineHeight: 1.5 }
}
function titleStyle(): CSSProperties {
  return { color: 'var(--ink, #0b1f33)', fontSize: 13, fontWeight: 600 }
}
function buttonStyle(primary = false, disabled = false): CSSProperties {
  return {
    minHeight: 44, borderRadius: 10, border: primary ? '1px solid #16507a' : '1px solid var(--line, #cbd7e2)',
    background: primary ? '#16507a' : 'var(--surface, #fff)',
    color: primary ? '#fff' : 'var(--ink, #0b1f33)', padding: '10px 16px', fontWeight: 650,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
  }
}
function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div style={cardStyle()}>
    <div style={mutedStyle()}>{label}</div>
    <div style={{ color: 'var(--ink, #0b1f33)', fontSize: 22, lineHeight: 1.25, fontWeight: 750, marginTop: 7, overflowWrap: 'anywhere' }}>{value}</div>
    {detail && <div style={{ ...mutedStyle(), marginTop: 6 }}>{detail}</div>}
  </div>
}
function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return <div style={{ ...cardStyle(), padding: 22 }}>
    <div style={{ fontWeight: 700, color: 'var(--ink, #0b1f33)' }}>{title}</div>
    <p style={{ ...mutedStyle(), margin: '7px 0 0' }}>{detail}</p>
  </div>
}
function Bar({ value, max, label, detail }: { value: number; max: number; label: string; detail: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0
  return <div style={{ display: 'grid', gap: 5 }}>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ ...titleStyle(), minWidth: 0 }}>{label}</span>
      <span style={{ ...mutedStyle(), whiteSpace: 'nowrap' }}>{detail}</span>
    </div>
    <div style={{ height: 9, borderRadius: 6, background: 'var(--surface-muted, #e8eff5)', overflow: 'hidden' }}>
      <div style={{ width: pct + '%', height: '100%', borderRadius: 6, background: '#16507a' }} />
    </div>
  </div>
}

function readGrid(worksheet: any): unknown[][] {
  const result: unknown[][] = []
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row: unknown[] = []
    for (let column = 1; column <= worksheet.columnCount; column++) {
      row.push(worksheet.getCell(rowNumber, column).value)
    }
    result.push(row)
  }
  return result
}

export default function RealcostAuditWorkspace({ sb }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const db = useMemo(() => sb.schema('aureka_quality'), [sb])
  const [summary, setSummary] = useState<RealcostDashboard | null>(null)
  const [latestImport, setLatestImport] = useState<ImportMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailMode, setDetailMode] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('episodes')
  const [canImport, setCanImport] = useState(false)
  const [canReadDetail, setCanReadDetail] = useState(false)
  const [canReadIdentity, setCanReadIdentity] = useState(false)
  const [detailAccessLogged, setDetailAccessLogged] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [prepared, setPrepared] = useState<RealcostPreparedImport | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [detailRows, setDetailRows] = useState<RealcostEpisode[]>([])
  const [detailCount, setDetailCount] = useState(0)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailPage, setDetailPage] = useState(0)
  const [detailSearch, setDetailSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [selectedEpisode, setSelectedEpisode] = useState<RealcostEpisode | null>(null)
  const [identity, setIdentity] = useState<IdentityRecord>(null)
  const [identityBusy, setIdentityBusy] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setAccessError('')
    try {
      const permissions = await Promise.all([
        sb.rpc('aureka_has_permission', { p_permission: 'realcost.read.aggregate' }),
        sb.rpc('aureka_has_permission', { p_permission: 'realcost.read.detail' }),
        sb.rpc('aureka_has_permission', { p_permission: 'realcost.import' }),
        sb.rpc('aureka_has_permission', { p_permission: 'patient.read.identifiable' }),
      ])
      if (permissions[0].error) throw permissions[0].error
      if (permissions[0].data !== true) {
        setSummary(null)
        setLatestImport(null)
        setAccessError('Role pengguna belum memiliki hak melihat analisis agregat Audit Realcost.')
        return
      }
      setCanReadDetail(permissions[1].data === true)
      setCanImport(permissions[2].data === true)
      setCanReadIdentity(permissions[3].data === true)

      const { data, error } = await db.from('realcost_imports')
        .select('id,source_name,source_sheet,source_sha256,period_start,period_end,source_rows,imported_rows,created_at,completed_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        setLatestImport(null)
        setSummary(null)
        setDetailAccessLogged(false)
        return
      }
      setLatestImport(data as ImportMeta)
      setDetailAccessLogged(false)
      const { data: result, error: dashboardError } = await sb.rpc('aureka_realcost_dashboard', { p_import_id: data.id })
      if (dashboardError) throw dashboardError
      setSummary(result as RealcostDashboard)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Analisis Audit Realcost belum dapat dimuat.')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [db, sb])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const changeDetailTab = async (next: DetailTab) => {
    if (next === 'episodes' && canReadDetail && latestImport && !detailAccessLogged) {
      const allowed = await requestSensitiveAccess(
        'realcost_detail',
        latestImport.id,
        'Melihat daftar episode dan rincian komponen biaya Audit Realcost',
      )
      if (!allowed) return
      setDetailAccessLogged(true)
    }
    setDetailTab(next)
  }

  const openAuditWorkspace = async () => {
    if (latestImport && canReadDetail && !detailAccessLogged) {
      const allowed = await requestSensitiveAccess(
        'realcost_detail',
        latestImport.id,
        'Membuka rincian Audit Realcost untuk telaah episode dan komponen biaya',
      )
      if (allowed) {
        setDetailAccessLogged(true)
        setDetailTab('episodes')
      } else {
        setDetailTab('components')
      }
    } else if (!canReadDetail) {
      setDetailTab('components')
    }
    setDetailMode(true)
  }

  const loadDetails = useCallback(async (page = detailPage) => {
    if (!latestImport || !canReadDetail) return
    setDetailLoading(true)
    setMessage('')
    try {
      let query = db.from('realcost_episodes')
        .select('id,import_id,source_row,episode_key_hash,admission_date,discharge_date,class_code,inacbg_code,inacbg_description,tariff_inacbg,tarif_rs,total_tarif,tarif_poli_eks,los,icu_indicator,icu_los,vent_hour,discharge_status,diagnosis_codes,procedure_codes,cost_components,billing_group,billing_group_total_tarif_rs,source_payload', { count: 'exact' })
        .eq('import_id', latestImport.id)
        .order('discharge_date', { ascending: false })
        .order('source_row', { ascending: true })
      if (classFilter) query = query.eq('class_code', classFilter)
      if (detailSearch.trim()) {
        const safe = detailSearch.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 60)
        if (safe) query = query.or('inacbg_code.ilike.%' + safe + '%,inacbg_description.ilike.%' + safe + '%')
      }
      const from = page * PAGE_SIZE
      const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      setDetailRows((data ?? []) as RealcostEpisode[])
      setDetailCount(count ?? 0)
      setSelectedEpisode(null)
      setIdentity(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rincian episode gagal dimuat.')
      setDetailRows([])
      setDetailCount(0)
    } finally {
      setDetailLoading(false)
    }
  }, [canReadDetail, classFilter, db, detailPage, detailSearch, latestImport])

  useEffect(() => {
    if (detailMode && detailTab === 'episodes') void loadDetails(detailPage)
  }, [detailMode, detailTab, detailPage, classFilter, detailSearch, loadDetails])

  const beginFileRead = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (!selected) return
    setFile(selected)
    setPrepared(null)
    setMessage('')
    if (!/\.xlsx$/i.test(selected.name)) { setMessage('Hanya workbook .xlsx yang didukung.'); return }
    if (selected.size <= 0 || selected.size > MAX_FILE_BYTES) { setMessage('Ukuran file harus lebih besar dari 0 dan maksimal 15 MB.'); return }
    setBusy(true)
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      const buffer = await selected.arrayBuffer()
      await workbook.xlsx.load(buffer)
      if (!workbook.worksheets?.length || workbook.worksheets.length > 50) throw new Error('Workbook kosong atau jumlah worksheet tidak wajar.')
      if (workbook.worksheets.some((sheet: any) => sheet.rowCount > 50000 || sheet.columnCount > 150)) throw new Error('Dimensi worksheet melewati batas aman (50.000 baris dan 150 kolom).')

      let parsed: RealcostPreparedImport | null = null
      let chosenSheet = ''
      const candidateErrors: string[] = []
      for (const worksheet of workbook.worksheets) {
        try {
          parsed = await prepareRealcostImport(readGrid(worksheet), worksheet.name)
          chosenSheet = worksheet.name
          break
        } catch (error) {
          candidateErrors.push(worksheet.name + ': ' + (error instanceof Error ? error.message : 'struktur tidak dikenali'))
        }
      }
      if (!parsed) throw new Error('Sheet sumber Realcost tidak ditemukan. ' + candidateErrors.slice(0, 3).join(' | '))
      if (parsed.findings.invalid_rows > 0) {
        parsed.findings.errors.unshift('Impor diblokir sampai seluruh baris sumber diperbaiki. Baris yang tidak valid tidak diabaikan otomatis.')
      }
      setPrepared(parsed)
      setMessage('Workbook ' + selected.name + ' berhasil dibaca. Periksa hasil validasi sebelum impor.')
      if (chosenSheet !== parsed.findings.sheet_name) setMessage('Nama sheet sumber tidak konsisten. Muat ulang workbook.')
    } catch (error) {
      setPrepared(null)
      setMessage(error instanceof Error ? error.message : 'Workbook Realcost tidak dapat dibaca.')
    } finally {
      setBusy(false)
    }
  }

  const importWorkbook = async () => {
    if (!prepared || !file || busy || !canImport) return
    if (prepared.findings.invalid_rows > 0) {
      setMessage('Impor dihentikan karena terdapat baris tidak valid atau kunci episode berulang.')
      return
    }
    setBusy(true)
    setProgress(0)
    setMessage('Memvalidasi sumber dan menyiapkan batch impor...')
    let importId: string | null = null
    try {
      const { data: userResult, error: userError } = await sb.auth.getUser()
      if (userError || !userResult.user) throw new Error('Sesi login tidak tersedia.')
      const sourceHash = await hashRealcostWorkbook(await file.arrayBuffer())
      const { data: duplicate, error: duplicateError } = await db.from('realcost_imports')
        .select('id')
        .eq('source_sha256', sourceHash)
        .eq('status', 'completed')
        .limit(1)
        .maybeSingle()
      if (duplicateError) throw duplicateError
      if (duplicate) throw new Error('Workbook dengan isi yang sama sudah pernah berhasil diimpor. Gunakan file sumber yang berbeda atau pilih versi yang sudah tersimpan.')

      const { data: createdImport, error: createError } = await db.from('realcost_imports').insert({
        source_name: file.name.slice(0, 180),
        source_sheet: prepared.findings.sheet_name,
        source_sha256: sourceHash,
        period_start: prepared.findings.period_start || null,
        period_end: prepared.findings.period_end || null,
        source_rows: prepared.findings.source_rows,
        imported_rows: 0,
        status: 'processing',
        imported_by: userResult.user.id,
      }).select('id').single()
      if (createError || !createdImport) throw createError ?? new Error('Metadata impor tidak dapat dibuat.')
      importId = createdImport.id as string

      const episodeRows = prepared.episodes.map(episode => ({ ...episode, import_id: importId }))
      const identityRows = prepared.identities
      const batches = Math.ceil(episodeRows.length / BATCH_SIZE)
      for (let start = 0; start < episodeRows.length; start += BATCH_SIZE) {
        const episodeBatch = episodeRows.slice(start, start + BATCH_SIZE)
        const identityBatch = identityRows.slice(start, start + BATCH_SIZE)
        const { error: episodeError } = await db.from('realcost_episodes').insert(episodeBatch)
        if (episodeError) throw new Error('Batch episode ' + (Math.floor(start / BATCH_SIZE) + 1) + ' gagal: ' + episodeError.message)
        const { error: identityError } = await db.from('realcost_patient_identity').insert(identityBatch)
        if (identityError) throw new Error('Batch pemisahan identitas ' + (Math.floor(start / BATCH_SIZE) + 1) + ' gagal: ' + identityError.message)
        setProgress(Math.min(95, Math.round(((start / BATCH_SIZE + 1) / batches) * 95)))
      }
      const { error: completeError } = await db.from('realcost_imports').update({
        imported_rows: episodeRows.length,
        status: 'completed',
        completed_at: new Date().toISOString(),
        failure_note: '',
      }).eq('id', importId)
      if (completeError) throw completeError
      setProgress(100)
      setPrepared(null)
      setFile(null)
      setMessage('Impor berhasil. ' + episodeRows.length.toLocaleString('id-ID') + ' episode telah divalidasi dan disimpan.')
      await loadDashboard()
    } catch (error) {
      const note = error instanceof Error ? error.message : 'Impor Realcost gagal.'
      if (importId) {
        await db.from('realcost_imports').update({ status: 'failed', failure_note: note.slice(0, 500) }).eq('id', importId)
      }
      setMessage(note + ' Data batch yang gagal tidak ditampilkan sebagai sumber analisis aktif.')
    } finally {
      setBusy(false)
    }
  }

  const openIdentity = async (episode: RealcostEpisode) => {
    if (!canReadIdentity || !canReadDetail || identityBusy) return
    setIdentityBusy(true)
    setIdentity(null)
    try {
      const allowed = await requestSensitiveAccess('patient_identity', episode.id, 'Melihat identitas episode Audit Realcost')
      if (!allowed) return
      const { data, error } = await db.from('realcost_patient_identity')
        .select('episode_id,patient_name,medical_record_number,sep_number,insurance_number,attending_physician,coder_id')
        .eq('episode_id', episode.id)
        .maybeSingle()
      if (error) throw error
      setIdentity((data as RealcostPatientIdentity | null) ?? null)
      if (!data) setMessage('Identitas pasien tidak tersedia pada episode ini.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Identitas pasien tidak dapat ditampilkan.')
    } finally {
      setIdentityBusy(false)
    }
  }

  const topComponent = summary?.cost_components?.[0]
  const monthlyMax = Math.max(1, ...(summary?.monthly ?? []).map(item => item.episodes))
  const topComponentMax = Math.max(1, ...(summary?.cost_components ?? []).map(item => item.total))
  const detailTotalPages = Math.max(1, Math.ceil(detailCount / PAGE_SIZE))
  const classOptions = useMemo(() => summary?.class_distribution?.map(item => item.class_code) ?? [], [summary])

  const renderOverview = () => (
    <div style={{ display: 'grid', gap: 16 }}>
      {loading ? <EmptyPanel title="Memuat Visual Intelligence Audit Realcost" detail="Membaca impor terakhir dan menghitung agregat yang tersimpan." /> :
        accessError ? <EmptyPanel title="Akses analisis belum tersedia" detail={accessError} /> :
        !summary || !latestImport ? <EmptyPanel title="Belum ada sumber Realcost" detail="Belum ada workbook Realcost yang selesai diimpor. Buka Audit Realcost untuk mengunggah sumber data yang telah disetujui." /> :
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={mutedStyle()}>Sumber analisis: {latestImport.source_name} · Sheet {latestImport.source_sheet} · {dateLabel(latestImport.period_start)} sampai {dateLabel(latestImport.period_end)}</div>
            <div style={{ ...mutedStyle(), fontVariantNumeric: 'tabular-nums' }}>Diimpor {dateTimeLabel(latestImport.completed_at)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', gap: 12 }}>
            <StatCard label="Episode pelayanan" value={number(summary.episode_count)} detail="Berdasarkan tanggal keluar" />
            <StatCard label="Total TARIF_RS" value={money(summary.tarif_rs_total)} detail="Nilai pada sumber Realcost" />
            <StatCard label="Total tarif INA-CBG" value={money(summary.tarif_inacbg_total)} detail="Nilai paket INA-CBG" />
            <StatCard label="Selisih TARIF_RS − INA-CBG" value={money(summary.tarif_gap_total)} detail="Perbedaan nilai, bukan otomatis rugi/laba" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
            <section style={cardStyle()}>
              <div style={titleStyle()}>Struktur komponen biaya tertinggi</div>
              <div style={{ ...mutedStyle(), marginTop: 4 }}>Porsi terhadap total TARIF_RS</div>
              {summary.cost_components.slice(0, 6).map(item => (
                <div key={item.code} style={{ marginTop: 13 }}>
                  <Bar value={item.total} max={topComponentMax} label={REALCOST_COST_COMPONENTS.find(component => component.key === item.code)?.label ?? item.code} detail={number(item.share_pct, 1) + '%'} />
                </div>
              ))}
              {topComponent && <div style={{ ...mutedStyle(), marginTop: 14 }}>Komponen terbesar: {REALCOST_COST_COMPONENTS.find(item => item.key === topComponent.code)?.label ?? topComponent.code} ({money(topComponent.total)}).</div>}
            </section>
            <section style={cardStyle()}>
              <div style={titleStyle()}>Volume episode per bulan pulang</div>
              <div style={{ ...mutedStyle(), marginTop: 4 }}>Distribusi episode menurut bulan tanggal keluar</div>
              {summary.monthly.map(item => (
                <div key={item.month} style={{ marginTop: 12 }}>
                  <Bar value={item.episodes} max={monthlyMax} label={new Date(item.month + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })} detail={number(item.episodes)} />
                </div>
              ))}
            </section>
          </div>
          <section style={cardStyle()}>
            <div style={titleStyle()}>Indikator utilisasi pelayanan</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginTop: 14 }}>
              <div><div style={mutedStyle()}>Rata-rata LOS</div><strong style={{ fontSize: 20 }}>{number(summary.average_los, 2)} hari</strong></div>
              <div><div style={mutedStyle()}>Median LOS</div><strong style={{ fontSize: 20 }}>{number(summary.median_los, 0)} hari</strong></div>
              <div><div style={mutedStyle()}>Median TARIF_RS / episode</div><strong style={{ fontSize: 20 }}>{money(summary.median_tarif_rs)}</strong></div>
              <div><div style={mutedStyle()}>P90 TARIF_RS / episode</div><strong style={{ fontSize: 20 }}>{money(summary.p90_tarif_rs)}</strong></div>
              <div><div style={mutedStyle()}>TARIF_RS per hari rawat</div><strong style={{ fontSize: 20 }}>{money(summary.tarif_rs_per_los_day)}</strong></div>
              <div><div style={mutedStyle()}>Persentil ke-90 LOS</div><strong style={{ fontSize: 20 }}>{number(summary.p90_los, 1)} hari</strong></div>
              <div><div style={mutedStyle()}>Episode ICU</div><strong style={{ fontSize: 20 }}>{number(summary.icu_episode_count)} ({number(summary.icu_episode_rate, 1)}%)</strong></div>
            </div>
          </section>
        </>}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button type="button" style={buttonStyle(true, loading)} disabled={loading} onClick={() => void openAuditWorkspace()}>Lihat Audit Realcost</button>
      </div>
    </div>
  )

  const renderImportPanel = () => (
    <section style={cardStyle()}>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink, #0b1f33)' }}>Impor sumber data Realcost (.xlsx)</div>
      <p style={{ ...mutedStyle(), margin: '6px 0 12px' }}>
        Workbook dibaca di browser. Berkas mentah tidak diunggah sebagai file; data episode disimpan terstruktur, sedangkan identitas pasien ditempatkan pada tabel terpisah dengan kontrol akses.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={beginFileRead} style={{ maxWidth: '100%' }} />
        <span style={mutedStyle()}>Maksimal 15 MB · Semua worksheet diperiksa untuk menemukan tabel episode.</span>
      </div>
      {busy && <div style={{ ...mutedStyle(), marginTop: 10 }}>Proses: {progress > 0 ? progress + '%' : 'membaca dan memvalidasi workbook'} </div>}
      {prepared && <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 650 }}>Pratinjau pemeriksaan workbook</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8 }}>
          <StatCard label="Worksheet sumber" value={prepared.findings.sheet_name} />
          <StatCard label="Baris sumber" value={number(prepared.findings.source_rows)} />
          <StatCard label="Episode valid" value={number(prepared.findings.valid_rows)} />
          <StatCard label="Baris tidak valid" value={number(prepared.findings.invalid_rows)} />
          <StatCard label="Kunci episode berulang" value={number(prepared.findings.duplicate_episode_keys)} />
          <StatCard label="Periode pulang" value={dateLabel(prepared.findings.period_start) + ' – ' + dateLabel(prepared.findings.period_end)} />
        </div>
        <div style={{ ...mutedStyle(), display: 'grid', gap: 4 }}>
          <div>Rekonsiliasi komponen biaya vs TARIF_RS: {number(prepared.findings.cost_component_mismatches)} episode berbeda.</div>
          <div>Rekonsiliasi C2 billing_group vs komponen: {number(prepared.findings.c2_billing_group_mismatches)} episode berbeda.</div>
          <div>Rekonsiliasi total_tarif_rs pada C2 vs TARIF_RS: {number(prepared.findings.c2_tarif_mismatches)} episode berbeda.</div>
          <div>TOTAL_TARIF berbeda dari TARIF_INACBG + TARIF_POLI_EKS: {number(prepared.findings.total_tarif_package_exceptions)} episode.</div>
        </div>
        {prepared.findings.errors.length > 0 && <div style={{ border: '1px solid #b45309', borderRadius: 8, padding: 10, color: '#854d0e', background: '#fffbeb' }}>
          <strong>Impor diblokir:</strong>
          {prepared.findings.errors.slice(0, 8).map((item, index) => <div key={index} style={{ ...mutedStyle(), color: 'inherit', marginTop: 4 }}>{item}</div>)}
        </div>}
        {prepared.findings.warnings.length > 0 && <div style={{ border: '1px solid var(--line, #cbd7e2)', borderRadius: 8, padding: 10 }}>
          <strong style={{ fontSize: 12 }}>Catatan validasi</strong>
          {prepared.findings.warnings.slice(0, 10).map((item, index) => <div key={index} style={{ ...mutedStyle(), marginTop: 4 }}>{item}</div>)}
        </div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" style={buttonStyle()} disabled={busy} onClick={() => { setPrepared(null); setFile(null); setMessage('Pratinjau impor dibatalkan.') }}>Batalkan pratinjau</button>
          <button type="button" style={buttonStyle(true, busy || prepared.findings.invalid_rows > 0 || prepared.findings.valid_rows === 0)} disabled={busy || prepared.findings.invalid_rows > 0 || prepared.findings.valid_rows === 0} onClick={() => void importWorkbook()}>
            {busy ? 'Mengimpor...' : 'Impor ' + number(prepared.findings.valid_rows) + ' episode'}
          </button>
        </div>
      </div>}
      {message && <div role="status" style={{ ...mutedStyle(), marginTop: 10, color: message.toLowerCase().includes('gagal') || message.toLowerCase().includes('diblokir') ? '#b42318' : 'var(--ink, #0b1f33)' }}>{message}</div>}
    </section>
  )

  const renderEpisodes = () => {
    if (!canReadDetail) return <EmptyPanel title="Rincian episode dibatasi" detail="Role ini hanya dapat melihat analisis agregat. Hak realcost.read.detail diberikan secara terpisah untuk menjaga kerahasiaan rincian episode." />
    return <div style={{ display: 'grid', gap: 12 }}>
      <section style={cardStyle()}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 5, flex: '1 1 220px' }}>
            <span style={mutedStyle()}>Cari kode atau deskripsi INA-CBG</span>
            <input value={detailSearch} onChange={event => { setDetailSearch(event.target.value); setDetailPage(0) }} placeholder="Masukkan kode/deskripsi INA-CBG" style={{ minHeight: 42, border: '1px solid var(--line, #cbd7e2)', borderRadius: 9, padding: '8px 10px', fontSize: 14 }} />
          </label>
          <label style={{ display: 'grid', gap: 5, flex: '0 1 155px' }}>
            <span style={mutedStyle()}>Kelas rawat</span>
            <select value={classFilter} onChange={event => { setClassFilter(event.target.value); setDetailPage(0) }} style={{ minHeight: 42, border: '1px solid var(--line, #cbd7e2)', borderRadius: 9, padding: '8px 10px', fontSize: 14 }}>
              <option value="">Semua kelas</option>
              {classOptions.map(item => <option value={item} key={item}>Kelas {item}</option>)}
            </select>
          </label>
          <div style={{ ...mutedStyle(), alignSelf: 'center' }}>{number(detailCount)} episode sesuai filter</div>
        </div>
      </section>
      {detailLoading ? <EmptyPanel title="Memuat episode" detail="Mengambil halaman data episode dari sumber yang dipilih." /> :
        detailRows.length === 0 ? <EmptyPanel title="Episode tidak ditemukan" detail="Tidak ada episode sesuai filter pencarian ini." /> :
        <section style={{ ...cardStyle(), padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900, fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--surface-muted, #edf3f8)', textAlign: 'left' }}>
                {['Tanggal keluar', 'INA-CBG', 'Kelas', 'LOS', 'TARIF_RS', 'Tarif INA-CBG', 'Selisih'].map(label => <th key={label} style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>{label}</th>)}
              </tr></thead>
              <tbody>{detailRows.map(row => {
                const gap = Number(row.tarif_rs) - Number(row.tariff_inacbg)
                return <tr key={row.id} onClick={() => { setSelectedEpisode(row); setIdentity(null) }} style={{ borderTop: '1px solid var(--line, #e0e7ef)', cursor: 'pointer', background: selectedEpisode?.id === row.id ? 'var(--surface-muted, #edf3f8)' : 'transparent' }}>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{dateLabel(row.discharge_date)}</td>
                  <td style={{ padding: '10px 12px' }}><strong>{row.inacbg_code}</strong><div style={mutedStyle()}>{row.inacbg_description}</div></td>
                  <td style={{ padding: '10px 12px' }}>{row.class_code}</td>
                  <td style={{ padding: '10px 12px' }}>{number(row.los, 0)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{money(row.tarif_rs)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{money(row.tariff_inacbg)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: gap >= 0 ? '#166534' : '#b42318' }}>{money(gap)}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTop: '1px solid var(--line, #dbe4ec)', gap: 10 }}>
            <span style={mutedStyle()}>Halaman {detailPage + 1} dari {detailTotalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={buttonStyle(false, detailPage <= 0 || detailLoading)} disabled={detailPage <= 0 || detailLoading} onClick={() => setDetailPage(value => Math.max(0, value - 1))}>Sebelumnya</button>
              <button type="button" style={buttonStyle(false, detailPage + 1 >= detailTotalPages || detailLoading)} disabled={detailPage + 1 >= detailTotalPages || detailLoading} onClick={() => setDetailPage(value => value + 1)}>Berikutnya</button>
            </div>
          </div>
        </section>}
      {selectedEpisode && <section style={cardStyle()}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'start', justifyContent: 'space-between' }}>
          <div><strong>Detail episode</strong><div style={mutedStyle()}>Baris sumber Excel {selectedEpisode.source_row} · {selectedEpisode.inacbg_code} · Kelas {selectedEpisode.class_code}</div></div>
          <button type="button" style={buttonStyle()} onClick={() => { setSelectedEpisode(null); setIdentity(null) }}>Tutup detail</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, marginTop: 14 }}>
          <div><div style={mutedStyle()}>Tanggal masuk</div><strong>{dateLabel(selectedEpisode.admission_date)}</strong></div>
          <div><div style={mutedStyle()}>Tanggal keluar</div><strong>{dateLabel(selectedEpisode.discharge_date)}</strong></div>
          <div><div style={mutedStyle()}>LOS</div><strong>{number(selectedEpisode.los)} hari</strong></div>
          <div><div style={mutedStyle()}>ICU</div><strong>{selectedEpisode.icu_indicator ? 'Ya · ' + number(selectedEpisode.icu_los) + ' hari' : 'Tidak'}</strong></div>
          <div><div style={mutedStyle()}>Status pulang (kode)</div><strong>{selectedEpisode.discharge_status || '-'}</strong></div>
          <div><div style={mutedStyle()}>Prosedur ventilasi</div><strong>{number(selectedEpisode.vent_hour, 1)} jam</strong></div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 7 }}>
          <strong style={{ fontSize: 13 }}>Komponen biaya episode</strong>
          {REALCOST_COST_COMPONENTS.map(component => <div key={component.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--line, #e5ebf0)', padding: '5px 0', fontSize: 13 }}>
            <span>{component.label}</span><strong>{money(Number(selectedEpisode.cost_components?.[component.key] ?? 0))}</strong>
          </div>)}
        </div>
        <div style={{ ...mutedStyle(), marginTop: 12 }}>Diagnosis: {(selectedEpisode.diagnosis_codes ?? []).join(', ') || '-'}</div>
        <div style={mutedStyle()}>Prosedur: {(selectedEpisode.procedure_codes ?? []).join(', ') || '-'}</div>
        {canReadIdentity && <div style={{ marginTop: 14 }}>
          <button type="button" style={buttonStyle(false, identityBusy)} disabled={identityBusy} onClick={() => void openIdentity(selectedEpisode)}>{identityBusy ? 'Memeriksa hak akses...' : 'Tampilkan identitas pasien (akses tercatat)'}</button>
          {identity && <div style={{ marginTop: 10, border: '1px solid var(--line, #cbd7e2)', borderRadius: 9, padding: 12 }}>
            <strong>Identitas pasien</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 9, marginTop: 8, fontSize: 13 }}>
              <div><span style={mutedStyle()}>Nama</span><div>{identity.patient_name || '-'}</div></div>
              <div><span style={mutedStyle()}>No. Rekam Medis</span><div>{identity.medical_record_number || '-'}</div></div>
              <div><span style={mutedStyle()}>SEP</span><div>{identity.sep_number || '-'}</div></div>
              <div><span style={mutedStyle()}>No. kartu</span><div>{identity.insurance_number || '-'}</div></div>
              <div><span style={mutedStyle()}>DPJP</span><div>{identity.attending_physician || '-'}</div></div>
              <div><span style={mutedStyle()}>Coder ID</span><div>{identity.coder_id || '-'}</div></div>
            </div>
          </div>}
        </div>}
      </section>}
      {message && <div role="status" style={mutedStyle()}>{message}</div>}
    </div>
  }

  const renderDetailContent = () => {
    if (!summary || !latestImport) return <EmptyPanel title="Belum ada data Audit Realcost" detail="Impor workbook sumber terlebih dahulu untuk membangun analisis terstruktur." />
    if (detailTab === 'episodes') return renderEpisodes()
    if (detailTab === 'components') return <div style={{ display: 'grid', gap: 10 }}>
      <section style={cardStyle()}>
        <strong>Seluruh 18 komponen biaya</strong>
        <p style={{ ...mutedStyle(), margin: '6px 0 12px' }}>Kontribusi komponen terhadap total TARIF_RS. Nilai disajikan sesuai data sumber, bukan penilaian efisiensi atau kewajaran harga.</p>
        {summary.cost_components.map(item => (
          <div key={item.code} style={{ marginTop: 13 }}>
            <Bar value={item.total} max={topComponentMax} label={REALCOST_COST_COMPONENTS.find(component => component.key === item.code)?.label ?? item.code} detail={money(item.total) + ' · ' + number(item.share_pct, 2) + '%'} />
          </div>
        ))}
      </section>
    </div>
    if (detailTab === 'diagnosis') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
      <section style={cardStyle()}>
        <strong>Diagnosis terbanyak (DIAGLIST)</strong>
        <p style={{ ...mutedStyle(), margin: '6px 0 12px' }}>Frekuensi diagnosis per episode. Satu kode dihitung maksimal satu kali dalam episode yang sama.</p>
        {summary.top_diagnoses.length ? summary.top_diagnoses.map((item, index) => (
          <div key={item.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--line, #e5ebf0)', padding: '8px 0', fontSize: 13 }}>
            <span>{index + 1}. {item.code}</span><strong>{number(item.episodes)} episode</strong>
          </div>
        )) : <div style={mutedStyle()}>Tidak terdapat kode diagnosis pada sumber impor.</div>}
      </section>
      <section style={cardStyle()}>
        <strong>Prosedur terbanyak (PROCLIST)</strong>
        <p style={{ ...mutedStyle(), margin: '6px 0 12px' }}>Frekuensi kode prosedur per episode. Satu kode dihitung maksimal satu kali dalam episode yang sama.</p>
        {summary.top_procedures.length ? summary.top_procedures.map((item, index) => (
          <div key={item.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--line, #e5ebf0)', padding: '8px 0', fontSize: 13 }}>
            <span>{index + 1}. {item.code}</span><strong>{number(item.episodes)} episode</strong>
          </div>
        )) : <div style={mutedStyle()}>Tidak terdapat kode prosedur pada sumber impor.</div>}
      </section>
    </div>
    if (detailTab === 'inacbg') return <section style={{ ...cardStyle(), padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 14 }}><strong>Distribusi kasus menurut kelompok INA-CBG</strong><div style={mutedStyle()}>Urutan berdasarkan volume episode, bukan ranking mutu klinis.</div></div>
      <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780, fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--surface-muted, #edf3f8)', textAlign: 'left' }}>{['Kode INA-CBG', 'Deskripsi', 'Episode', 'Rata-rata LOS', 'TARIF_RS', 'Tarif INA-CBG', 'Selisih'].map(label => <th key={label} style={{ padding: 10 }}>{label}</th>)}</tr></thead>
        <tbody>{summary.top_inacbg.map(item => <tr key={item.code} style={{ borderTop: '1px solid var(--line, #dbe4ec)' }}>
          <td style={{ padding: 10, whiteSpace: 'nowrap' }}><strong>{item.code}</strong></td><td style={{ padding: 10 }}>{item.description}</td>
          <td style={{ padding: 10 }}>{number(item.episodes)}</td><td style={{ padding: 10 }}>{number(item.average_los, 2)}</td>
          <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{money(item.tarif_rs)}</td><td style={{ padding: 10, whiteSpace: 'nowrap' }}>{money(item.tarif_inacbg)}</td><td style={{ padding: 10, whiteSpace: 'nowrap' }}>{money(item.gap)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    return <div style={{ display: 'grid', gap: 12 }}>
      <section style={cardStyle()}>
        <strong>Rekonsiliasi dan kontrol kualitas data</strong>
        <p style={{ ...mutedStyle(), margin: '6px 0 12px' }}>Kontrol dihitung ulang dari kolom sumber, bukan dari interpretasi tarif.</p>
        {[
          ['Total 18 komponen biaya sama dengan TARIF_RS', summary.reconciliation.component_total_mismatch_count, 'episode berbeda'],
          ['C2 billing_group sama dengan kolom komponen', summary.reconciliation.c2_billing_group_mismatch_count, 'episode berbeda'],
          ['C2 total_tarif_rs sama dengan TARIF_RS', summary.reconciliation.c2_total_tarif_mismatch_count, 'episode berbeda'],
          ['TOTAL_TARIF sama dengan TARIF_INACBG + TARIF_POLI_EKS', summary.reconciliation.total_tarif_vs_package_mismatch_count, 'episode berbeda'],
        ].map(([label, value, unit]) => <div key={String(label)} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--line, #e5ebf0)', padding: '11px 0' }}>
          <span style={{ fontSize: 13 }}>{label}</span>
          <strong style={{ color: Number(value) === 0 ? '#166534' : '#b42318' }}>{number(Number(value))} {unit}</strong>
        </div>)}
      </section>
      <section style={cardStyle()}>
        <strong>Distribusi selisih tarif</strong>
        <p style={{ ...mutedStyle(), margin: '6px 0 12px' }}>Selisih didefinisikan sebagai TARIF_RS dikurangi tarif INA-CBG. Nilai positif dan negatif ditampilkan terpisah.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
          <StatCard label="Episode TARIF_RS di atas INA-CBG" value={number(summary.tarif_gap_positive_count)} detail={money(summary.tarif_gap_positive_total)} />
          <StatCard label="Episode TARIF_RS di bawah INA-CBG" value={number(summary.tarif_gap_negative_count)} detail={money(summary.tarif_gap_negative_total)} />
        </div>
      </section>
      <section style={cardStyle()}>
        <strong>Distribusi kelas rawat</strong>
        {summary.class_distribution.map(item => <div key={item.class_code} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--line, #e5ebf0)', padding: '10px 0' }}>
          <span style={{ fontSize: 13 }}>Kelas {item.class_code} · {number(item.episodes)} episode</span>
          <span style={{ ...mutedStyle(), textAlign: 'right' }}>LOS rata-rata {number(item.average_los, 2)} hari · {money(item.tarif_rs)} TARIF_RS</span>
        </div>)}
      </section>
    </div>
  }

  return <main style={{ display: 'grid', gap: 16, paddingBottom: 28 }}>
    {!detailMode ? <>
      <header>
        <div style={{ ...mutedStyle(), fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>Peningkatan Kinerja Klinis</div>
        <h2 style={{ fontSize: 22, color: 'var(--ink, #0b1f33)', margin: '5px 0 6px' }}>Visual Intelligence Audit Realcost</h2>
        <p style={{ ...mutedStyle(), maxWidth: 900, fontSize: 13 }}>Analisis biaya pelayanan, struktur komponen, variasi tarif INA-CBG, utilisasi sumber daya, serta rekonsiliasi setiap episode berdasarkan workbook Realcost rumah sakit.</p>
      </header>
      {renderOverview()}
    </> : <>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ ...mutedStyle(), fontWeight: 700 }}>Peningkatan Kinerja Klinis / Audit Realcost</div>
          <h2 style={{ fontSize: 22, color: 'var(--ink, #0b1f33)', margin: '5px 0 6px' }}>Audit Realcost</h2>
          <p style={{ ...mutedStyle(), maxWidth: 820 }}>Audit episode pelayanan dan rekonsiliasi nilai biaya dengan tarif INA-CBG.</p>
        </div>
        <button type="button" style={buttonStyle()} onClick={() => setDetailMode(false)}>Kembali ke ikhtisar</button>
      </header>
      {latestImport && <section style={{ ...cardStyle(), display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div><strong>{latestImport.source_name}</strong><div style={mutedStyle()}>Sheet {latestImport.source_sheet} · {number(latestImport.imported_rows)} episode · {dateLabel(latestImport.period_start)} sampai {dateLabel(latestImport.period_end)}</div></div>
        <div style={mutedStyle()}>Selesai diimpor: {dateTimeLabel(latestImport.completed_at)}</div>
      </section>}
      {canImport && renderImportPanel()}
      {!canImport && <div style={mutedStyle()}>Unggah workbook hanya tersedia bagi pengguna dengan hak realcost.import.</div>}
      {latestImport && summary && <section style={{ display: 'grid', gap: 12 }}>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} aria-label="Navigasi Audit Realcost">
          {([
            ['episodes', 'Daftar episode'],
            ['components', 'Komponen biaya'],
            ['inacbg', 'Analisis INA-CBG'],
            ['diagnosis', 'Diagnosis & Prosedur'],
            ['reconciliation', 'Rekonsiliasi'],
          ] as Array<[DetailTab, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={detailTab === id} onClick={() => void changeDetailTab(id)} style={{
            ...buttonStyle(detailTab === id), minHeight: 40, padding: '8px 13px',
          }}>{label}</button>)}
        </nav>
        {renderDetailContent()}
      </section>}
      {!latestImport && !loading && <EmptyPanel title="Belum ada sumber data" detail="Gunakan panel impor untuk mengunggah workbook Realcost yang telah disetujui. Sumber aktif akan muncul setelah semua batch selesai disimpan." />}
      {message && !canImport && <div role="status" style={mutedStyle()}>{message}</div>}
    </>}
    <div style={{ ...mutedStyle(), borderTop: '1px solid var(--line, #dbe4ec)', paddingTop: 10 }}>
      Catatan metodologis: TARIF_RS dan komponen biaya ditampilkan mengikuti definisi workbook sumber. Selisih terhadap tarif INA-CBG tidak disebut kerugian atau laba sebelum definisi akuntansi, basis biaya, dan aturan klaim diverifikasi bersama unit keuangan serta casemix.
    </div>
  </main>
}
