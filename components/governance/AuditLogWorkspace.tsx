'use client'

import { WorkspaceIntelligenceMetrics } from '@/components/workspace/WorkspaceIntelligence'
import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'
import ContinuumSummary from '@/components/workspace/ContinuumSummary'
import ContinuumReadGrid from '@/components/workspace/ContinuumReadGrid'
import ContinuumReadTable,{type ReadTableColumn} from '@/components/workspace/ContinuumReadTable'
import type {ReadGridColumn} from '@/lib/aureka/read-grid'
import {useLatestWorkspaceRequest} from '@/lib/ui/use-latest-workspace-request'

/** Pengaturan › Audit Log (Blueprint v2 §10/§13): catatan append-only, hanya Super Admin, Direktur, Komite PMKP. */
type Row = { id: number; actor_name: string | null; actor_role: string | null; action: string; object_type: string; object_id: string | null; detail: Record<string, unknown>; created_at: string }
const OBJECT_LABEL: Record<string, string> = { recommendation: 'Rekomendasi', action: 'Tindak lanjut', regulation: 'Regulasi', ui_error: 'Error tampilan', hr_performance: 'Kinerja tenaga klinis', patient_identity: 'Identitas pasien', setting: 'Pengaturan', permission: 'Hak akses' }
// Nama tindakan dalam bahasa awam (kode asli tetap terlihat saat kursor diarahkan).
const ACTION_LABEL: Record<string, string> = { view_sensitive: 'Melihat data sensitif', create: 'Membuat', update: 'Mengubah', submit: 'Mengajukan', publish: 'Menerbitkan', save_draft: 'Menyimpan draf', evaluate: 'Mengevaluasi', setting_update: 'Mengubah pengaturan', client_error: 'Error tampilan' }
const actionLabel = (a: string) => ACTION_LABEL[a] || (a?.startsWith('decision_') ? 'Keputusan: ' + a.slice(9).replace(/_/g, ' ') : a?.startsWith('permission_') ? 'Hak akses: ' + a.slice(11).replace(/_/g, ' ') : (a || '-').replace(/_/g, ' '))

const AUDIT_COLUMNS:readonly ReadGridColumn<Row>[]=[{id:'time',label:'Waktu',value:r=>r.created_at},{id:'actor',label:'Pengguna',value:r=>r.actor_name},{id:'role',label:'Role',value:r=>r.actor_role},{id:'action',label:'Tindakan',value:r=>actionLabel(r.action)},{id:'object',label:'Objek',value:r=>OBJECT_LABEL[r.object_type]||r.object_type}]
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
    try{
      const { data, error: e } = await aurekaSupabase.rpc('aureka_gov_audit_log', { p_limit: 500, p_object_type: type || null })
      if(!isCurrent())return
      if(e)throw e
      if(!Array.isArray(data))throw new Error('Hasil audit belum lengkap.')
      setRows(data as Row[])
    }catch(cause){if(isCurrent())setError(toUserFacingError(cause,{fallback:'Audit log belum dapat dimuat.'}))}
    finally{if(isCurrent()){setLoadedType(type);setLoading(false)}}
  }, [type,beginLoad])
  useEffect(() => { void load() }, [load])
  const display:readonly ReadTableColumn<Row>[]=[
 {id:'time',label:'Waktu',required:true,cell:r=>new Date(r.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})},
 {id:'actor',label:'Pengguna',required:true,cell:r=>r.actor_name||'-'},
 {id:'role',label:'Role',cell:r=>r.actor_role||'-'},
 {id:'action',label:'Tindakan',required:true,cell:r=><span title={r.action}>{actionLabel(r.action)}</span>},
 {id:'object',label:'Objek',cell:r=><>{OBJECT_LABEL[r.object_type]||r.object_type}<small className="rmCellSmall">{r.object_id?.slice(0,8)}</small></>},
 {id:'detail',label:'Rincian',cell:r=><small className="rmCellSmall govDetail">{Object.entries(r.detail||{}).filter(([,v])=>v!=null&&v!=='').slice(0,4).map(([k,v])=>k+': '+(typeof v==='string'?v:JSON.stringify(v))).join(' · ').slice(0,220)}</small>}
 ]
 const table=(page:readonly Row[],filtered=false,keys?:readonly string[])=><WorkspaceTableViewport dataFirst={dataFirst} label="Audit log" className="rmTableWrap"><ContinuumReadTable rows={page} columns={display} keys={keys} rowKey={r=>r.id} className="rmTable" disableDomSort={dataFirst} empty={<div className="rmEmptySmall">{filtered?'Tidak ada catatan sesuai pencarian.':'Belum ada catatan.'}</div>}/></WorkspaceTableViewport>
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
        dataFirst?<><p>Menampilkan maksimal 500 catatan dari RPC existing. Pencarian tidak mencakup rincian sensitif atau data di luar hasil yang dimuat.</p><ContinuumReadGrid key={type} rows={rows} columns={AUDIT_COLUMNS} display={display} label="Kontrol audit log">{table}</ContinuumReadGrid></>:table(rows)
      )}
    </section>
  )
}
