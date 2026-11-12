'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

/** Pengaturan › Konfigurasi Sistem & Hak Akses Role (Blueprint v2 §10.4, §16). Semua perubahan tercatat di audit log. */
const missingMsg = 'Fitur ini aktif setelah Super Admin menjalankan migrasi 20261112110000_blueprint_settings_permissions.sql di Supabase.'
const isMissing = (m: string) => /function .* does not exist|Could not find the function|schema cache/i.test(m)

type Setting = { key: string; value: unknown; label: string; description: string; updated_at: string }

export function SystemConfigPanel() {
  const [items, setItems] = useState<Setting[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const { data, error: e } = await aurekaSupabase.rpc('aureka_gov_settings_get')
    if (e) { setError(isMissing(e.message) ? missingMsg : toUserFacingError(e, { fallback: 'Konfigurasi belum dapat dimuat.' })); return }
    const d = data as { can_edit: boolean; settings: Setting[] }
    setItems(d.settings || []); setCanEdit(Boolean(d.can_edit))
    setDraft(Object.fromEntries((d.settings || []).map((s) => [s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value)])))
  }, [])
  useEffect(() => { void load() }, [load])
  const save = async (s: Setting) => {
    const raw = draft[s.key] ?? ''
    let value: unknown = raw
    if (typeof s.value === 'number') { value = Number(raw); if (!Number.isFinite(value as number)) { setError('Isi harus berupa angka.'); return } }
    if (typeof s.value === 'boolean') value = raw === 'true'
    setBusy(s.key); setError(''); setNotice('')
    const { error: e } = await aurekaSupabase.rpc('aureka_gov_settings_set', { p_key: s.key, p_value: value })
    setBusy('')
    if (e) setError(toUserFacingError(e, { fallback: 'Konfigurasi belum tersimpan.' }))
    else { setNotice(s.label + ' tersimpan.'); void load() }
  }
  return (
    <section className="stPanel govSettingsPanel" aria-label="Konfigurasi sistem">
      <h4>Konfigurasi Sistem</h4>
      <p className="stPanelHint">Kebijakan yang menurut Blueprint v2 §16 harus ditetapkan sebelum operasional. {canEdit ? 'Hanya Super Admin yang dapat mengubah.' : 'Hanya dapat dilihat; perubahan oleh Super Admin.'}</p>
      {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
      {notice && <div className="rmNotice" role="status"><span>Informasi</span><p>{notice}</p></div>}
      <div className="govSettingList">
        {items.map((s) => <div key={s.key} className="govSettingRow">
          <div><b>{s.label}</b><small>{s.description}</small></div>
          <div className="govSettingControl">
            {typeof s.value === 'boolean'
              ? <select disabled={!canEdit} value={draft[s.key]} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}><option value="true">Ya</option><option value="false">Tidak</option></select>
              : s.key === 'regulation_signature_method'
                ? <select disabled={!canEdit} value={draft[s.key]} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}><option value="internal">Persetujuan elektronik internal AUREKA</option><option value="tte">Wajib TTE tersertifikasi</option></select>
                : <input disabled={!canEdit} type={typeof s.value === 'number' ? 'number' : 'text'} value={draft[s.key] ?? ''} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />}
            {canEdit && <button type="button" className="uBtn primary" disabled={busy === s.key} onClick={() => void save(s)}>{busy === s.key ? 'Menyimpan…' : 'Simpan'}</button>}
          </div>
        </div>)}
      </div>
    </section>
  )
}

type Perm = { code: string; label: string; sensitive: boolean }
type Cell = { role_code: string; permission: string; granted: boolean }
const ROLES: [string, string][] = [['DIREKTUR', 'Direktur'], ['PMKP', 'Komite PMKP'], ['ADMIN', 'Super Admin'], ['MANAGEMENT', 'Manajemen'], ['KABID', 'Kepala Bidang'], ['DEWAN_PENGAWAS', 'Dewan Pengawas'], ['PIC', 'PIC Unit'], ['VALIDATOR', 'Validator']]

