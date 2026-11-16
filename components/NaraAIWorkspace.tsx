'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import TanyaAureka, { type TanyaMessage } from '@/components/TanyaAureka'
import { aurekaConfirm } from '@/components/ui/aurekaConfirm'
import NaraICD10Review from '@/components/NaraICD10Review'

const ENGINES = ['Groq', 'NVIDIA', 'Gemini', 'DeepSeek', 'LLM7'] as const

// Ikon garis seragam (stroke 1.8) untuk tiap fokus analisis.
const GLYPH: Record<string, ReactNode> = {
  executive: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  quality: <><path d="M5 19V11" /><path d="M10 19V7" /><path d="M15 19v-5" /><path d="M20 19V5" /></>,
  safety: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  risk: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5" /><path d="M12 17.2v.3" /></>,
  strategy: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>,
  research: <><path d="M9 4h6" /><path d="M10 4v5.5L5.2 18a1.5 1.5 0 0 0 1.3 2.2h11a1.5 1.5 0 0 0 1.3-2.2L14 9.5V4" /><path d="M7.5 15h9" /></>,
  diagnosis: <><path d="M4 6h16M4 12h10M4 18h8" /><circle cx="18" cy="16" r="3" /><path d="m16.5 16 1 1 2-2" /></>,
}

const MODES = [
  { id:'executive', label:'Ringkasan eksekutif', detail:'Prioritas dan keputusan untuk manajemen', prompt:'Susun executive brief kondisi mutu, keselamatan pasien, dan manajemen risiko rumah sakit saat ini. Tampilkan temuan utama, prioritas, dan keputusan yang perlu diambil manajemen.' },
  { id:'quality', label:'Analisis mutu', detail:'Indikator yang belum capai target dan trennya', prompt:'Analisis capaian indikator mutu rumah sakit. Identifikasi indikator yang belum mencapai target, pola penting, kemungkinan penyebab, dan rekomendasi perbaikannya.' },
  { id:'safety', label:'Keselamatan pasien', detail:'Pola insiden dan bahan pembelajaran', prompt:'Buat analisis keselamatan pasien berdasarkan data agregat yang tersedia. Identifikasi pola, prioritas pembelajaran, dan rekomendasi penguatan sistem.' },
  { id:'risk', label:'Analisis risiko', detail:'Prioritas risiko, FMEA, dan RTP', prompt:'Analisis profil manajemen risiko rumah sakit. Prioritaskan risiko tinggi dan sangat tinggi, evaluasi tindak pengendalian, dan berikan rekomendasi.' },
  { id:'strategy', label:'Saran strategis', detail:'Lima prioritas berbasis data', prompt:'Bertindak sebagai strategic advisor rumah sakit. Rumuskan 5 prioritas strategis berbasis data mutu, keselamatan pasien, dan manajemen risiko, lengkap dengan indikator keberhasilan.' },
  { id:'research', label:'Riset & statistik', detail:'Metode, asumsi, dan interpretasi', prompt:'Bantu saya melakukan analisis ilmiah dan statistik untuk peningkatan mutu rumah sakit. Jelaskan metode, asumsi, keterbatasan data, dan interpretasi secara akademik.' },
  { id:'diagnosis', label:'Diagnosis & ICD-10', detail:'10 penyakit terbanyak dan status koding', prompt:'Tampilkan 10 diagnosis/penyakit terbanyak pada tahun berjalan dari analitik klinis NARA. Jelaskan apakah basisnya episode atau pasien unik, tunjukkan status koding ICD-10 (tervalidasi atau belum), serta jelaskan kelengkapan dan batasan data. Jangan tampilkan identitas pasien atau nomor rekam medis.' },
] as const

