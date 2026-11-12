'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import AurekaModal from '@/components/ui/AurekaModal'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'

/**
 * Program › Rekomendasi Ketua PMKP dan Rencana Tindak Lanjut (Blueprint v2 §7).
 * Satu model tindakan (action_item); submenu RTL Dewan Pengawas / Direktur / Kepala Bidang hanyalah
 * tampilan terfilter atas data yang sama. Hak akses diperiksa di server (public.aureka_gov_*).
 */
type Room = { id: number; name: string }
export type GovernanceProgramView = 'recommendations' | 'rtl'
type Level = 'DEWAN_PENGAWAS' | 'DIREKTUR' | 'KABID' | 'UNIT'
type Recommendation = { id: string; code: string; source: string; title: string; description: string; priority: string; program_year: number; given_by_name: string | null; given_at: string; status: string }
type Evaluation = { result: string; decision: string; note: string; evaluator_name: string | null; evaluated_at: string }
type Action = { id: string; recommendation_id: string | null; title: string; description: string; responsible_level: Level; assigned_to_name: string | null; assigned_room_id: number | null; room_name: string | null; due_date: string | null; expected_output: string; status: string; progress_note: string; evidence_url: string | null; last_evaluation: Evaluation | null }
type Payload = { role: string; can_manage: boolean; can_evaluate: boolean; recommendations: Recommendation[]; actions: Action[] }

