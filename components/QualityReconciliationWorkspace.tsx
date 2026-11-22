'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { aurekaSupabase } from '@/lib/aureka/supabase'

type Room = { id: number; name: string }
type MasterOption = { code?: number | null; label?: string; review_required?: boolean; numerator?: boolean | null; denominator?: boolean | null }
type ResponseGroup = {
  room_id: number
  room_name: string
  profile_year: number
  indicator_id: string
  indicator_code: string
  indicator_title: string
  source_label: string
  source_code: string | null
  mapping_status: string
  affected_count: number
  auto_fixable: boolean
  suggested_target_label: string | null
  suggested_target_code: number | null
  options: MasterOption[]
}
type WarningGroup = {
  room_id: number
  room_name: string
  profile_year: number
  warning_hash: string
  warning_text: string
  affected_count: number
  pending_count: number
  needs_source_correction_count: number
  safe_derived_value: boolean
  safe_existing_data?: boolean
  verified_count?: number
  verification_total?: number
}
type AuditItem = {
  id: string
  room_id: number
  profile_year: number
  action_type: string
  source_label: string | null
  source_code: string | null
  target_label: string | null
  target_code: number | null
  decision_note: string
  affected_record?: string | null
  created_at: string
}
type QueuePayload = {
  profile_year: number
  summary?: {
    response_group_count?: number
    response_record_count?: number
    auto_fixable_group_count?: number
    auto_fixable_record_count?: number
    warning_group_count?: number
    warning_record_count?: number
  }
  response_groups?: ResponseGroup[]
  warning_groups?: WarningGroup[]
  recent_audit?: AuditItem[]
}
type ManualDraft = { open: boolean; option: string; reason: string }
type WarningDraft = { reason: string }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const optionValue = (option: MasterOption) => JSON.stringify({ label: String(option.label ?? ''), code: Number(option.code) })
const parseOption = (value: string): { label: string; code: number } | null => {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed?.label === 'string' && Number.isInteger(parsed?.code) && parsed.code >= 1 && parsed.code <= 3
      ? { label: parsed.label, code: parsed.code }
      : null
  } catch { return null }
}
const groupKey = (item: ResponseGroup) => JSON.stringify([
  item.room_id, item.profile_year, item.indicator_id, item.source_label, item.source_code,
])
const warningKey = (item: WarningGroup) => JSON.stringify([
  item.room_id, item.profile_year, item.warning_hash,
])
const count = (value: unknown) => Number(value ?? 0).toLocaleString('id-ID')
const dateLabel = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Waktu tidak tersedia'
    : parsed.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Pontianak' })
}
const actionLabel: Record<string, string> = {
  response_auto_mapped: 'Pemetaan otomatis',
  response_manually_mapped: 'Pemetaan manual PMKP',
  warning_accepted_derived_value: 'Nilai turunan diterima',
  warning_marked_source_correction: 'Ditandai perlu koreksi sumber',
}

