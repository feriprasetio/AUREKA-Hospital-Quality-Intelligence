'use client'

import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'

/** Pengaturan › Audit Log (Blueprint v2 §10/§13): catatan append-only, hanya Super Admin, Direktur, Komite PMKP. */
type Row = { id: number; actor_name: string | null; actor_role: string | null; action: string; object_type: string; object_id: string | null; detail: Record<string, unknown>; created_at: string }
const OBJECT_LABEL: Record<string, string> = { recommendation: 'Rekomendasi', action: 'Tindak lanjut', regulation: 'Regulasi' }

export default function AuditLogWorkspace() {
  const [rows, setRows] = useState<Row[]>([])
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error: e } = await aurekaSupabase.rpc('aureka_gov_audit_log', { p_limit: 500, p_object_type: type || null })
    if (e) setError(/function .* does not exist|Could not find the function/i.test(e.message) ? 'Audit Log aktif setelah Super Admin menjalankan migrasi 20261112100000_blueprint_program_regulation_audit.sql di Supabase.' : toUserFacingError(e, { fallback: 'Audit log belum dapat dimuat.' }))
    else setRows((data as Row[]) || [])
    setLoading(false)
  }, [type])
  useEffect(() => { void load() }, [load])
  return (
    <section className="rmPanel govWorkspace" aria-label="Audit log">
      <div className="rmSectionHead">
        <div><span className="rmEyebrow">Pengaturan</span><h3>Audit Log</h3><p>Catatan permanen (tidak dapat diubah atau dihapus) atas perubahan program, tindak lanjut, dan regulasi beserta keputusan persetujuan.</p></div>
        <div className="govHeadTools">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Jenis objek"><option value="">Semua objek</option>{Object.entries(OBJECT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button type="button" className="rmButton" onClick={() => void load()}>↻ Muat ulang</button>
        </div>
      </div>
      {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
      {loading ? <div className="rmLoading"><span className="rmSpinner" />Memuat…</div> : !error && (
        <WorkspaceTableViewport label="Audit log" className="rmTableWrap"><table className="rmTable"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Role</th><th>Tindakan</th><th>Objek</th><th>Rincian</th></tr></thead><tbody>
          {rows.length ? rows.map((r) => <tr key={r.id}>
            <td>{new Date(r.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
            <td>{r.actor_name || '—'}</td><td>{r.actor_role || '—'}</td><td>{r.action}</td>
            <td>{OBJECT_LABEL[r.object_type] || r.object_type}<small className="rmCellSmall">{r.object_id?.slice(0, 8)}</small></td>
            <td><small className="rmCellSmall govDetail">{Object.entries(r.detail || {}).filter(([, v]) => v != null && v !== '').slice(0, 4).map(([k, v]) => k + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))).join(' · ').slice(0, 220)}</small></td>
          </tr>) : <tr><td colSpan={6}><div className="rmEmptySmall">Belum ada catatan.</div></td></tr>}
        </tbody></table></WorkspaceTableViewport>
      )}
    </section>
  )
}
