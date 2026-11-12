'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import AurekaModal from '@/components/ui/AurekaModal'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'

/**
 * Regulasi › E-Regulasi (Blueprint v2 §8).
 * Alur: penyusun membuat draft → ajukan ke Direktur → Direktur setujui/kembalikan/tolak (melekat pada versi & hash isi)
 * → Komite PMKP menerbitkan dengan nomor & tanggal berlaku → revisi selalu menjadi versi baru; versi lama diarsipkan.
 * Persetujuan ini adalah persetujuan elektronik internal AUREKA, bukan TTE tersertifikasi.
 */
type Room = { id: number; name: string }
export type RegulationView = 'keputusan' | 'spo' | 'pedoman' | 'kebijakan' | 'approval' | 'history' | 'monitoring'
type Approval = { decision: string; comments: string; approver_name: string | null; approver_role: string; approved_content_hash: string; decided_at: string }
type Version = { id: string; version_no: number; summary: string; content: string; file_url: string | null; content_hash: string; change_note: string; status: string; effective_date: string | null; review_date: string | null; created_at: string; approvals: Approval[] }
type Doc = { id: string; doc_type: string; doc_number: string | null; title: string; owner_room_id: number | null; room_name: string | null; legal_basis: string; status: string; current_version_id: string | null; published_version_id: string | null; updated_at: string; versions: Version[] }
type Payload = { role: string; can_draft: boolean; can_approve: boolean; can_publish: boolean; documents: Doc[] }
type Draft = { document_id?: string; doc_type: string; title: string; owner_room_id: string; legal_basis: string; summary: string; content: string; file_url: string; change_note: string }

