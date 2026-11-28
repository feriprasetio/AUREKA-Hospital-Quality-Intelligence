'use client'

import { WorkspaceIntelligenceMetrics } from '@/components/workspace/WorkspaceIntelligence'
import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'
import ContinuumSummary from '@/components/workspace/ContinuumSummary'
import {useLatestWorkspaceRequest} from '@/lib/ui/use-latest-workspace-request'

/** Pengaturan › Audit Log (Blueprint v2 §10/§13): catatan append-only, hanya Super Admin, Direktur, Komite PMKP. */
type Row = { id: number; actor_name: string | null; actor_role: string | null; action: string; object_type: string; object_id: string | null; detail: Record<string, unknown>; created_at: string }
const OBJECT_LABEL: Record<string, string> = { recommendation: 'Rekomendasi', action: 'Tindak lanjut', regulation: 'Regulasi', ui_error: 'Error tampilan', hr_performance: 'Kinerja tenaga klinis', patient_identity: 'Identitas pasien', setting: 'Pengaturan', permission: 'Hak akses' }
// Nama tindakan dalam bahasa awam (kode asli tetap terlihat saat kursor diarahkan).
const ACTION_LABEL: Record<string, string> = { view_sensitive: 'Melihat data sensitif', create: 'Membuat', update: 'Mengubah', submit: 'Mengajukan', publish: 'Menerbitkan', save_draft: 'Menyimpan draf', evaluate: 'Mengevaluasi', setting_update: 'Mengubah pengaturan', client_error: 'Error tampilan' }
const actionLabel = (a: string) => ACTION_LABEL[a] || (a?.startsWith('decision_') ? 'Keputusan: ' + a.slice(9).replace(/_/g, ' ') : a?.startsWith('permission_') ? 'Hak akses: ' + a.slice(11).replace(/_/g, ' ') : (a || '-').replace(/_/g, ' '))

export default function AuditLogWorkspace({dataFirst=false}:{dataFirst?:boolean}={}) {
  const [rows, setRows] = useState<Row[]>([])
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const beginLoad=useLatestWorkspaceRequest(type)
  const [loadedType,setLoadedType]=useState<string|null>(null)
  const pending=loading||loadedType!==type
  const load = useCallback(async () => {
    const isCurrent=beginLoad()
    if(!isCurrent)return
    setLoading(true); setError('');setRows([])
    const { data, error: e } = await aurekaSupabase.rpc('aureka_gov_audit_log', { p_limit: 500, p_object_type: type || null })
    if(!isCurrent())return
    if (e) setError(/function .* does not exist|Could not find the function/i.test(e.message) ? 'Audit Log aktif setelah Super Admin menjalankan migrasi 20261112100000_blueprint_program_regulation_audit.sql di Supabase.' : toUserFacingError(e, { fallback: 'Audit log belum dapat dimuat.' }))
    else setRows((data as Row[]) || [])
    setLoadedType(type);setLoading(false)
  }, [type,beginLoad])
  useEffect(() => { void load() }, [load])
  return (
    <section className="rmPanel govWorkspace" aria-label="Audit log">
      <div className="rmSectionHead">
        <div><h3>Audit Log</h3><p>Catatan permanen (tidak dapat diubah atau dihapus) atas perubahan program, tindak lanjut, dan regulasi beserta keputusan persetujuan.</p></div>
        <div className="govHeadTools">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Jenis objek"><option value="">Semua objek</option>{Object.entries(OBJECT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button type="button" className="rmButton" onClick={() => void load()}>↻ Muat ulang</button>
        </div>
      </div>
      <ContinuumSummary enabled={dataFirst} label="Ringkasan audit log"><WorkspaceIntelligenceMetrics loading={pending} unavailable={!!error} metrics={[
        { label: 'Peristiwa dimuat', value: rows.length },
        { label: 'Jenis objek dalam hasil', value: new Set(rows.map(row => row.object_type)).size },
      ]} /></ContinuumSummary>
      {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
      {pending ? <div className="rmLoading"><span className="rmSpinner" />Memuat…</div> : !error && (
        <WorkspaceTableViewport dataFirst={dataFirst} label="Audit log" className="rmTableWrap"><table className="rmTable"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Role</th><th>Tindakan</th><th>Objek</th><th>Rincian</th></tr></thead><tbody>
          {rows.length ? rows.map((r) => <tr key={r.id}>
            <td>{new Date(r.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
            <td>{r.actor_name || '-'}</td><td>{r.actor_role || '-'}</td><td title={r.action}>{actionLabel(r.action)}</td>
            <td>{OBJECT_LABEL[r.object_type] || r.object_type}<small className="rmCellSmall">{r.object_id?.slice(0, 8)}</small></td>
            <td><small className="rmCellSmall govDetail">{Object.entries(r.detail || {}).filter(([, v]) => v != null && v !== '').slice(0, 4).map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))).join(' · ').slice(0, 220)}</small></td>
          </tr>) : <tr><td colSpan={6}><div className="rmEmptySmall">Belum ada catatan.</div></td></tr>}
        </tbody></table></WorkspaceTableViewport>
      )}
    </section>
  )
}