function NaraAvatar({ size = 58 }: { size?: number }) {
  return <span className="naraHeroAvatar" style={{ width:size, height:size }} role="img" aria-label="Avatar NARA AI">
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id="naraHeroGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#43e0c8"/><stop offset="1" stopColor="#3887dc"/></linearGradient></defs>
      <rect x="1" y="1" width="46" height="46" rx="15" fill="#102d4c"/><path d="M24 5 39 13.5v17L24 39 9 30.5v-17L24 5Z" fill="url(#naraHeroGradient)" opacity=".25"/>
      <path d="M14 18.5c0-5.4 4.3-9.5 10-9.5s10 4.1 10 9.5v9c0 5.1-4.3 9-10 9s-10-3.9-10-9v-9Z" fill="#e8f8ff"/><path d="M18 23h.2M29.8 23h.2" stroke="#153e61" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M19 29c1.4 1.7 2.9 2.5 5 2.5s3.6-.8 5-2.5" fill="none" stroke="#2876bd" strokeWidth="2" strokeLinecap="round"/><path d="M24 4v5M21 4h6" stroke="#45d9ca" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="10" cy="22" r="2" fill="#45d9ca"/><circle cx="38" cy="22" r="2" fill="#45d9ca"/>
    </svg></span>
}

type Room = { id: number; name: string }
type ClinicalCoverage = { source_basis?: string; year?: number; patient_count?: number; episode_count?: number; diagnosis_group_count?: number; limitations?: string; scope?: string }
type Convo = { id: string; title: string; updatedAt: number }
const LIST_KEY = 'aureka-nara-convos'
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const greetingFor = (h: number) => h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
const dayGroup = (t: number) => {
  const d = new Date(t), today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (t >= start) return 'Hari ini'
  if (t >= start - 6 * 86_400_000) return '7 hari terakhir'
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(d)
}