export function PermissionMatrixPanel() {
  const [perms, setPerms] = useState<Perm[]>([])
  const [matrix, setMatrix] = useState<Cell[]>([])
  const [mine, setMine] = useState<string[]>([])
  const [role, setRole] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [mobileRole, setMobileRole] = useState('DIREKTUR')
  const load = useCallback(async () => {
    const { data, error: e } = await aurekaSupabase.rpc('aureka_gov_perm_matrix')
    if (e) { setError(isMissing(e.message) ? missingMsg : toUserFacingError(e, { fallback: 'Hak akses belum dapat dimuat.' })); return }
    const d = data as { role: string; can_edit: boolean; mine: string[]; permissions: Perm[]; matrix: Cell[] }
    setPerms(d.permissions || []); setMatrix(d.matrix || []); setMine(d.mine || []); setRole(d.role); setCanEdit(Boolean(d.can_edit))
  }, [])
  useEffect(() => { void load() }, [load])
  const granted = useMemo(() => new Set(matrix.filter((c) => c.granted).map((c) => c.role_code + '|' + c.permission)), [matrix])
  const toggle = async (r: string, p: string, next: boolean) => {
    setBusy(r + '|' + p); setError('')
    const { error: e } = await aurekaSupabase.rpc('aureka_gov_perm_set', { p_role: r, p_permission: p, p_granted: next })
    setBusy('')
    if (e) setError(toUserFacingError(e, { fallback: 'Perubahan hak akses belum tersimpan.' }))
    else setMatrix((m) => [...m.filter((c) => !(c.role_code === r && c.permission === p)), { role_code: r, permission: p, granted: next }])
  }
  return (
    <section className="stPanel govSettingsPanel" aria-label="Hak akses role">
      <h4>Hak Akses Role</h4>
      <p className="stPanelHint">Permission granular sesuai Blueprint v2 §10.4. Bawaan: Direktur lintas modul; Dewan Pengawas dan Kepala Bidang tanpa akses data sensitif individual. Hak bertanda <b>sensitif</b> dicatat setiap kali dipakai.</p>
      {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
      {matrix.length === 0 && perms.length > 0 && <>
        <p className="stPanelHint">Hak akses role Anda ({role}):</p>
        <ul className="govPermMine">{perms.map((p) => <li key={p.code} className={mine.includes(p.code) ? 'on' : ''}>{mine.includes(p.code) ? '✓' : '—'} {p.label}{p.sensitive ? ' · sensitif' : ''}</li>)}</ul>
      </>}
      {matrix.length > 0 && <div className="govPermMobile">
        <select aria-label="Pilih role" value={mobileRole} onChange={(e) => setMobileRole(e.target.value)}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <ul>{perms.map((p) => { const k = mobileRole + '|' + p.code; const on = granted.has(k); return <li key={p.code}><label>
          <span><b>{p.label}</b><small>{p.code}{p.sensitive ? ' · sensitif' : ''}</small></span>
          <input type="checkbox" checked={on} disabled={!canEdit || busy === k || (mobileRole === 'ADMIN' && p.code === 'regulation.approve')} onChange={(e) => void toggle(mobileRole, p.code, e.target.checked)} />
        </label></li> })}</ul>
      </div>}
      {matrix.length > 0 && <div className="govPermWrap" data-ak-sort="off"><table className="govPermTable"><thead><tr><th>Hak akses</th>{ROLES.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead><tbody>
        {perms.map((p) => <tr key={p.code}><td><b>{p.label}</b><small>{p.code}{p.sensitive ? ' · sensitif' : ''}</small></td>
          {ROLES.map(([r]) => { const on = granted.has(r + '|' + p.code); const k = r + '|' + p.code; return <td key={r}>
            <input type="checkbox" aria-label={p.label + ' untuk ' + r} checked={on} disabled={!canEdit || busy === k || (r === 'ADMIN' && p.code === 'regulation.approve')} onChange={(e) => void toggle(r, p.code, e.target.checked)} />
          </td> })}
        </tr>)}
      </tbody></table></div>}
      {matrix.length > 0 && !canEdit && <p className="stPanelHint">Hanya Super Admin yang dapat mengubah matriks ini.</p>}
      <p className="stPanelHint">Catatan: matriks ini dipakai untuk identitas pasien, fitur tata kelola (Program, Regulasi, Audit Log), serta tambahan akses baca rincian investigasi, respons survei bernama, dan OPPE/FPPE. Aturan akses lama tetap berlaku (tahap 1 hanya menambah akses, tidak mengurangi).</p>
    </section>
  )
}
