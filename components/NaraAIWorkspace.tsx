'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import TanyaAureka, { type TanyaMessage } from '@/components/TanyaAureka'
import NaraIcd10ReviewWorkspace from '@/components/NaraIcd10ReviewWorkspace'
import { aurekaConfirm } from '@/components/ui/aurekaConfirm'


// Ikon garis seragam (stroke 1.8) untuk tiap fokus analisis.
const GLYPH: Record<string, ReactNode> = {
  executive: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  quality: <><path d="M5 19V11" /><path d="M10 19V7" /><path d="M15 19v-5" /><path d="M20 19V5" /></>,
  safety: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  risk: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5" /><path d="M12 17.2v.3" /></>,
  strategy: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>,
  research: <><path d="M9 4h6" /><path d="M10 4v5.5L5.2 18a1.5 1.5 0 0 0 1.3 2.2h11a1.5 1.5 0 0 0 1.3-2.2L14 9.5V4" /><path d="M7.5 15h9" /></>,
  clinical: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,

}

const MODES = [
  { id:'executive', label:'Ringkasan eksekutif', detail:'Prioritas dan keputusan untuk manajemen', prompt:'Susun executive brief kondisi mutu, keselamatan pasien, dan manajemen risiko rumah sakit saat ini. Tampilkan temuan utama, prioritas, dan keputusan yang perlu diambil manajemen.' },
  { id:'quality', label:'Analisis mutu', detail:'Indikator yang belum capai target dan trennya', prompt:'Analisis capaian indikator mutu rumah sakit. Identifikasi indikator yang belum mencapai target, pola penting, kemungkinan penyebab, dan rekomendasi perbaikannya.' },
  { id:'safety', label:'Keselamatan pasien', detail:'Pola insiden dan bahan pembelajaran', prompt:'Buat analisis keselamatan pasien berdasarkan data agregat yang tersedia. Identifikasi pola, prioritas pembelajaran, dan rekomendasi penguatan sistem.' },
  { id:'risk', label:'Analisis risiko', detail:'Prioritas risiko, FMEA, dan RTP', prompt:'Analisis profil manajemen risiko rumah sakit. Prioritaskan risiko tinggi dan sangat tinggi, evaluasi tindak pengendalian, dan berikan rekomendasi.' },
  { id:'strategy', label:'Saran strategis', detail:'Lima prioritas berbasis data', prompt:'Bertindak sebagai strategic advisor rumah sakit. Rumuskan 5 prioritas strategis berbasis data mutu, keselamatan pasien, dan manajemen risiko, lengkap dengan indikator keberhasilan.' },
  { id:'research', label:'Riset & statistik', detail:'Metode, asumsi, dan interpretasi', prompt:'Bantu saya melakukan analisis ilmiah dan statistik untuk peningkatan mutu rumah sakit. Jelaskan metode, asumsi, keterbatasan data, dan interpretasi secara akademik.' },
  { id:'clinical', label:'Analisis diagnosis & ICD-10', detail:'Pola diagnosis, variasi ejaan, dan usulan koding', prompt:'Analisis diagnosis terakhir pasien yang tersedia di Database Pasien AUREKA. Jelaskan 10 diagnosis terbanyak berdasarkan pasien unik, bedakan dengan data episode Logbook, lalu usulkan pemetaan ICD-10 WHO 2019 untuk istilah diagnosis yang memenuhi ambang privasi. Periksa variasi ejaan dan typo, tetapi jangan menyamakan kondisi klinis yang berbeda. Semua kode adalah usulan sampai diverifikasi PMIK/DPJP.' },

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
export default function NaraAIWorkspace({ sb, page, userName = '', initialPrompt, onInitialPromptConsumed }: { sb: SupabaseClient; page?: string; userName?: string; initialPrompt?: string; onInitialPromptConsumed?: () => void; rooms?: Room[]; roomId?: number | null; showSafety?: boolean }) {
  const [uid, setUid] = useState<string | null>(null)
  const [convos, setConvos] = useState<Convo[]>([])
  const [activeId, setActiveId] = useState<string>(() => newId())
  const [listOpen, setListOpen] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'chat' | 'icd10'>('chat')


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

  const startNew = () => { setActiveId(newId()); setListOpen(false); setWorkspaceView('chat') }
  const openConvo = (id: string) => { setActiveId(id); setListOpen(false); setWorkspaceView('chat') }
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
    starters: MODES.map((m) => ({ label: m.label, prompt: m.prompt, icon: <svg className="naraStarterIco" viewBox="0 0 24 24" aria-hidden="true">{GLYPH[m.id]}</svg> })),
  }), [firstName])

  return <div className={'naraWorkspace' + (listOpen ? ' listOpen' : '')} aria-label="NARA AI">
    <aside className="naraHistory" aria-label="Riwayat percakapan NARA">
      <button type="button" className="naraNew" onClick={startNew}><span aria-hidden="true">+</span> Percakapan baru</button>
      <button type="button" className="naraReviewNav" aria-pressed={workspaceView === 'icd10'} onClick={() => { setWorkspaceView('icd10'); setListOpen(false) }}>Validasi ICD-10</button>
      <div className="naraHistoryList">
        {groups.length === 0 && <p className="naraEmpty">Belum ada percakapan</p>}
        {groups.map(([label, items]) => <div key={label} className="naraGroup">
          <h3>{label}</h3>
          {items.map((c) => <div key={c.id} className={'naraItem' + (c.id === activeId ? ' on' : '')}>
            <button type="button" className="naraItemOpen" aria-current={c.id === activeId ? 'true' : undefined} onClick={() => openConvo(c.id)} title={c.title}>{c.title}</button>
            <button type="button" className="naraItemDel" aria-label={'Hapus percakapan ' + c.title} onClick={() => void removeConvo(c)}>×</button>
          </div>)}
        </div>)}
      </div>
    </aside>

    {workspaceView === 'icd10' ? (
      <section className="naraReviewWrap" aria-label="Validasi ICD-10">
        <div className="naraMobileBar"><button type="button" onClick={() => setWorkspaceView('chat')}>Kembali ke NARA</button></div>
        <NaraIcd10ReviewWorkspace sb={sb} onBack={() => setWorkspaceView('chat')}/>
      </section>
    ) : (
      <section className="naraStageWrap" aria-label="Percakapan dengan NARA">
        <div className="naraMobileBar">
          <button type="button" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>{listOpen ? 'Tutup riwayat' : 'Riwayat'}</button>
          <button type="button" onClick={startNew}>+ Baru</button>
        </div>
      <TanyaAureka key={activeId} sb={sb} page={page || 'NARA AI'} embedded assistantName="NARA AI" showAvatar storageScope={'nara:' + activeId} onMessages={onMessages} stage={stage} initialPrompt={initialPrompt} onInitialPromptConsumed={onInitialPromptConsumed}/>
      </section>
    )}


    <style jsx>{`
      .naraWorkspace{display:grid;grid-template-columns:minmax(150px, 22%) minmax(0,1fr);gap:clamp(12px, 2vw, 22px);min-width:0;min-height:calc(100dvh - 190px);color:var(--aureka-color-foreground)}
      .naraHistory{display:flex;flex-direction:column;gap:10px;min-height:0;padding:4px 12px 4px 0;border-inline-end:1px solid var(--aureka-canvas-divider);position:sticky;top:calc(var(--aur-header-h, 64px) + 12px);align-self:start;max-height:calc(100dvh - 120px);overflow-y:auto;overscroll-behavior:contain}
      .naraHistory > :not(.naraHistoryList){flex-shrink:0}
      .naraNew{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:0;border-radius:10px;background:var(--aureka-color-primary);color:var(--aureka-color-on-primary);font:inherit;font-size:14px;font-weight:800;cursor:pointer;transition:transform .12s ease}
      .naraNew:active{transform:scale(.98)}.naraNew span{font-size:18px;line-height:1}
      .naraReviewNav{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:1px solid #d7e1eb;border-radius:13px;background:#fff;color:#1f5c7a;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:transform .12s ease,background .12s ease}
      .naraReviewNav[aria-pressed=true]{background:#e8f3f8;border-color:#9dc6d7}
      .naraReviewWrap{min-width:0;display:flex;flex-direction:column;border:0;background:transparent;box-shadow:none;overflow:hidden;padding:18px}
      .naraReviewWrap .naraMobileBar{display:none}
      .naraHistoryList{flex:1;min-height:0;overflow:auto;display:grid;align-content:start;gap:12px;margin:0 -4px;padding:0 4px}
      .naraEmpty{margin:4px;font-size:13px;line-height:1.5;color:#6b7684}
      .naraGroup{display:grid;gap:2px;min-width:0}.naraGroup>*{min-width:0}
      .naraGroup h3{margin:0 8px 4px!important;font-size:12px!important;line-height:1.3!important;font-weight:700!important;color:#6b7684}
      .naraItem{display:flex;align-items:center;min-width:0;max-width:100%;overflow:hidden;border-radius:11px;transition:background-color .15s ease}
      .naraItem:hover{background:rgba(255,255,255,.7)}
      .naraItem.on{background:#fff;box-shadow:0 4px 12px rgba(15,35,60,.06)}
      .naraItemOpen{display:block;flex:1 1 0;width:0;min-width:0;min-height:44px;padding:0 6px 0 10px!important;border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;text-align:left;font:inherit;font-size:13px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .naraItem.on .naraItemOpen{color:#1f2430;font-weight:700}
      .naraItemDel{width:44px;height:44px;min-width:44px;flex:0 0 44px;margin-right:4px;padding:0!important;border:0!important;border-radius:8px!important;background:transparent!important;box-shadow:none!important;color:#94a3b8;font-size:16px;cursor:pointer;opacity:.85;transition:opacity .15s ease,background-color .15s ease,color .15s ease}
      .naraItem:hover .naraItemDel,.naraItem.on .naraItemDel,.naraItemDel:focus-visible{opacity:1}
      .naraItemDel:hover{background:#fdecea!important;color:#b42318}
      .naraItemOpen:focus-visible,.naraItemDel:focus-visible,.naraMobileBar button:focus-visible{outline:2px solid #0e7490;outline-offset:2px}
      @media(hover:none){.naraItemDel{opacity:1}}

      .naraStageWrap{min-width:0;display:flex;flex-direction:column;border:0;background:transparent;box-shadow:none;overflow:hidden}
      .naraMobileBar{display:none}
      .naraStageWrap :global(.tanyaPanelEmbedded){flex:1;min-height:0;display:flex;flex-direction:column;background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important}
      .naraStageWrap :global(.tanyaPanelEmbedded .tanyaClose){display:none}
      .naraStageWrap :global(.tanyaPanelEmbedded .tanyaList){flex:1;min-height:0;max-height:none!important;overflow:auto}
      .naraStageWrap :global(.tanyaStaged){justify-content:center;align-items:center;gap:18px;padding:48px 24px 28px}
      .naraStageWrap :global(.tanyaStage){display:grid;justify-items:center;gap:10px;text-align:center}
      .naraStageWrap :global(.tanyaStage h2){margin:6px 0 0!important;font-size:clamp(24px,2.6vw,34px)!important;line-height:1.15!important;font-weight:800!important;letter-spacing:-.03em;color:#1f2430;text-wrap:balance}
      .naraStageWrap :global(.tanyaStage p){margin:0;max-width:56ch;font-size:15px;color:#4b5565}
      .naraStageWrap :global(.tanyaStaged .tanyaComposer){width:min(740px,100%);padding:8px 10px;border-radius:13px;background:var(--aureka-header-control);border:1px solid var(--aureka-control-edge);box-shadow:0 12px 32px rgba(15,35,60,.09)}
      .naraStageWrap :global(.tanyaStaged .tanyaComposer textarea){font-size:15px;border:0!important;background:transparent!important;padding:10px 4px!important;box-shadow:none!important}
      .naraStageWrap :global(.tanyaStaged .tanyaComposer){border-top:1px solid var(--aureka-control-edge)}
      .naraStageWrap :global(.tanyaStageChips){display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:780px}
      .naraStageWrap :global(.tanyaStageChips button){display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid #dfe7f0;background:#fff;font:inherit;font-size:13px;font-weight:600;color:#1f2430;cursor:pointer;transition:border-color .15s ease,transform .15s ease}
      .naraStageWrap :global(.tanyaStageChips button:hover){border-color:rgba(14,116,144,.45);transform:translateY(-1px)}
      .naraStageWrap :global(.naraStarterIco){width:16px;height:16px;fill:none;stroke:#0e7490;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
      .naraStageWrap :global(.tanyaStaged .tanyaNote){margin-top:4px;text-align:center}
      @media(prefers-reduced-motion:no-preference){.naraStageWrap :global(.tanyaStage),.naraStageWrap :global(.tanyaStageChips){animation:naraRise .45s cubic-bezier(.22,1,.36,1) both}.naraStageWrap :global(.tanyaStageChips){animation-delay:.08s}}
      @keyframes naraRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @media(max-width:900px){
        .naraWorkspace{grid-template-columns:1fr;min-height:calc(100dvh - 230px)}
        .naraHistory{display:none;position:static;max-height:none;overflow:visible;border-inline-end:0;border-block-end:1px solid var(--aureka-canvas-divider);padding:0 0 10px}

        .naraWorkspace.listOpen .naraHistory{display:flex;max-height:min(52dvh,420px);overflow:hidden}
        .naraMobileBar{display:flex;justify-content:space-between;gap:8px;padding:10px 12px 0}
        .naraReviewWrap{padding:10px;border-radius:18px}
        .naraReviewWrap .naraMobileBar{display:flex}
        .naraMobileBar button{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid #dfe7f0;background:#fff;font:inherit;font-size:13px;font-weight:700;color:#1f2430}
        .naraStageWrap :global(.tanyaStaged){padding:28px 16px 20px}
      }
      @media(prefers-reduced-motion:reduce){.naraNew,.naraItem,.naraItemDel{transition:none}}
      :global(html[data-mode="gelap"]) .naraWorkspace{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraHistory,:global(html[data-mode="gelap"]) .naraStageWrap{background:transparent;border-color:var(--aureka-canvas-divider);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraNew{background:#eef2f7;color:#0f1218}
      :global(html[data-mode="gelap"]) .naraReviewNav{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#b9e5f4}
      :global(html[data-mode="gelap"]) .naraReviewWrap{background:rgba(20,27,38,.72);border-color:rgba(255,255,255,.1);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraItem:hover{background:rgba(255,255,255,.05)}
      :global(html[data-mode="gelap"]) .naraItem.on{background:rgba(255,255,255,.08);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraItemOpen{color:#c3ccd8}:global(html[data-mode="gelap"]) .naraItem.on .naraItemOpen{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStage h2){color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStage p){color:#aab6c6}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStaged .tanyaComposer textarea){color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStaged .tanyaComposer),:global(html[data-mode="gelap"]) .naraStageWrap :global(.tanyaStageChips button){background:#141b26;border-color:rgba(255,255,255,.12);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraStageWrap :global(.naraStarterIco){stroke:#8ee3ea}
    `}</style>
  </div>
}