/** NARA AI — tata letak "fokus chat": riwayat percakapan di kiri, sapaan + kotak tanya besar di tengah. */
export default function NaraAIWorkspace({ sb, page, userName = '' }: { sb: SupabaseClient; page?: string; userName?: string; rooms?: Room[]; isAdmin?: boolean; roomId?: number | null; showSafety?: boolean }) {
  const [uid, setUid] = useState<string | null>(null)
  const [convos, setConvos] = useState<Convo[]>([])
  const [activeId, setActiveId] = useState<string>(() => newId())
  const [listOpen, setListOpen] = useState(false)
  const [showCodingReview, setShowCodingReview] = useState(false)
  const [clinicalCoverage, setClinicalCoverage] = useState<ClinicalCoverage | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(true)

  const listKey = uid ? LIST_KEY + ':' + uid : null
  useEffect(() => {
    let cancelled = false
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const id = data.session?.user?.id ?? null
      setUid(id)
      try {
        const raw = id ? localStorage.getItem(LIST_KEY + ':' + id) : null
        // Buang percakapan yang isinya sudah tidak ada (mis. terhapus saat logout), supaya tidak ada riwayat kosong yang tak bisa dibuka.
        const list = (raw ? (JSON.parse(raw) as Convo[]) : []).filter((c) => id && localStorage.getItem('nara-ai-history:' + id + ':nara:' + c.id))
        setConvos(list)
        if (id) localStorage.setItem(LIST_KEY + ':' + id, JSON.stringify(list))
        if (list[0] && Date.now() - list[0].updatedAt < 6 * 3_600_000) setActiveId(list[0].id) // lanjutkan percakapan terakhir (<6 jam)
      } catch { /* penyimpanan tidak tersedia */ }
    })
    return () => { cancelled = true }
  }, [sb])
  useEffect(() => {
    let cancelled = false
    const year = new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear()
    void sb.rpc('aureka_nara_clinical_summary', { p_year: year, p_room: null, p_limit: 10 }).then(({ data, error }) => {
      if (cancelled) return
      setClinicalCoverage(!error && data && typeof data === 'object' ? data as ClinicalCoverage : null)
      setCoverageLoading(false)
    }, () => { if (!cancelled) setCoverageLoading(false) })
    return () => { cancelled = true }
  }, [sb])

  const persist = useCallback((list: Convo[]) => {
    setConvos(list)
    try { if (listKey) localStorage.setItem(listKey, JSON.stringify(list.slice(0, 50))) } catch { /* abaikan */ }
  }, [listKey])

  // Judul percakapan = pertanyaan pertama; urutan = terakhir dipakai.
  const onMessages = useCallback((msgs: TanyaMessage[]) => {
    if (!msgs.length) return
    const first = msgs.find((m) => m.role === 'user')?.text?.trim() || 'Percakapan'
    setConvos((prev) => {
      const existing = prev.find((c) => c.id === activeId)
      const next: Convo = { id: activeId, title: existing?.title || (first.length > 60 ? first.slice(0, 57) + '…' : first), updatedAt: Date.now() }
      const list = [next, ...prev.filter((c) => c.id !== activeId)]
      try { if (listKey) localStorage.setItem(listKey, JSON.stringify(list.slice(0, 50))) } catch { /* abaikan */ }
      return list
    })
  }, [activeId, listKey])

  const startNew = () => { setActiveId(newId()); setListOpen(false) }
  const openConvo = (id: string) => { setActiveId(id); setListOpen(false) }
  const removeConvo = async (c: Convo) => {
    if (!(await aurekaConfirm('Percakapan "' + c.title + '" akan dihapus dari perangkat ini.', { title: 'Hapus percakapan?', confirmLabel: 'Hapus', danger: true }))) return
    try { if (uid) localStorage.removeItem('nara-ai-history:' + uid + ':nara:' + c.id) } catch { /* abaikan */ }
    persist(convos.filter((x) => x.id !== c.id))
    if (c.id === activeId) setActiveId(newId())
  }

  const groups = useMemo(() => {
    const map = new Map<string, Convo[]>()
    convos.forEach((c) => { const g = dayGroup(c.updatedAt); map.set(g, [...(map.get(g) ?? []), c]) })
    return [...map.entries()]
  }, [convos])

  const firstName = (userName || '').split(/[\s@]/)[0]
  const stage = useMemo(() => ({
    title: `${greetingFor(new Date().getHours())}${firstName ? ', ' + firstName : ''}. Mau analisis apa?`,
    subtitle: 'NARA menganalisis data AUREKA sesuai hak akses. No. RM hanya digunakan internal untuk deduplikasi dan tidak dikirim ke provider AI.',
    starters: MODES.map((m) => ({ label: m.label, prompt: m.prompt, icon: <svg className="naraStarterIco" viewBox="0 0 24 24" aria-hidden="true">{GLYPH[m.id]}</svg> })),
  }), [firstName])

  return <div className={'naraWorkspace' + (listOpen ? ' listOpen' : '')} aria-label="NARA AI">
    <aside className="naraHistory" aria-label="Riwayat percakapan NARA">
      <button type="button" className="naraNew" onClick={startNew}><span aria-hidden="true">+</span> Percakapan baru</button>
      <div className="naraHistoryList">
        {groups.length === 0 && <p className="naraEmpty">Belum ada percakapan. Pertanyaan Anda akan tersimpan di sini, hanya di perangkat ini.</p>}
        {groups.map(([label, items]) => <div key={label} className="naraGroup">
          <h3>{label}</h3>
          {items.map((c) => <div key={c.id} className={'naraItem' + (c.id === activeId ? ' on' : '')}>
            <button type="button" className="naraItemOpen" aria-current={c.id === activeId ? 'true' : undefined} onClick={() => openConvo(c.id)} title={c.title}>{c.title}</button>
            <button type="button" className="naraItemDel" aria-label={'Hapus percakapan ' + c.title} onClick={() => void removeConvo(c)}>×</button>
          </div>)}
        </div>)}
      </div>
      <details className="naraEngines">
        <summary><span className="naraLiveDot" aria-hidden="true"/> {ENGINES.length} provider didukung</summary>
        <div className="naraEnginesMenu">
          <ul>{ENGINES.map((name) => <li key={name}><span className="naraEngineDot" aria-hidden="true"/>{name}</li>)}</ul>
          <p>Gateway memilih provider sesuai ketersediaan secret, konfigurasi, kuota, dan waktu respons. Tidak semua provider harus aktif bersamaan; kunci API tetap di server.</p>
        </div>
      </details>
      <section className="naraCoverageCard" aria-label="Cakupan data diagnosis">
        <small>CAKUPAN DATA KLINIS</small>
        {coverageLoading ? <p>Memeriksa sumber klinis...</p> : clinicalCoverage ? <>
          <strong>{Number(clinicalCoverage.patient_count || 0).toLocaleString('id-ID')} pasien pada basis analisis</strong>
          <span>{clinicalCoverage.source_basis === 'episode_records' ? 'Analisis berbasis episode klinis AUREKA' : clinicalCoverage.source_basis === 'patient_index_latest_diagnosis' ? 'Sumber saat ini: diagnosis terakhir per pasien' : 'Belum ada sumber diagnosis yang memenuhi cakupan'}</span>
          {clinicalCoverage.source_basis === 'episode_records' && <span>{Number(clinicalCoverage.episode_count || 0).toLocaleString('id-ID')} episode klinis</span>}
          {clinicalCoverage.limitations && <p>{clinicalCoverage.limitations}</p>}
        </> : <p>Sumber analitik diagnosis belum dapat diakses oleh akun ini.</p>}
      </section>
      <div className="naraPrivacyNote">Privasi klinis: No. RM hanya dipakai internal untuk pencocokan dan deduplikasi di database. Provider AI hanya menerima ringkasan agregat; nama, No. RM, NIK, dan kontak tidak dikirim.</div>
      <button type="button" className="naraCodingToggle" onClick={() => setShowCodingReview((v) => !v)} aria-expanded={showCodingReview}>Kamus diagnosis & validasi ICD-10</button>
    </aside>

    <section className="naraStageWrap" aria-label="Percakapan dengan NARA">
      <div className="naraMobileBar">
        <button type="button" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>{listOpen ? 'Tutup riwayat' : 'Riwayat'}</button>
        <button type="button" onClick={startNew}>+ Baru</button>
      </div>
      <TanyaAureka key={activeId} sb={sb} page={page || 'NARA AI'} embedded assistantName="NARA AI" assistantSubtitle="Membaca data sesuai hak akses Anda" showAvatar storageScope={'nara:' + activeId} onMessages={onMessages} stage={stage}/>
    </section>
    {showCodingReview && <div className="naraCodingWorkspace"><NaraICD10Review sb={sb}/></div>}

    <style jsx>{`
      .naraWorkspace{display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;min-width:0;min-height:calc(100dvh - 190px);color:#1f2430}
      .naraHistory{display:flex;flex-direction:column;gap:12px;min-height:0;padding:14px;border-radius:22px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.9);position:sticky;top:96px;max-height:calc(100dvh - 120px)}
      .naraNew{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:0;border-radius:14px;background:#1f2430;color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer;transition:transform .12s ease}
      .naraNew:active{transform:scale(.98)}.naraNew span{font-size:18px;line-height:1}
      .naraHistoryList{flex:1;min-height:0;overflow:auto;display:grid;align-content:start;gap:12px;margin:0 -4px;padding:0 4px}
      .naraEmpty{margin:4px;font-size:13px;line-height:1.5;color:#6b7684}
      .naraGroup{display:grid;gap:2px;min-width:0}.naraGroup>*{min-width:0}
      .naraGroup h3{margin:0 8px 4px!important;font-size:12px!important;line-height:1.3!important;font-weight:700!important;color:#6b7684}
      .naraItem{display:flex;align-items:center;min-width:0;max-width:100%;overflow:hidden;border-radius:11px;transition:background-color .15s ease}
      .naraItem:hover{background:rgba(255,255,255,.7)}
      .naraItem.on{background:#fff;box-shadow:0 4px 12px rgba(15,35,60,.06)}
      .naraItemOpen{display:block;flex:1 1 0;width:0;min-width:0;min-height:38px;padding:0 6px 0 10px!important;border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;text-align:left;font:inherit;font-size:13px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .naraItem.on .naraItemOpen{color:#1f2430;font-weight:700}
      .naraItemDel{width:30px;height:30px;min-width:30px;flex:0 0 30px;margin-right:4px;padding:0!important;border:0!important;border-radius:8px!important;background:transparent!important;box-shadow:none!important;color:#94a3b8;font-size:16px;cursor:pointer;opacity:0;transition:opacity .15s ease,background-color .15s ease,color .15s ease}
      .naraItem:hover .naraItemDel,.naraItem.on .naraItemDel,.naraItemDel:focus-visible{opacity:1}
      .naraItemDel:hover{background:#fdecea!important;color:#b42318}
      @media(hover:none){.naraItemDel{opacity:1}}
      .naraNew:focus-visible,.naraItemOpen:focus-visible,.naraItemDel:focus-visible,.naraEngines summary:focus-visible{outline:2px solid rgba(34,211,238,.7);outline-offset:2px}
      .naraEngines{position:relative}
      .naraEngines summary{display:flex;align-items:center;gap:8px;min-height:38px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.7);border:1px solid #dfe7f0;font-size:13px;font-weight:700;color:#1f2430;cursor:pointer;list-style:none}
      .naraEngines summary::-webkit-details-marker{display:none}
      .naraEnginesMenu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:20;width:240px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #dfe7f0;box-shadow:0 18px 40px rgba(31,36,48,.14)}
      .naraEnginesMenu ul{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}
      .naraEnginesMenu li{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
      .naraEnginesMenu p{margin:0;font-size:12px;line-height:1.5;color:#5b6878}
      .naraLiveDot{width:8px;height:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15);flex:0 0 auto}.naraEngineDot{width:7px;height:7px;border-radius:50%;background:#7b91a8;flex:0 0 auto}
      .naraCoverageCard{display:grid;gap:6px;padding:12px;border:1px solid #dce5ed;border-radius:13px;background:rgba(255,255,255,.78);color:#263e52}
      .naraCoverageCard small{font-size:9px;letter-spacing:.12em;font-weight:850;color:#527f96}
      .naraCoverageCard strong{font-size:12px}.naraCoverageCard span,.naraCoverageCard p{margin:0;font-size:10px;line-height:1.45;color:#63788a}
      .naraPrivacyNote{font-size:10px;line-height:1.5;color:#5e7180;padding:0 2px}
      .naraCodingWorkspace{grid-column:1 / -1;min-width:0}.naraCodingToggle{min-height:38px;padding:0 12px;border:1px solid #dfe7f0;border-radius:12px;background:rgba(255,255,255,.75);color:#23445d;font-size:12px;font-weight:750;cursor:pointer}.naraCodingToggle:hover{background:#fff;border-color:#9ab7c9}
      .naraStageWrap{min-width:0;display:flex;flex-direction:column;border-radius:26px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(31,36,48,.05);overflow:hidden}
      .naraMobileBar{display:none}
      .naraStageWrap :global(.tanyaPanelEmbedded){flex:1;min-height:0;display:flex;flex-direction:column;background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important}
      .naraStageWrap :global(.tanyaPanelEmbedded .tanyaClose){display:none}
      .naraStageWrap :global(.tanyaPanelEmbedded .tanyaList){flex:1;min-height:0;max-height:none!important;overflow:auto}
      .naraStageWrap :global(.tanyaStaged){justify-content:center;align-items:center;gap:18px;padding:48px 24px 28px}
      .naraStageWrap :global(.tanyaStage){display:grid;justify-items:center;gap:10px;text-align:center}
      .naraStageWrap :global(.tanyaStage h2){margin:6px 0 0!important;font-size:clamp(24px,2.6vw,34px)!important;line-height:1.15!important;font-weight:800!important;letter-spacing:-.03em;color:#1f2430;text-wrap:balance}
      .naraStageWrap :global(.tanyaStage p){margin:0;max-width:56ch;font-size:15px;color:#4b5565}
      .naraStageWrap :global(.tanyaStaged .tanyaComposer){width:min(740px,100%);padding:8px 8px 8px 16px;border-radius:20px;background:#fff;border:1px solid #dfe7f0;box-shadow:0 12px 32px rgba(15,35,60,.09)}
      .naraStageWrap :global(.tanyaStaged .tanyaComposer textarea){font-size:15px;border:0!important;background:transparent!important;padding:10px 4px!important;box-shadow:none!important}
      .naraStageWrap :global(.tanyaStaged .tanyaComposer){border-top:1px solid #dfe7f0}
      .naraStageWrap :global(.tanyaStageChips){display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:780px}
      .naraStageWrap :global(.tanyaStageChips button){display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid #dfe7f0;background:#fff;font:inherit;font-size:13px;font-weight:600;color:#1f2430;cursor:pointer;transition:border-color .15s ease,transform .15s ease}
      .naraStageWrap :global(.tanyaStageChips button:hover){border-color:rgba(14,116,144,.45);transform:translateY(-1px)}
      .naraStageWrap :global(.naraStarterIco){width:16px;height:16px;fill:none;stroke:#0e7490;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
      .naraStageWrap :global(.tanyaStaged .tanyaNote){margin-top:4px;text-align:center}
      @media(prefers-reduced-motion:no-preference){.naraStageWrap :global(.tanyaStage),.naraStageWrap :global(.tanyaStageChips){animation:naraRise .45s cubic-bezier(.22,1,.36,1) both}.naraStageWrap :global(.tanyaStageChips){animation-delay:.08s}}
      @keyframes naraRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @media(max-width:900px){
        .naraWorkspace{grid-template-columns:1fr;min-height:calc(100dvh - 230px)}
        .naraHistory{display:none;position:static;max-height:none}
        .naraWorkspace.listOpen .naraHistory{display:flex}
        .naraMobileBar{display:flex;justify-content:space-between;gap:8px;padding:10px 12px 0}
        .naraMobileBar button{min-height:38px;padding:0 14px;border-radius:12px;border:1px solid #dfe7f0;background:#fff;font:inherit;font-size:13px;font-weight:700;color:#1f2430}
        .naraStageWrap :global(.tanyaStaged){padding:28px 16px 20px}
      }
      @media(prefers-reduced-motion:reduce){.naraNew,.naraItem,.naraItemDel{transition:none}}
      :global(html[data-mode="gelap"]) .naraWorkspace{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraHistory,:global(html[data-mode="gelap"]) .naraStageWrap{background:rgba(20,27,38,.72);border-color:rgba(255,255,255,.1);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraNew{background:#eef2f7;color:#0f1218}
      :global(html[data-mode="gelap"]) .naraItem:hover{background:rgba(255,255,255,.05)}
      :global(html[data-mode="gelap"]) .naraItem.on{background:rgba(255,255,255,.08);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraItemOpen{color:#c3ccd8}:global(html[data-mode="gelap"]) .naraItem.on .naraItemOpen{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraGroup h3,:global(html[data-mode="gelap"]) .naraEmpty,:global(html[data-mode="gelap"]) .naraEnginesMenu p{color:#93a1b3}
      :global(html[data-mode="gelap"]) .naraCoverageCard{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:#eaf0f6}:global(html[data-mode="gelap"]) .naraCoverageCard span,:global(html[data-mode="gelap"]) .naraCoverageCard p,:global(html[data-mode="gelap"]) .naraPrivacyNote{color:#aab6c6}
      :global(html[data-mode="gelap"]) .naraEngines summary,:global(html[data-mode="gelap"]) .naraMobileBar button{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraEnginesMenu{background:#141b26;border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStage h2){color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStage p){color:#aab6c6}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStaged .tanyaComposer textarea){color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStaged .tanyaComposer),:global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStageChips button){background:#141b26;border-color:rgba(255,255,255,.12);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.naraStarterIco){stroke:#8ee3ea}
    `}</style>
  </div>
}