export default function QualityReconciliationWorkspace({
  rooms,
  initialRoomId,
  role,
}: {
  rooms: Room[]
  initialRoomId: number | null
  role: string | null
}) {
  const [year, setYear] = useState(2026)
  const [roomId, setRoomId] = useState<number | null>(initialRoomId)
  const [queue, setQueue] = useState<QueuePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [manualDrafts, setManualDrafts] = useState<Record<string, ManualDraft>>({})
  const [warningDrafts, setWarningDrafts] = useState<Record<string, WarningDraft>>({})
  const [showAudit, setShowAudit] = useState(false)

  const canManage = role === 'ADMIN' || role === 'PMKP'
  const responseGroups = queue?.response_groups ?? []
  const warningGroups = queue?.warning_groups ?? []
  const recentAudit = queue?.recent_audit ?? []
  const summary = queue?.summary ?? {}
  const totalPending = Number(summary.response_record_count ?? responseGroups.reduce((n, item) => n + item.affected_count, 0))
  const totalAuto = Number(summary.auto_fixable_record_count ?? responseGroups.filter(item => item.auto_fixable).reduce((n, item) => n + item.affected_count, 0))
  const totalManual = Math.max(0, totalPending - totalAuto)
  const totalWarnings = Number(summary.warning_record_count ?? warningGroups.reduce((n, item) => n + item.affected_count, 0))

  useEffect(() => setRoomId(initialRoomId), [initialRoomId])

  const load = useCallback(async (quiet = false) => {
    if (!canManage) {
      setError('Akses Pusat Rekonsiliasi Data hanya tersedia untuk Admin dan Komite PMKP.')
      setLoading(false)
      return
    }
    if (!quiet) setLoading(true)
    setError('')
    try {
      const { data, error: rpcError } = await q().rpc('quality_reconciliation_list_v2', {
        p_profile_year: year,
        p_room_id: roomId,
      })
      if (rpcError) throw rpcError
      setQueue((data ?? null) as QueuePayload | null)
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Antrean rekonsiliasi belum dapat dimuat. Periksa koneksi dan hak akses.' }))
    } finally {
      setLoading(false)
    }
  }, [canManage, year, roomId])

  useEffect(() => { void load() }, [load])

  const optionsFor = useCallback((item: ResponseGroup) =>
    (item.options ?? []).filter(option => Number.isInteger(Number(option.code)) && Number(option.code) >= 1 && Number(option.code) <= 3 && String(option.label ?? '').trim()),
  [])

  const setManual = (key: string, patch: Partial<ManualDraft>) => {
    setManualDrafts(current => {
      const existing: ManualDraft = current[key] ?? { open: false, option: '', reason: '' }
      return { ...current, [key]: { ...existing, ...patch } }
    })
  }
  const setWarningReason = (key: string, reason: string) => {
    setWarningDrafts(current => ({ ...current, [key]: { reason } }))
  }

  const applyResponseGroup = async (item: ResponseGroup, action: 'auto_exact' | 'manual') => {
    const key = groupKey(item)
    let targetLabel = item.suggested_target_label ?? ''
    let targetCode = Number(item.suggested_target_code)
    let reason = 'Pemetaan otomatis berdasarkan kecocokan label sumber yang unik dan kode konsisten.'
    if (action === 'manual') {
      const draft = manualDrafts[key]
      const target = parseOption(draft?.option ?? '')
      if (!target) {
        setError('Pilih satu opsi master berkode 1, 2, atau 3 sebelum menerapkan pemetaan.')
        return
      }
      if (String(draft?.reason ?? '').trim().length < 10) {
        setError('Alasan keputusan manual minimal 10 karakter.')
        return
      }
      targetLabel = target.label
      targetCode = target.code
      reason = draft.reason.trim()
    } else if (!item.auto_fixable || !targetLabel || !Number.isInteger(targetCode)) {
      setError('Pemetaan otomatis tidak tersedia untuk pola sumber ini.')
      return
    }

    const actionText = action === 'auto_exact' ? 'memetakan otomatis' : 'menerapkan pemetaan manual'
    const confirmed = window.confirm(
      'AUREKA akan ' + actionText + ' ' + count(item.affected_count) + ' respons pada ' +
      item.indicator_code + ' · ' + item.room_name + '. Nilai sumber tetap disimpan dan seluruh perubahan diaudit. Lanjutkan?'
    )
    if (!confirmed) return

    setSavingKey(key); setError(''); setSuccess('')
    try {
      const { data, error: rpcError } = await q().rpc('quality_reconciliation_apply_bulk', {
        p_room_id: item.room_id,
        p_profile_year: item.profile_year,
        p_indicator_id: item.indicator_id,
        p_source_label: item.source_label,
        p_source_code: item.source_code,
        p_target_label: targetLabel,
        p_target_code: targetCode,
        p_action: action,
        p_reason: reason,
      })
      if (rpcError) throw rpcError
      const changed = Number((data as any)?.affected_count ?? 0)
      setSuccess(changed + ' respons berhasil direkonsiliasi pada ' + item.indicator_code + ' · ' + item.room_name + '. Nilai sumber asli tetap dipertahankan.')
      setManualDrafts(current => { const next = { ...current }; delete next[key]; return next })
      await load(true)
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Pemetaan massal gagal. Tidak ada perubahan parsial yang disimpan.' }))
    } finally {
      setSavingKey('')
    }
  }

  const reviewWarningGroup = async (item: WarningGroup, action: 'accept_derived_value' | 'needs_source_correction' | 'accept_verified_existing_data') => {
    const key = warningKey(item)
    const reason = String(warningDrafts[key]?.reason ?? '').trim()
    if (reason.length < 10) {
      setError('Alasan telaah warning minimal 10 karakter.')
      return
    }
    const title = action === 'accept_derived_value'
      ? 'Menerima nilai LOS hasil hitung ulang'
      : action === 'accept_verified_existing_data'
        ? 'Mengonfirmasi data BHP/Linen telah dipulihkan dan diverifikasi'
        : 'Menandai warning perlu koreksi dari workbook sumber'
    const confirmed = window.confirm(
      title + ' untuk ' + count(item.affected_count) + ' episode di ' + item.room_name +
      '? Catatan sumber tidak akan dihapus atau diubah.'
    )
    if (!confirmed) return

    setSavingKey(key); setError(''); setSuccess('')
    try {
      const rpcName = action === 'accept_verified_existing_data'
        ? 'quality_reconciliation_accept_verified_warning'
        : 'quality_reconciliation_review_warning'
      const rpcArgs = action === 'accept_verified_existing_data'
        ? {
            p_room_id: item.room_id,
            p_profile_year: item.profile_year,
            p_warning_hash: item.warning_hash,
            p_warning_text: item.warning_text,
            p_reason: reason,
          }
        : {
            p_room_id: item.room_id,
            p_profile_year: item.profile_year,
            p_warning_hash: item.warning_hash,
            p_warning_text: item.warning_text,
            p_action: action,
            p_reason: reason,
          }
      const { data, error: rpcError } = await q().rpc(rpcName, rpcArgs)
      if (rpcError) throw rpcError
      const result = data as any
      setSuccess(
        action === 'accept_derived_value'
          ? count(result?.affected_count ?? 0) + ' warning formula/LOS diterima karena nilai turunan dihitung ulang dari tanggal sumber.'
          : action === 'accept_verified_existing_data'
            ? count(result?.affected_count ?? 0) + ' warning lama ditutup setelah server memverifikasi data indikator 14.1, header, baris Excel, dan nilai sumber. Nilai asli tidak diubah.'
            : count(result?.affected_count ?? 0) + ' warning ditandai perlu koreksi workbook. Warning tetap tampil sampai sumber diperbaiki.'
      )
      setWarningDrafts(current => { const next = { ...current }; delete next[key]; return next })
      await load(true)
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Telaah warning gagal. Status sumber tidak diubah.' }))
    } finally {
      setSavingKey('')
    }
  }

  const sortedResponseGroups = useMemo(
    () => [...responseGroups].sort((a, b) =>
      Number(b.auto_fixable) - Number(a.auto_fixable) ||
      a.room_name.localeCompare(b.room_name) ||
      a.indicator_code.localeCompare(b.indicator_code, undefined, { numeric: true }) ||
      b.affected_count - a.affected_count
    ),
    [responseGroups],
  )
  const sortedWarningGroups = useMemo(
    () => [...warningGroups].sort((a, b) =>
      Number(b.safe_derived_value) - Number(a.safe_derived_value) ||
      a.room_name.localeCompare(b.room_name) ||
      b.affected_count - a.affected_count
    ),
    [warningGroups],
  )

  return <section className="qrcWorkspace">
    <style>{`
      .qrcWorkspace{display:grid;gap:15px;min-width:0;color:#1d3448}
      .qrcHead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
      .qrcEyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:850;color:#56809a}
      .qrcHead h2{font-size:23px;margin:4px 0;letter-spacing:-.035em}
      .qrcHead p{margin:0;max-width:790px;font-size:12px;line-height:1.55;color:#6b7f90}
      .qrcToolbar{display:flex;align-items:end;gap:9px;flex-wrap:wrap}
      .qrcField{display:grid;gap:4px;font-size:11px;color:#6b7f90;font-weight:750}
      .qrcField select{min-width:130px;min-height:38px;border:1px solid #d8e2e9;border-radius:9px;background:#fff;color:#21384b;padding:7px 10px;font-size:12px}
      .qrcBtn{border:1px solid #d6e1e9;background:#fff;color:#24465d;border-radius:9px;padding:9px 12px;font-size:12px;font-weight:750;cursor:pointer}
      .qrcBtn:disabled{opacity:.48;cursor:not-allowed}
      .qrcBtn.primary{background:#194d71;color:#fff;border-color:#194d71}
      .qrcBtn.success{background:#e8f5ed;border-color:#c9e6d2;color:#216b43}
      .qrcBtn.warning{background:#fff5df;border-color:#efdcae;color:#805d18}
      .qrcStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .qrcStat{border:1px solid #e0e8ee;border-radius:12px;background:#fff;padding:12px 14px;min-width:0}
      .qrcStat small{display:block;color:#75899a;font-size:11px}
      .qrcStat strong{display:block;font-size:24px;letter-spacing:-.03em;margin-top:3px;font-variant-numeric:tabular-nums}
      .qrcStat span{font-size:11px;color:#75899a}
      .qrcPanel{background:#fff;border:1px solid #e0e8ee;border-radius:13px;overflow:hidden;min-width:0}
      .qrcPanelHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid #e8eef2}
      .qrcPanelHead h3{font-size:15px;margin:0}
      .qrcPanelHead p{font-size:11px;color:#6e8292;margin:4px 0 0}
      .qrcTableWrap{overflow:auto}
      .qrcTable{width:100%;min-width:920px;border-collapse:separate;border-spacing:0;font-size:12px}
      .qrcTable th,.qrcTable td{padding:10px 11px;border-bottom:1px solid #edf1f4;text-align:left;vertical-align:top}
      .qrcTable th{background:#f7fafc;color:#647c8f;font-size:11px;font-weight:800;position:sticky;top:0;z-index:1}
      .qrcTable tr:last-child td{border-bottom:0}
      .qrcTable strong{color:#213d51}
      .qrcMuted{display:block;color:#74889a;font-size:11px;line-height:1.45;margin-top:4px;overflow-wrap:anywhere}
      .qrcSource{max-width:410px;overflow-wrap:anywhere;line-height:1.5}
      .qrcBadge{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:7px;font-size:10px;font-weight:850;white-space:nowrap}
      .qrcBadge.good{background:#e7f5eb;color:#236b43}
      .qrcBadge.pending{background:#fff2d9;color:#805b17}
      .qrcBadge.manual{background:#fff0e8;color:#9a5326}
      .qrcActions{display:grid;gap:7px;min-width:230px}
      .qrcActions select,.qrcActions textarea{width:100%;border:1px solid #dce5ec;border-radius:8px;background:#fff;color:#234057;padding:8px;font-size:11px;min-height:35px}
      .qrcActions textarea{min-height:54px;resize:vertical}
      .qrcInline{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .qrcNotice{padding:11px 14px;border:1px solid #f0dfb6;border-radius:10px;background:#fff9eb;color:#795b21;font-size:12px;line-height:1.5}
      .qrcSuccess{padding:10px 13px;border:1px solid #cce8d5;background:#eef8f1;color:#216b43;border-radius:9px;font-size:12px}
      .qrcError{padding:10px 13px;border:1px solid #f1cfcf;background:#fff3f2;color:#8b332d;border-radius:9px;font-size:12px}
      .qrcAuditItem{display:grid;grid-template-columns:160px minmax(0,1fr) auto;gap:10px;padding:10px 14px;border-bottom:1px solid #edf1f4;font-size:11px;align-items:start}
      .qrcAuditItem:last-child{border-bottom:0}
      .qrcAuditItem strong{font-size:11px}
      .qrcEmpty{padding:24px;text-align:center;color:#718697;font-size:12px}
      @media(max-width:820px){.qrcStats{grid-template-columns:repeat(2,minmax(0,1fr))}.qrcAuditItem{grid-template-columns:1fr}}
      @media(max-width:480px){.qrcStats{grid-template-columns:1fr 1fr}.qrcHead h2{font-size:20px}}
    `}</style>

    <header className="qrcHead">
      <div>

        <h2>Pusat Rekonsiliasi Data</h2>
        <p>Kelompokkan warning yang memiliki pola sumber sama, perbaiki pemetaan indikator secara massal, dan simpan audit setiap perubahan. Nilai sumber asli tidak dihapus.</p>
      </div>
      <div className="qrcToolbar">
        <label className="qrcField">Tahun profil
          <select value={year} onChange={event => setYear(Number(event.target.value))}>
            {[2024, 2025, 2026, 2027, 2028, 2029].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="qrcField">Cakupan unit
          <select value={roomId == null ? 'all' : String(roomId)} onChange={event => setRoomId(event.target.value === 'all' ? null : Number(event.target.value))}>
            <option value="all">Semua unit yang dapat diakses</option>
            {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
        <button type="button" className="qrcBtn" onClick={() => void load()} disabled={loading || !!savingKey}>Muat ulang</button>
      </div>
    </header>

    {error && <div className="qrcError" role="alert">{error}</div>}
    {success && <div className="qrcSuccess" role="status">{success}</div>}

    {loading && !queue ? <AsyncStatePanel state="loading" title="Memuat antrean rekonsiliasi" description="Membaca kelompok warning dari seluruh unit yang berada dalam cakupan akses." compact/> : null}
    {!loading && !queue && !error ? <AsyncStatePanel state="empty" title="Belum ada antrean rekonsiliasi" description="Tidak ada data yang dapat ditampilkan." compact/> : null}

    {queue && <>
      <div className="qrcStats">
        <div className="qrcStat"><small>Respons menunggu peninjauan</small><strong>{count(totalPending)}</strong><span>{count(summary.response_group_count)} pola sumber</span></div>
        <div className="qrcStat"><small>Dapat dipetakan otomatis</small><strong>{count(totalAuto)}</strong><span>{count(summary.auto_fixable_group_count)} pola dengan label/kode unik</span></div>
        <div className="qrcStat"><small>Perlu keputusan manual</small><strong>{count(totalManual)}</strong><span>Konflik, ketidakjelasan, atau profil indikator belum lengkap</span></div>
        <div className="qrcStat"><small>Warning sumber</small><strong>{count(totalWarnings)}</strong><span>{count(summary.warning_group_count)} pola warning</span></div>
      </div>

      <section className="qrcPanel">
        <div className="qrcPanelHead">
          <div><h3>Rekonsiliasi respons indikator</h3><p>Setiap baris mewakili respons yang sama pada satu indikator, bukan satu pasien. Tindakan berlaku pada seluruh catatan dengan pola serupa.</p></div>
          <span className="qrcBadge pending">{count(totalPending)} perlu ditinjau</span>
        </div>
        {sortedResponseGroups.length === 0 ? <div className="qrcEmpty">Tidak ada respons indikator berstatus pending pada cakupan ini.</div> :
          <div className="qrcTableWrap"><table className="qrcTable">
            <thead><tr><th>Unit / indikator</th><th>Respons sumber Excel</th><th>Status pemetaan</th><th>Jumlah catatan</th><th>Tindakan</th></tr></thead>
            <tbody>
              {sortedResponseGroups.map(item => {
                const key = groupKey(item)
                const draft = manualDrafts[key] ?? { open: false, option: item.auto_fixable ? optionValue({ label: item.suggested_target_label ?? '', code: item.suggested_target_code }) : '', reason: '' }
                const validOptions = optionsFor(item)
                const saving = savingKey === key
                return <tr key={key}>
                  <td><strong>{item.room_name}</strong><span className="qrcMuted">{item.indicator_code} · {item.indicator_title}</span></td>
                  <td><div className="qrcSource">{item.source_label}</div><span className="qrcMuted">Kode sumber: {item.source_code ?? 'tidak tersedia'}</span></td>
                  <td><span className={'qrcBadge ' + (item.auto_fixable ? 'good' : 'manual')}>{item.mapping_status}</span>
                    {item.auto_fixable && <span className="qrcMuted">Cocok unik: {item.suggested_target_label} · kode {item.suggested_target_code}</span>}
                    {!item.auto_fixable && <span className="qrcMuted">Perlu konfirmasi sebelum respons dapat dipetakan.</span>}
                  </td>
                  <td><strong>{count(item.affected_count)}</strong><span className="qrcMuted">respons pending</span></td>
                  <td>
                    <div className="qrcActions">
                      {item.auto_fixable && <button type="button" className="qrcBtn success" disabled={!!savingKey} onClick={() => void applyResponseGroup(item, 'auto_exact')}>
                        {saving ? 'Memproses…' : 'Perbaiki otomatis · ' + count(item.affected_count)}
                      </button>}
                      {!draft.open && <button type="button" className="qrcBtn" disabled={!!savingKey} onClick={() => setManual(key, { open: true })}>Tinjau / pilih master</button>}
                      {draft.open && <>
                        <select value={draft.option} onChange={event => setManual(key, { option: event.target.value })}>
                          <option value="">Pilih opsi master indikator…</option>
                          {validOptions.map((option, index) => <option key={index} value={optionValue(option)}>{option.label} · kode {option.code}</option>)}
                        </select>
                        <textarea value={draft.reason} onChange={event => setManual(key, { reason: event.target.value })} placeholder="Alasan keputusan PMKP (minimal 10 karakter)"/>
                        <div className="qrcInline">
                          <button type="button" className="qrcBtn primary" disabled={!!savingKey || !parseOption(draft.option) || draft.reason.trim().length < 10} onClick={() => void applyResponseGroup(item, 'manual')}>
                            {saving ? 'Menerapkan…' : 'Terapkan massal'}
                          </button>
                          <button type="button" className="qrcBtn" disabled={!!savingKey} onClick={() => setManual(key, { open: false })}>Batal</button>
                        </div>
                        {validOptions.length === 0 && <span className="qrcNotice">Master indikator belum memiliki opsi berkode 1/2/3. Perbarui master terlebih dahulu; nilai sumber tidak dapat diklasifikasikan secara sah.</span>}
                      </>}
                    </div>
                  </td>
                </tr>
              })}
            </tbody>
          </table></div>}
      </section>

      <section className="qrcPanel">
        <div className="qrcPanelHead">
          <div><h3>Warning pada sumber workbook</h3><p>Warning yang bersifat informasional dapat diterima setelah verifikasi. Warning yang memerlukan data asli tetap ditandai untuk koreksi dan tidak dihapus.</p></div>
          <span className="qrcBadge pending">{count(totalWarnings)} catatan terdampak</span>
        </div>
        {sortedWarningGroups.length === 0 ? <div className="qrcEmpty">Tidak ada warning sumber yang belum diselesaikan.</div> :
          <div className="qrcTableWrap"><table className="qrcTable">
            <thead><tr><th>Unit</th><th>Warning sumber</th><th>Jumlah catatan</th><th>Status telaah</th><th>Tindakan</th></tr></thead>
            <tbody>{sortedWarningGroups.map(item => {
              const key = warningKey(item)
              const draft = warningDrafts[key]?.reason ?? ''
              const saving = savingKey === key
              const needsCorrection = item.needs_source_correction_count > 0
              return <tr key={key}>
                <td><strong>{item.room_name}</strong><span className="qrcMuted">{item.profile_year}</span></td>
                <td><div className="qrcSource">{item.warning_text}</div></td>
                <td><strong>{count(item.affected_count)}</strong><span className="qrcMuted">{count(item.pending_count)} belum ditelaah · {count(item.needs_source_correction_count)} perlu koreksi sumber</span></td>
                <td><span className={'qrcBadge ' + (item.safe_derived_value ? 'good' : needsCorrection ? 'manual' : 'pending')}>
                  {item.safe_derived_value ? 'Nilai turunan dapat diverifikasi' : needsCorrection ? 'Perlu koreksi dari sumber' : 'Belum ditelaah'}
                </span></td>
                <td><div className="qrcActions">
                  {item.safe_existing_data
                    ? <span className="qrcMuted">Data sumber sudah pulih. Server memverifikasi seluruh {count(item.verified_count)} dari {count(item.verification_total)} episode memiliki nilai 14.1, form field, header, dan baris Excel.</span>
                    : item.safe_derived_value
                      ? <span className="qrcMuted">Nilai turunan dihitung ulang dari tanggal sumber. Dapat diterima setelah verifikasi.</span>
                      : <span className="qrcMuted">Tidak ada koreksi otomatis yang aman. Catatan sumber tetap harus diperbaiki atau diverifikasi.</span>}
                  <textarea value={draft} onChange={event => setWarningReason(key, event.target.value)} placeholder="Catatan telaah / alasan (minimal 10 karakter)"/>
                  <div className="qrcInline">
                    {item.safe_existing_data && <button type="button" className="qrcBtn success" disabled={!!savingKey || draft.trim().length < 10} onClick={() => void reviewWarningGroup(item, 'accept_verified_existing_data')}>
                      {saving ? 'Memproses…' : 'Konfirmasi data sumber telah pulih'}
                    </button>}
                    {!item.safe_existing_data && item.safe_derived_value && <button type="button" className="qrcBtn success" disabled={!!savingKey || draft.trim().length < 10} onClick={() => void reviewWarningGroup(item, 'accept_derived_value')}>
                      {saving ? 'Memproses…' : 'Terima hasil hitung ulang'}
                    </button>}
                    {!needsCorrection && !item.safe_existing_data && <button type="button" className="qrcBtn warning" disabled={!!savingKey || draft.trim().length < 10} onClick={() => void reviewWarningGroup(item, 'needs_source_correction')}>
                      Tandai perlu koreksi sumber
                    </button>}
                  </div>
                </div></td>
              </tr>
            })}</tbody>
          </table></div>}
      </section>

      <section className="qrcPanel">
        <button type="button" className="qrcPanelHead" style={{ width: '100%', textAlign: 'left', border: 0, background: '#fff', cursor: 'pointer' }} onClick={() => setShowAudit(value => !value)} aria-expanded={showAudit}>
          <div><h3>Riwayat rekonsiliasi</h3><p>Keputusan massal terakhir, sumber, target pemetaan, alasan, dan waktu tindakan.</p></div>
          <span className="qrcBadge">{showAudit ? 'Tutup' : 'Lihat ' + count(recentAudit.length) + ' tindakan'}</span>
        </button>
        {showAudit && (recentAudit.length === 0 ? <div className="qrcEmpty">Belum ada tindakan rekonsiliasi pada cakupan ini.</div> :
          <div>{recentAudit.map(item => <div className="qrcAuditItem" key={item.id}>
            <div><strong>{item.room_id} · {item.profile_year}</strong><span className="qrcMuted">{dateLabel(item.created_at)}</span></div>
            <div><strong>{actionLabel[item.action_type] ?? item.action_type}</strong><span className="qrcMuted">{item.source_label ?? 'Warning sumber'} {item.source_code ? '· kode sumber ' + item.source_code : ''}</span>
              {item.target_label && <span className="qrcMuted">→ {item.target_label} · kode {item.target_code}</span>}
              <span className="qrcMuted">Alasan: {item.decision_note}</span>
            </div>
            <span className="qrcBadge">{item.affected_record ? 'Record #' + item.affected_record.slice(0, 8) : 'Riwayat tindakan'}</span>
          </div>)}</div>)}
      </section>
    </>}
  </section>
}