const TYPE_LABEL: Record<string, string> = { keputusan_direktur: 'Keputusan Direktur', spo: 'SPO', pedoman: 'Pedoman', panduan: 'Panduan', kebijakan: 'Kebijakan', lainnya: 'Lainnya' }
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', menunggu_direktur: 'Menunggu Direktur', dikembalikan: 'Dikembalikan untuk revisi', ditolak: 'Ditolak', disetujui: 'Disetujui · siap terbit', terbit: 'Berlaku', digantikan: 'Digantikan', dicabut: 'Dicabut' }
const fmtDate = (v?: string | null) => (v ? new Date(v.length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const fmtTime = (v?: string | null) => (v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const emptyDraft = (type: string): Draft => ({ doc_type: type, title: '', owner_room_id: '', legal_basis: '', summary: '', content: '', file_url: '', change_note: '' })

export default function RegulationWorkspace({ view, rooms }: { view: RegulationView; rooms: Room[] }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [detail, setDetail] = useState<Doc | null>(null)
  const [decide, setDecide] = useState<{ doc: Doc; version: Version; decision: 'setujui' | 'kembalikan' | 'tolak'; comments: string } | null>(null)
  const [publish, setPublish] = useState<{ doc: Doc; version: Version; number: string; effective: string; review: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data: d, error: e } = await aurekaSupabase.rpc('aureka_gov_regulation_list')
    if (e) setError(/function .* does not exist|Could not find the function/i.test(e.message) ? 'E-Regulasi aktif setelah Super Admin menjalankan migrasi 20261112100000_blueprint_program_regulation_audit.sql di Supabase.' : toUserFacingError(e, { fallback: 'Data regulasi belum dapat dimuat.' }))
    else setData(d as Payload)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (detail && data) setDetail(data.documents.find((d) => d.id === detail.id) || null) }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true); setNotice(''); setError('')
    const { error: e } = await fn()
    setBusy(false)
    if (e) { setError(toUserFacingError(e as Error, { fallback: 'Perubahan belum tersimpan.' })); return false }
    setNotice(ok); await load(); return true
  }

  const docs = useMemo(() => {
    const all = data?.documents ?? []
    const q = search.trim().toLowerCase()
    const byView = view === 'keputusan' ? all.filter((d) => d.doc_type === 'keputusan_direktur')
      : view === 'spo' ? all.filter((d) => d.doc_type === 'spo')
      : view === 'pedoman' ? all.filter((d) => ['pedoman', 'panduan'].includes(d.doc_type))
      : view === 'kebijakan' ? all.filter((d) => d.doc_type === 'kebijakan')
      : view === 'monitoring' ? all.filter((d) => Boolean(d.published_version_id) && Boolean(d.versions.find((v) => v.id === d.published_version_id)?.review_date))
      : view === 'approval' ? all.filter((d) => ['menunggu_direktur', 'disetujui', 'dikembalikan'].includes(d.status) || d.versions.some((v) => ['menunggu_direktur', 'disetujui'].includes(v.status)))
      : all
    return q ? byView.filter((d) => (d.title + ' ' + (d.doc_number || '') + ' ' + (d.room_name || '')).toLowerCase().includes(q)) : byView
  }, [data, view, search])
  const current = (d: Doc) => d.versions.find((v) => v.id === d.current_version_id) || d.versions[0]
  const published = (d: Doc) => d.versions.find((v) => v.id === d.published_version_id)

  const title = { keputusan: 'Keputusan Direktur', spo: 'Standar Prosedur Operasional', pedoman: 'Pedoman dan Panduan', kebijakan: 'Kebijakan Rumah Sakit', approval: 'Persetujuan Elektronik', history: 'Riwayat Versi', monitoring: 'Monitoring Regulasi' }[view]
  const history = useMemo(() => (data?.documents ?? []).flatMap((d) => d.versions.map((v) => ({ d, v }))).sort((a, b) => b.v.created_at.localeCompare(a.v.created_at)), [data])

  return (
    <section className="rmPanel govWorkspace" aria-label={'E-Regulasi · ' + title}>
      <div className="rmSectionHead">
        <div>
          <span className="rmEyebrow">E-Regulasi</span>
          <h3>{title}</h3>
          <p>{view === 'approval' ? 'Persetujuan melekat pada versi dan sidik isi (hash). Perubahan isi setelah disetujui wajib menjadi versi baru dan diajukan ulang.' : 'Dokumen formal rumah sakit dengan pengendalian versi. Versi lama tetap tersimpan sebagai arsip.'}</p>
        </div>
        <div className="govHeadTools">
          <input type="search" className="govSearch" placeholder="Cari judul / nomor…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cari regulasi" />
          {data?.can_draft && !['history', 'approval', 'monitoring'].includes(view) && <button type="button" className="rmButton primary" onClick={() => setDraft(emptyDraft(view === 'keputusan' ? 'keputusan_direktur' : view === 'spo' ? 'spo' : view === 'pedoman' ? 'pedoman' : 'kebijakan'))}>+ Dokumen baru</button>}
        </div>
      </div>
      {error && <div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
      {notice && <div className="rmNotice" role="status"><span>Informasi</span><p>{notice}</p></div>}
      {view === 'approval' && <div className="govCallout">Persetujuan di AUREKA adalah <b>persetujuan elektronik internal</b> (tercatat nama, waktu, dan hash isi). Bila diperlukan tanda tangan elektronik tersertifikasi, gunakan layanan TTE resmi.</div>}

      {loading ? <div className="rmLoading"><span className="rmSpinner" />Memuat…</div> : data && (view === 'history' ? (
        <WorkspaceTableViewport label="Riwayat versi regulasi" className="rmTableWrap"><table className="rmTable"><thead><tr><th>Dokumen</th><th>Versi</th><th>Status</th><th>Catatan perubahan</th><th>Dibuat</th><th>Keputusan Direktur</th></tr></thead><tbody>
          {history.length ? history.map(({ d, v }) => <tr key={v.id}><td><b>{d.title}</b><small className="rmCellSmall">{TYPE_LABEL[d.doc_type]}{d.doc_number ? ' · ' + d.doc_number : ''}</small></td><td>v{v.version_no}</td><td><span className={'govStatus ' + v.status}>{STATUS_LABEL[v.status] || v.status}</span></td><td>{v.change_note || '—'}</td><td>{fmtTime(v.created_at)}</td><td>{v.approvals.length ? v.approvals.map((a, i) => <small key={i} className="rmCellSmall">{a.decision} · {a.approver_name} · {fmtTime(a.decided_at)}</small>) : '—'}</td></tr>) : <tr><td colSpan={6}><div className="rmEmptySmall">Belum ada versi tersimpan.</div></td></tr>}
        </tbody></table></WorkspaceTableViewport>
      ) : (
        <WorkspaceTableViewport label="Daftar regulasi" className="rmTableWrap"><table className="rmTable"><thead><tr><th>Dokumen</th><th>Jenis</th><th>Unit pemilik</th><th>Versi berlaku</th><th>Versi kerja</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {docs.length ? docs.map((d) => { const cur = current(d); const pub = published(d); return <tr key={d.id}>
            <td><b>{d.title}</b>{d.doc_number && <small className="rmCellSmall">{d.doc_number}</small>}</td>
            <td>{TYPE_LABEL[d.doc_type] || d.doc_type}</td>
            <td>{d.room_name || '—'}</td>
            <td>{pub ? <>v{pub.version_no}<small className="rmCellSmall">berlaku {fmtDate(pub.effective_date)}</small>{pub.review_date && <small className="rmCellSmall">tinjau {fmtDate(pub.review_date)}</small>}</> : '—'}</td>
            <td>{cur ? 'v' + cur.version_no : '—'}</td>
            <td><span className={'govStatus ' + (cur?.status || d.status)}>{STATUS_LABEL[cur?.status || d.status] || d.status}</span></td>
            <td><div className="rmActions">
              <button type="button" className="rmIconButton" onClick={() => setDetail(d)}>Detail</button>
              {data.can_draft && cur && ['draft', 'dikembalikan'].includes(cur.status) && <button type="button" className="rmIconButton" onClick={() => setDraft({ document_id: d.id, doc_type: d.doc_type, title: d.title, owner_room_id: d.owner_room_id ? String(d.owner_room_id) : '', legal_basis: d.legal_basis, summary: cur.summary, content: cur.content, file_url: cur.file_url || '', change_note: cur.change_note })}>Edit</button>}
              {data.can_draft && cur && ['draft', 'dikembalikan'].includes(cur.status) && <button type="button" className="rmIconButton" disabled={busy} onClick={() => void run(() => aurekaSupabase.rpc('aureka_gov_regulation_submit', { p_document_id: d.id }), 'Diajukan ke Direktur.')}>Ajukan</button>}
              {data.can_draft && cur && ['terbit', 'ditolak', 'disetujui', 'digantikan'].includes(cur.status) && <button type="button" className="rmIconButton" onClick={() => setDraft({ document_id: d.id, doc_type: d.doc_type, title: d.title, owner_room_id: d.owner_room_id ? String(d.owner_room_id) : '', legal_basis: d.legal_basis, summary: cur.summary, content: cur.content, file_url: cur.file_url || '', change_note: '' })}>Revisi</button>}
              {data.can_approve && cur?.status === 'menunggu_direktur' && <button type="button" className="rmIconButton" onClick={() => setDecide({ doc: d, version: cur, decision: 'setujui', comments: '' })}>Putuskan</button>}
              {data.can_publish && cur?.status === 'disetujui' && <button type="button" className="rmIconButton" onClick={() => setPublish({ doc: d, version: cur, number: d.doc_number || '', effective: new Date().toISOString().slice(0, 10), review: '' })}>Terbitkan</button>}
            </div></td>
          </tr> }) : <tr><td colSpan={7}><div className="rmEmptySmall">{view === 'approval' ? 'Tidak ada dokumen yang menunggu persetujuan.' : 'Belum ada dokumen.'}</div></td></tr>}
        </tbody></table></WorkspaceTableViewport>
      ))}

      <AurekaModal open={Boolean(draft)} size="xl" title={draft?.document_id ? 'Ubah / revisi dokumen' : 'Dokumen baru'} subtitle="Disimpan sebagai draft. Bila versi terakhir sudah diajukan atau disetujui, perubahan otomatis menjadi versi baru." closeDisabled={busy} onClose={() => setDraft(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy || !draft || draft.title.trim().length < 5} onClick={async () => { if (draft && await run(() => aurekaSupabase.rpc('aureka_gov_regulation_save_draft', { p: draft }), 'Draft tersimpan.')) setDraft(null) }}>{busy ? 'Menyimpan…' : 'Simpan draft'}</button></>}>
        {draft && <div className="govForm">
          <div className="govFormRow">
            <label>Jenis dokumen<select value={draft.doc_type} onChange={(e) => setDraft({ ...draft, doc_type: e.target.value })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Unit pemilik<select value={draft.owner_room_id} onChange={(e) => setDraft({ ...draft, owner_room_id: e.target.value })}><option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          </div>
          <label>Judul<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="mis. SPO Identifikasi Pasien" /></label>
          <label>Dasar hukum / kebijakan<input value={draft.legal_basis} onChange={(e) => setDraft({ ...draft, legal_basis: e.target.value })} /></label>
          <label>Ringkasan<textarea rows={2} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></label>
          <label>Isi dokumen<textarea rows={10} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Tulis isi atau tempel teks dokumen…" /></label>
          <div className="govFormRow">
            <label>Tautan berkas (PDF/Drive, opsional)<input value={draft.file_url} onChange={(e) => setDraft({ ...draft, file_url: e.target.value })} placeholder="https://…" /></label>
            <label>Catatan perubahan<input value={draft.change_note} onChange={(e) => setDraft({ ...draft, change_note: e.target.value })} placeholder="mis. Penyesuaian alur" /></label>
          </div>
        </div>}
      </AurekaModal>

      <AurekaModal open={Boolean(detail)} size="xl" title={detail?.title || ''} subtitle={detail ? (TYPE_LABEL[detail.doc_type] + (detail.doc_number ? ' · ' + detail.doc_number : '') + (detail.room_name ? ' · ' + detail.room_name : '')) : ''} onClose={() => setDetail(null)}>
        {detail && <div className="govVersions">
          {detail.legal_basis && <p><b>Dasar:</b> {detail.legal_basis}</p>}
          {detail.versions.map((v) => <article key={v.id} className="govVersion">
            <header><b>Versi {v.version_no}</b><span className={'govStatus ' + v.status}>{STATUS_LABEL[v.status] || v.status}</span>{v.effective_date && <small>berlaku {fmtDate(v.effective_date)}</small>}</header>
            {v.change_note && <p className="govMuted">Perubahan: {v.change_note}</p>}
            {v.summary && <p>{v.summary}</p>}
            {v.content && <pre className="govContent">{v.content}</pre>}
            {v.file_url && <p><a href={v.file_url} target="_blank" rel="noreferrer">Buka berkas</a></p>}
            <p className="govMuted govHash">Sidik isi (SHA-256): {v.content_hash.slice(0, 16)}…</p>
            {v.approvals.map((a, i) => <p key={i} className="govMuted">{a.decision === 'setujui' ? '✓ Disetujui' : a.decision === 'tolak' ? '✕ Ditolak' : '↺ Dikembalikan'} oleh {a.approver_name || a.approver_role} · {fmtTime(a.decided_at)}{a.comments ? ' — ' + a.comments : ''}</p>)}
          </article>)}
        </div>}
      </AurekaModal>

      <AurekaModal open={Boolean(decide)} size="md" title="Keputusan Direktur" subtitle={decide ? decide.doc.title + ' · versi ' + decide.version.version_no : ''} closeDisabled={busy} onClose={() => setDecide(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setDecide(null)}>Batal</button><button type="button" className={decide?.decision === 'setujui' ? 'akBtn akBtnPrimary' : 'akBtn akBtnDanger'} disabled={busy || !decide || (decide.decision !== 'setujui' && decide.comments.trim().length < 10)} onClick={async () => { if (decide && await run(() => aurekaSupabase.rpc('aureka_gov_regulation_decide', { p_version_id: decide.version.id, p_decision: decide.decision, p_comments: decide.comments }), 'Keputusan tercatat.')) setDecide(null) }}>{busy ? 'Menyimpan…' : decide?.decision === 'setujui' ? 'Setujui versi ini' : decide?.decision === 'tolak' ? 'Tolak' : 'Kembalikan untuk revisi'}</button></>}>
        {decide && <div className="govForm">
          <div className="govSegment" role="radiogroup" aria-label="Keputusan">{(['setujui', 'kembalikan', 'tolak'] as const).map((k) => <button type="button" key={k} role="radio" aria-checked={decide.decision === k} className={decide.decision === k ? 'active' : ''} onClick={() => setDecide({ ...decide, decision: k })}>{k === 'setujui' ? 'Setujui' : k === 'kembalikan' ? 'Kembalikan' : 'Tolak'}</button>)}</div>
          {decide.version.summary && <p>{decide.version.summary}</p>}
          {decide.version.content && <pre className="govContent">{decide.version.content}</pre>}
          {decide.version.file_url && <p><a href={decide.version.file_url} target="_blank" rel="noreferrer">Buka berkas</a></p>}
          <label>Catatan {decide.decision === 'setujui' ? '(opsional)' : '(wajib, min. 10 karakter)'}<textarea rows={3} value={decide.comments} onChange={(e) => setDecide({ ...decide, comments: e.target.value })} /></label>
          <p className="govMuted">Persetujuan akan mengikat sidik isi {decide.version.content_hash.slice(0, 16)}… dan dicatat di audit log.</p>
        </div>}
      </AurekaModal>

      <AurekaModal open={Boolean(publish)} size="md" title="Terbitkan dokumen" subtitle={publish ? publish.doc.title + ' · versi ' + publish.version.version_no : ''} closeDisabled={busy} onClose={() => setPublish(null)}
        footer={<><button type="button" className="akBtn akBtnGhost" onClick={() => setPublish(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy || !publish || publish.number.trim().length < 3} onClick={async () => { if (publish && await run(() => aurekaSupabase.rpc('aureka_gov_regulation_publish', { p_version_id: publish.version.id, p_doc_number: publish.number, p_effective_date: publish.effective || null, p_review_date: publish.review || null }), 'Dokumen diterbitkan. Versi sebelumnya otomatis menjadi "digantikan".')) setPublish(null) }}>{busy ? 'Memproses…' : 'Terbitkan'}</button></>}>
        {publish && <div className="govForm">
          <label>Nomor dokumen<input value={publish.number} onChange={(e) => setPublish({ ...publish, number: e.target.value })} placeholder="mis. 445/123/SPO/2026" /></label>
          <div className="govFormRow">
            <label>Tanggal berlaku<input type="date" value={publish.effective} onChange={(e) => setPublish({ ...publish, effective: e.target.value })} /></label>
            <label>Tanggal tinjau ulang<input type="date" value={publish.review} onChange={(e) => setPublish({ ...publish, review: e.target.value })} /></label>
          </div>
        </div>}
      </AurekaModal>
    </section>
  )
}
