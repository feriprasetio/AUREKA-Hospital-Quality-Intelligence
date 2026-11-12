'use client'

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AurekaModal from '@/components/ui/AurekaModal'
import { aurekaSupabase } from '@/lib/aureka/supabase'

/**
 * Blueprint v2 §10.2/§13: sebelum menampilkan data sensitif (identitas pasien, dsb.),
 * cek permission di server, minta tujuan akses, lalu catat ke audit log.
 * Bila fungsi tata kelola belum terpasang di database, akses tetap diizinkan seperti sebelumnya (tanpa log).
 */
type AccessType = 'patient_identity' | 'patient_profile' | 'incident_investigation' | 'survey_named_response' | 'hr_performance' | 'data_export'
const PERMISSION: Record<AccessType, string> = {
  patient_identity: 'patient.read.identifiable', patient_profile: 'patient.read.identifiable',
  incident_investigation: 'incident.read.investigation_detail', survey_named_response: 'survey.read.named_response',
  hr_performance: 'hr.read.performance', data_export: 'data.export.sensitive',
}
const missing = (msg?: string) => Boolean(msg && /function .* does not exist|Could not find the function|schema cache/i.test(msg))
let purposeCache: { type: string; purpose: string; at: number } | null = null

function askPurpose(title: string): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host)
    const done = (v: string | null) => { resolve(v); window.setTimeout(() => { root.unmount(); host.remove() }, 0) }
    function Ask() {
      const [open, setOpen] = useState(true)
      const [text, setText] = useState('')
      const finish = (v: string | null) => { setOpen(false); done(v) }
      return <AurekaModal open={open} size="md" title={title} subtitle="Akses ke data sensitif dicatat di audit log (nama, waktu, dan tujuan)." onClose={() => finish(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => finish(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={text.trim().length < 5} onClick={() => finish(text.trim())}>Lanjutkan</button></>}>
        <div className="govForm"><label>Tujuan akses<input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="mis. Telaah insiden, validasi logbook, bridging SIMRS" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim().length >= 5) finish(text.trim()) }} /></label></div>
      </AurekaModal>
    }
    root.render(<Ask />)
  })
}

/** Mengembalikan true bila boleh ditampilkan. */
export async function requestSensitiveAccess(type: AccessType, objectId: string | null, label = 'Tampilkan data sensitif'): Promise<boolean> {
  const perm = await aurekaSupabase.rpc('aureka_has_permission', { p_permission: PERMISSION[type] })
  if (perm.error) return missing(perm.error.message)
  if (perm.data !== true) return false
  let needPurpose = true
  const cfg = await aurekaSupabase.rpc('aureka_gov_settings_get')
  if (!cfg.error) needPurpose = ((cfg.data as { settings?: { key: string; value: unknown }[] })?.settings || []).find((s) => s.key === 'sensitive_access_requires_purpose')?.value !== false
  let purpose = ''
  if (needPurpose) {
    // Tujuan diingat 15 menit per jenis akses agar tidak ditanya berulang dalam satu sesi kerja.
    if (purposeCache && purposeCache.type === type && Date.now() - purposeCache.at < 15 * 60 * 1000) purpose = purposeCache.purpose
    else {
      const p = await askPurpose(label)
      if (!p) return false
      purpose = p; purposeCache = { type, purpose, at: Date.now() }
    }
  }
  await aurekaSupabase.rpc('aureka_gov_log_access', { p_object_type: type, p_object_id: objectId, p_purpose: purpose || null, p_detail: {} })
  return true
}

const viewLogged = new Map<string, number>()
/** Catat (tanpa bertanya) bahwa pengguna membuka layar berisi data sensitif. Maksimal sekali per 10 menit per layar. */
export function logSensitiveView(type: AccessType, objectId: string | null, detail: Record<string, unknown> = {}) {
  const key = type + '|' + (objectId || '')
  const last = viewLogged.get(key) || 0
  if (Date.now() - last < 10 * 60 * 1000) return
  viewLogged.set(key, Date.now())
  void aurekaSupabase.rpc('aureka_gov_log_access', { p_object_type: type, p_object_id: objectId, p_purpose: 'membuka layar', p_detail: detail }).then(() => undefined, () => undefined)
}