const LEVEL_LABEL: Record<Level, string> = { DEWAN_PENGAWAS: 'Dewan Pengawas', DIREKTUR: 'Direktur', KABID: 'Kepala Bidang', UNIT: 'Unit' }
const STATUS_LABEL: Record<string, string> = { terbuka: 'Terbuka', berjalan: 'Berjalan', selesai: 'Selesai (menunggu verifikasi)', terverifikasi: 'Terverifikasi efektif', dibatalkan: 'Dibatalkan' }
const SOURCE_LABEL: Record<string, string> = { ketua_pmkp: 'Ketua PMKP', audit: 'Hasil audit', risiko: 'Manajemen risiko', insiden: 'Insiden', program: 'Program kerja', lainnya: 'Lainnya' }
const fmtDate = (v?: string | null) => (v ? new Date(v.length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const overdue = (a: Action) => a.due_date && !['terverifikasi', 'dibatalkan', 'selesai'].includes(a.status) && new Date(a.due_date + 'T23:59:59') < new Date()

export default function GovernanceProgramWorkspace({ view, rooms }: { view: GovernanceProgramView; rooms: Room[] }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [rtlLevel, setRtlLevel] = useState<Level>('DIREKTUR')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [recDraft, setRecDraft] = useState<Partial<Recommendation> | null>(null)
  const [actDraft, setActDraft] = useState<Partial<Action> | null>(null)
  const [progress, setProgress] = useState<Action | null>(null)
  const [evalFor, setEvalFor] = useState<Action | null>(null)
  const [evalForm, setEvalForm] = useState({ result: 'efektif', decision: 'ditutup', note: '', evidence_url: '' })

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data: d, error: e } = await aurekaSupabase.rpc('aureka_gov_program_list', { p_year: year })
    if (e) setError(/function .* does not exist|Could not find the function/i.test(e.message) ? 'Fitur ini aktif setelah Super Admin menjalankan migrasi 20261112100000_blueprint_program_regulation_audit.sql di Supabase.' : toUserFacingError(e, { fallback: 'Data program belum dapat dimuat.' }))
    else setData(d as Payload)
    setLoading(false)
  }, [year])
  useEffect(() => { void load() }, [load])

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true); setNotice(''); setError('')
    const { error: e } = await fn()
    setBusy(false)
    if (e) { setError(toUserFacingError(e as Error, { fallback: 'Perubahan belum tersimpan.' })); return false }
    setNotice(ok); await load(); return true
  }

  const level = view === 'recommendations' ? null : rtlLevel
  const actions = useMemo(() => (data?.actions ?? []).filter((a) => !level || a.responsible_level === level), [data, level])
  const recTitle = useMemo(() => new Map((data?.recommendations ?? []).map((r) => [r.id, r.code + ' · ' + r.title])), [data])
  const canManage = Boolean(data?.can_manage)
  const canEvaluate = Boolean(data?.can_evaluate)
  const canUpdateProgress = (a: Action) => canManage || data?.role === a.responsible_level || (data?.role === 'PIC' && a.responsible_level === 'UNIT')

  const actionTable = (list: Action[]) => (
    <WorkspaceTableViewport label="Rencana tindak lanjut" className="rmTableWrap"><table className="rmTable"><thead><tr><th>Tindak lanjut</th><th>Level</th><th>Penanggung jawab</th><th>Tenggat</th><th>Status</th><th>Evaluasi</th><th>Aksi</th></tr></thead><tbody>
      {list.length ? list.map((a) => <tr key={a.id}>
        <td><b>{a.title}</b>{a.recommendation_id && <small className="rmCellSmall">{recTitle.get(a.recommendation_id)}</small>}{a.progress_note && <small className="rmCellSmall">Progres: {a.progress_note}</small>}</td>
        <td>{LEVEL_LABEL[a.responsible_level]}</td>
        <td>{a.assigned_to_name || '—'}{a.room_name && <small className="rmCellSmall">{a.room_name}</small>}</td>
        <td>{fmtDate(a.due_date)}{overdue(a) && <small className="rmCellSmall govOverdue">Lewat tenggat</small>}</td>
        <td><span className={'govStatus ' + a.status}>{STATUS_LABEL[a.status] || a.status}</span></td>
        <td>{a.last_evaluation ? <><b>{a.last_evaluation.result.replace('_', ' ')}</b><small className="rmCellSmall">{a.last_evaluation.decision} · {fmtDate(a.last_evaluation.evaluated_at)}</small></> : '—'}</td>
        <td><div className="rmActions">
          {canUpdateProgress(a) && !['terverifikasi', 'dibatalkan'].includes(a.status) && <button type="button" className="rmIconButton" onClick={() => setProgress({ ...a })}>Progres</button>}
          {canManage && <button type="button" className="rmIconButton" onClick={() => setActDraft({ ...a })}>Edit</button>}
          {canEvaluate && a.status === 'selesai' && <button type="button" className="rmIconButton" onClick={() => { setEvalFor(a); setEvalForm({ result: 'efektif', decision: 'ditutup', note: '', evidence_url: a.evidence_url || '' }) }}>Evaluasi</button>}
        </div></td>
      </tr>) : <tr><td colSpan={7}><div className="rmEmptySmall">Belum ada rencana tindak lanjut{level ? ' untuk ' + LEVEL_LABEL[level] : ''}.</div></td></tr>}
    </tbody></table></WorkspaceTableViewport>
  )

  return (
    <section className="rmPanel govWorkspace" aria-label={view === 'recommendations' ? 'Rekomendasi Ketua PMKP' : 'Rencana tindak lanjut'}>
      <div className="rmSectionHead">
        <div>
          <span className="rmEyebrow">Program</span>
          <h3>{view === 'recommendations' ? 'Rekomendasi Ketua PMKP' : 'Rencana Tindak Lanjut'}</h3>
          <p>{view === 'recommendations' ? 'Rekomendasi resmi beserta tindak lanjut yang diturunkan ke Dewan Pengawas, Direktur, Kepala Bidang, atau unit.' : 'Pilih sumber rekomendasi untuk menampilkan RTL terkait; seluruh kategori menggunakan satu modul dan satu sumber data.'}</p>
        </div>
        <div className="govHeadTools">
          {view === 'rtl' && <label className="govYear">Sumber rekomendasi <select value={rtlLevel} onChange={(e) => setRtlLevel(e.target.value as Level)}><option value="DIREKTUR">Direktur</option><option value="DEWAN_PENGAWAS">Dewan Pengawas</option><option value="KABID">Kepala Bidang</option></select></label>}
          <label className="govYear">Tahun <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2].map((d) => new Date().getFullYear() + 1 - d).map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          {canManage && view === 'recommendations' && <button type="button" className="rmButton primary" onClick={() => setRecDraft({ source: 'ketua_pmkp', priority: 'sedang', program_year: year })}>+ Rekomendasi</button>}
          {canManage && <button type="button" className="rmButton" onClick={() => setActDraft({ responsible_level: level || 'KABID' })}>+ Tindak lanjut</button>}
        </div>
      </div>

      {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
      {notice && <div className="rmNotice" role="status"><span>Informasi</span><p>{notice}</p></div>}
      {loading ? <div className="rmLoading"><span className="rmSpinner" />Memuat…</div> : data && <>
        <div className="rmKpis">
          {view === 'recommendations' && <div className="rmKpi"><span>Rekomendasi {year}</span><strong>{data.recommendations.length}</strong></div>}
          <div className="rmKpi"><span>Tindak lanjut</span><strong>{actions.length}</strong></div>
          <div className="rmKpi"><span>Lewat tenggat</span><strong>{actions.filter(overdue).length}</strong></div>
          <div className="rmKpi"><span>Menunggu verifikasi</span><strong>{actions.filter((a) => a.status === 'selesai').length}</strong></div>
          <div className="rmKpi"><span>Terverifikasi efektif</span><strong>{actions.filter((a) => a.status === 'terverifikasi').length}</strong></div>
        </div>

        {view === 'recommendations' ? (
          <div className="govRecList">
            {data.recommendations.length ? data.recommendations.map((r) => {
              const kids = data.actions.filter((a) => a.recommendation_id === r.id)
              return <article key={r.id} className="govRec">
                <header>
                  <div><span className="govCode">{r.code}</span><h4>{r.title}</h4><small>{SOURCE_LABEL[r.source] || r.source} · {r.given_by_name || 'Ketua PMKP'} · {fmtDate(r.given_at)} · prioritas {r.priority}</small></div>
                  {canManage && <button type="button" className="rmIconButton" onClick={() => setRecDraft({ ...r })}>Edit</button>}
                </header>
                {r.description && <p>{r.description}</p>}
                {kids.length ? actionTable(kids) : <div className="rmEmptySmall">Belum ada tindak lanjut untuk rekomendasi ini.{canManage && <> <button type="button" className="textButton" onClick={() => setActDraft({ recommendation_id: r.id, responsible_level: 'KABID' })}>Tambah tindak lanjut</button></>}</div>}
              </article>
            }) : <div className="rmEmptySmall">Belum ada rekomendasi untuk tahun {year}.</div>}
          </div>
        ) : actionTable(actions)}
      </>}

      <AurekaModal open={Boolean(recDraft)} title={recDraft?.id ? 'Edit rekomendasi' : 'Rekomendasi baru'} subtitle="Dicatat di audit log." closeDisabled={busy} onClose={() => setRecDraft(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setRecDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy || !recDraft?.title || recDraft.title.trim().length < 5} onClick={async () => { if (await run(() => aurekaSupabase.rpc('aureka_gov_save_recommendation', { p: recDraft }), 'Rekomendasi tersimpan.')) setRecDraft(null) }}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
        {recDraft && <div className="govForm">
          <label>Judul rekomendasi<input value={recDraft.title || ''} onChange={(e) => setRecDraft({ ...recDraft, title: e.target.value })} placeholder="mis. Tingkatkan kepatuhan identifikasi pasien" /></label>
          <label>Uraian<textarea rows={4} value={recDraft.description || ''} onChange={(e) => setRecDraft({ ...recDraft, description: e.target.value })} /></label>
          <div className="govFormRow">
            <label>Asal<select value={recDraft.source || 'ketua_pmkp'} onChange={(e) => setRecDraft({ ...recDraft, source: e.target.value })}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Prioritas<select value={recDraft.priority || 'sedang'} onChange={(e) => setRecDraft({ ...recDraft, priority: e.target.value })}><option value="tinggi">Tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option></select></label>
          </div>
          <div className="govFormRow">
            <label>Pemberi rekomendasi<input value={recDraft.given_by_name || ''} onChange={(e) => setRecDraft({ ...recDraft, given_by_name: e.target.value })} placeholder="Ketua PMKP" /></label>
            {recDraft.id ? <label>Status<select value={recDraft.status || 'aktif'} onChange={(e) => setRecDraft({ ...recDraft, status: e.target.value })}><option value="aktif">Aktif</option><option value="selesai">Selesai</option><option value="dibatalkan">Dibatalkan</option></select></label>
              : <label>Tanggal<input type="date" value={recDraft.given_at || ''} onChange={(e) => setRecDraft({ ...recDraft, given_at: e.target.value })} /></label>}
          </div>
        </div>}
      </AurekaModal>

      <AurekaModal open={Boolean(actDraft)} title={actDraft?.id ? 'Edit tindak lanjut' : 'Tindak lanjut baru'} closeDisabled={busy} onClose={() => setActDraft(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setActDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy || !actDraft?.title || actDraft.title.trim().length < 5} onClick={async () => { if (await run(() => aurekaSupabase.rpc('aureka_gov_save_action', { p: actDraft }), 'Tindak lanjut tersimpan.')) setActDraft(null) }}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
        {actDraft && <div className="govForm">
          <label>Rekomendasi asal<select value={actDraft.recommendation_id || ''} onChange={(e) => setActDraft({ ...actDraft, recommendation_id: e.target.value || null })}><option value="">— Tanpa rekomendasi —</option>{(data?.recommendations ?? []).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}</select></label>
          <label>Tindak lanjut<input value={actDraft.title || ''} onChange={(e) => setActDraft({ ...actDraft, title: e.target.value })} /></label>
          <label>Uraian<textarea rows={3} value={actDraft.description || ''} onChange={(e) => setActDraft({ ...actDraft, description: e.target.value })} /></label>
          <div className="govFormRow">
            <label>Level penanggung jawab<select value={actDraft.responsible_level || 'KABID'} onChange={(e) => setActDraft({ ...actDraft, responsible_level: e.target.value as Level })}>{(Object.keys(LEVEL_LABEL) as Level[]).map((k) => <option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}</select></label>
            <label>Tenggat<input type="date" value={actDraft.due_date || ''} onChange={(e) => setActDraft({ ...actDraft, due_date: e.target.value })} /></label>
          </div>
          <div className="govFormRow">
            <label>Nama penanggung jawab<input value={actDraft.assigned_to_name || ''} onChange={(e) => setActDraft({ ...actDraft, assigned_to_name: e.target.value })} /></label>
            <label>Unit (opsional)<select value={actDraft.assigned_room_id ?? ''} onChange={(e) => setActDraft({ ...actDraft, assigned_room_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          </div>
          <label>Output yang diharapkan<input value={actDraft.expected_output || ''} onChange={(e) => setActDraft({ ...actDraft, expected_output: e.target.value })} /></label>
        </div>}
      </AurekaModal>

      <AurekaModal open={Boolean(progress)} size="md" title="Perbarui progres" subtitle={progress?.title} closeDisabled={busy} onClose={() => setProgress(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setProgress(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy} onClick={async () => { if (progress && await run(() => aurekaSupabase.rpc('aureka_gov_save_action', { p: { id: progress.id, status: progress.status, progress_note: progress.progress_note, evidence_url: progress.evidence_url } }), 'Progres tersimpan.')) setProgress(null) }}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
        {progress && <div className="govForm">
          <label>Status<select value={progress.status} onChange={(e) => setProgress({ ...progress, status: e.target.value })}><option value="terbuka">Terbuka</option><option value="berjalan">Berjalan</option><option value="selesai">Selesai (ajukan verifikasi)</option></select></label>
          <label>Catatan progres<textarea rows={3} value={progress.progress_note} onChange={(e) => setProgress({ ...progress, progress_note: e.target.value })} /></label>
          <label>Tautan bukti (opsional)<input value={progress.evidence_url || ''} onChange={(e) => setProgress({ ...progress, evidence_url: e.target.value })} placeholder="https://…" /></label>
        </div>}
      </AurekaModal>

      <AurekaModal open={Boolean(evalFor)} size="md" title="Evaluasi efektivitas" subtitle={evalFor?.title} closeDisabled={busy} onClose={() => setEvalFor(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setEvalFor(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy || evalForm.note.trim().length < 10} onClick={async () => { if (evalFor && await run(() => aurekaSupabase.rpc('aureka_gov_evaluate_action', { p_action_id: evalFor.id, p_result: evalForm.result, p_decision: evalForm.decision, p_note: evalForm.note, p_evidence_url: evalForm.evidence_url || null }), 'Evaluasi tersimpan.')) setEvalFor(null) }}>{busy ? 'Menyimpan…' : 'Simpan evaluasi'}</button></>}>
        <div className="govForm">
          <div className="govFormRow">
            <label>Hasil<select value={evalForm.result} onChange={(e) => setEvalForm({ ...evalForm, result: e.target.value })}><option value="efektif">Efektif</option><option value="sebagian">Efektif sebagian</option><option value="tidak_efektif">Tidak efektif</option></select></label>
            <label>Keputusan<select value={evalForm.decision} onChange={(e) => setEvalForm({ ...evalForm, decision: e.target.value })}><option value="ditutup">Ditutup</option><option value="dilanjutkan">Dilanjutkan</option></select></label>
          </div>
          <label>Dasar penilaian (bukti, data sebelum–sesudah)<textarea rows={4} value={evalForm.note} onChange={(e) => setEvalForm({ ...evalForm, note: e.target.value })} placeholder="mis. Kepatuhan naik dari 70% menjadi 95% pada audit ulang Desember." /></label>
          <label>Tautan bukti (opsional)<input value={evalForm.evidence_url} onChange={(e) => setEvalForm({ ...evalForm, evidence_url: e.target.value })} /></label>
        </div>
      </AurekaModal>
    </section>
  )
}
