'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import TanyaAureka from '@/components/TanyaAureka'

const ENGINES = ['Groq', 'NVIDIA', 'Gemini', 'DeepSeek', 'LLM7'] as const

// Ikon garis seragam (stroke 1.8) untuk tiap fokus analisis.
const GLYPH: Record<string, ReactNode> = {
  executive: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  quality: <><path d="M5 19V11" /><path d="M10 19V7" /><path d="M15 19v-5" /><path d="M20 19V5" /></>,
  safety: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  risk: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5" /><path d="M12 17.2v.3" /></>,
  strategy: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>,
  research: <><path d="M9 4h6" /><path d="M10 4v5.5L5.2 18a1.5 1.5 0 0 0 1.3 2.2h11a1.5 1.5 0 0 0 1.3-2.2L14 9.5V4" /><path d="M7.5 15h9" /></>,
}

const MODES = [
  { id:'executive', label:'Ringkasan eksekutif', detail:'Prioritas dan keputusan untuk manajemen', prompt:'Susun executive brief kondisi mutu, keselamatan pasien, dan manajemen risiko rumah sakit saat ini. Tampilkan temuan utama, prioritas, dan keputusan yang perlu diambil manajemen.' },
  { id:'quality', label:'Analisis mutu', detail:'Indikator yang belum capai target dan trennya', prompt:'Analisis capaian indikator mutu rumah sakit. Identifikasi indikator yang belum mencapai target, pola penting, kemungkinan penyebab, dan rekomendasi perbaikannya.' },
  { id:'safety', label:'Keselamatan pasien', detail:'Pola insiden dan bahan pembelajaran', prompt:'Buat analisis keselamatan pasien berdasarkan data agregat yang tersedia. Identifikasi pola, prioritas pembelajaran, dan rekomendasi penguatan sistem.' },
  { id:'risk', label:'Analisis risiko', detail:'Prioritas risiko, FMEA, dan RTP', prompt:'Analisis profil manajemen risiko rumah sakit. Prioritaskan risiko tinggi dan sangat tinggi, evaluasi tindak pengendalian, dan berikan rekomendasi.' },
  { id:'strategy', label:'Saran strategis', detail:'Lima prioritas berbasis data', prompt:'Bertindak sebagai strategic advisor rumah sakit. Rumuskan 5 prioritas strategis berbasis data mutu, keselamatan pasien, dan manajemen risiko, lengkap dengan indikator keberhasilan.' },
  { id:'research', label:'Riset & statistik', detail:'Metode, asumsi, dan interpretasi', prompt:'Bantu saya melakukan analisis ilmiah dan statistik untuk peningkatan mutu rumah sakit. Jelaskan metode, asumsi, keterbatasan data, dan interpretasi secara akademik.' },
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
type Brief = { done: boolean; reported: number | null; rooms: number; veryHigh: number | null; riskTotal: number | null; incidentsOpen: number | null }
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const fmtN = (n: number) => n.toLocaleString('id-ID')

export default function NaraAIWorkspace({ sb, page, userName = '', rooms = [], isAdmin = false, roomId = null, showSafety = false }: { sb: SupabaseClient; page?: string; userName?: string; rooms?: Room[]; isAdmin?: boolean; roomId?: number | null; showSafety?: boolean }) {
  const [prompt, setPrompt] = useState<string | undefined>()
  const [activeMode, setActiveMode] = useState<string | null>(null)
  const now = new Date()
  const year = now.getFullYear(), month = now.getMonth() + 1
  const scopeRooms = roomId != null ? rooms.filter((r) => Number(r.id) === Number(roomId)) : isAdmin || showSafety ? rooms : []
  const [brief, setBrief] = useState<Brief>({ done: false, reported: null, rooms: scopeRooms.length, veryHigh: null, riskTotal: null, incidentsOpen: null })

  // Angka briefing dari fungsi yang sama dengan Beranda (sesuai hak akses pengguna).
  useEffect(() => {
    let cancelled = false
    const ids = new Set(scopeRooms.map((r) => Number(r.id)))
    void (async () => {
      const [rep, sum] = await Promise.allSettled([
        sb.rpc('aureka_quality_room_reporting_status', { p_year: year }),
        showSafety ? sb.rpc('aureka_gov_infographics_summary_secure', { p_year: year, p_room: roomId }) : Promise.resolve({ data: null, error: null }),
      ])
      if (cancelled) return
      let reported: number | null = null
      if (rep.status === 'fulfilled' && !rep.value.error && Array.isArray(rep.value.data)) {
        reported = new Set((rep.value.data as { month: number; room_id: number }[]).filter((r) => Number(r.month) === month && ids.has(Number(r.room_id))).map((r) => Number(r.room_id))).size
      }
      const s = (sum.status === 'fulfilled' && !sum.value.error ? sum.value.data : null) as { risk?: { total?: number; very_high?: number }; incidents?: { open?: number } } | null
      setBrief({ done: true, reported, rooms: ids.size, veryHigh: s?.risk?.very_high ?? null, riskTotal: s?.risk?.total ?? null, incidentsOpen: s?.incidents?.open ?? null })
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, year, month, roomId, isAdmin, rooms.length, showSafety])

  const ask = (text: string, mode: string | null = null) => {
    setActiveMode(mode)
    setPrompt(text)
    window.setTimeout(() => document.querySelector('.naraChat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  // Sisa hari sampai akhir triwulan berjalan.
  const quarterEnd = new Date(year, Math.ceil(month / 3) * 3, 0)
  const daysLeft = Math.max(0, Math.ceil((quarterEnd.getTime() - now.getTime()) / 86_400_000))
  const quarter = Math.ceil(month / 3)
  const roman = ['I', 'II', 'III', 'IV'][quarter - 1]

  type Card = { key: string; tone: 'red' | 'amber' | 'green'; tag: string; area: string; value: string; text: string; prompt: string }
  const cards: Card[] = []
  if (showSafety) {
    const v = brief.veryHigh
    cards.push({ key: 'risk', tone: v ? 'red' : 'green', tag: v ? 'Perlu tindakan' : 'Aman', area: 'Manajemen risiko', value: v == null ? '–' : fmtN(v),
      text: v == null ? 'Data risiko belum dapat dimuat.' : v ? `Risiko sangat tinggi dari ${fmtN(brief.riskTotal ?? 0)} risiko terdaftar. Prioritaskan RTP-nya.` : 'Tidak ada risiko berlevel sangat tinggi.',
      prompt: 'Unit mana yang paling banyak risiko Sangat Tinggi, dan apa rekomendasi rencana tindak pengendaliannya? Urutkan dari yang paling mendesak.' })
  }
  {
    const r = brief.reported, total = brief.rooms
    const behind = r != null && total > 0 && r < total
    cards.push({ key: 'logbook', tone: r == null ? 'amber' : behind ? 'amber' : 'green', tag: behind ? 'Tenggat' : r == null ? 'Belum ada data' : 'Lengkap', area: 'Logbook mutu', value: r == null ? '–' : `${r}/${total}`,
      text: r == null ? 'Status pelaporan belum dapat dimuat.' : behind ? `Ruangan sudah lapor logbook ${MONTHS[month - 1]}. Triwulan ${roman} berakhir ${daysLeft} hari lagi.` : `Semua ruangan sudah lapor logbook ${MONTHS[month - 1]}.`,
      prompt: `Unit mana saja yang belum input logbook ${MONTHS[month - 1]} ${year}? Susun daftar dan saran pesan pengingat yang sopan untuk kepala ruangan.` })
  }
  if (showSafety) {
    const o = brief.incidentsOpen
    cards.push({ key: 'ikp', tone: o ? 'amber' : 'green', tag: o ? 'Perlu tindak lanjut' : 'Aman', area: 'Keselamatan pasien', value: o == null ? '–' : fmtN(o),
      text: o == null ? 'Data insiden belum dapat dimuat.' : o ? 'Laporan IKP masih terbuka dan menunggu investigasi atau tindak lanjut.' : 'Tidak ada laporan IKP yang tertunda.',
      prompt: 'Buat analisis keselamatan pasien berdasarkan data agregat yang tersedia. Identifikasi pola insiden, laporan yang belum ditindaklanjuti, dan prioritas pembelajaran.' })
  }
  const attention = cards.filter((c) => c.tone !== 'green').length
  const dateLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const firstName = (userName || '').split(/[\s@]/)[0]

  return <div className="naraWorkspace" aria-label="NARA AI">
    <header className="naraHello">
      <NaraAvatar size={56}/>
      <div className="naraHelloText">
        <span className="naraEyebrow">NARA AI · Briefing mutu</span>
        <h1>{firstName ? `Halo ${firstName}, ini briefing ${dateLabel}.` : `Briefing ${dateLabel}.`}</h1>
        <p>{!brief.done ? 'Menyiapkan temuan hari ini…' : attention ? `${attention} hal perlu perhatian hari ini. Tekan "Tanya NARA" untuk menggali lebih dalam.` : 'Tidak ada yang mendesak hari ini. Tanyakan apa saja di bawah.'}</p>
      </div>
      <details className="naraEngines">
        <summary><span className="naraLiveDot" aria-hidden="true"/> {ENGINES.length} mesin AI aktif</summary>
        <div className="naraEnginesMenu">
          <ul>{ENGINES.map((name) => <li key={name}><span className="naraLiveDot" aria-hidden="true"/>{name}</li>)}</ul>
          <p>Dipilih otomatis lewat gateway AUREKA. Kunci API tersimpan aman di server.</p>
        </div>
      </details>
    </header>

    <section className="naraFeed" aria-label="Temuan hari ini" style={{ '--cols': String(Math.max(1, cards.length)) } as CSSProperties}>
      {cards.map((c) => <article key={c.key} className={'naraInsight ' + c.tone}>
        <div className="naraInsightTop"><span className={'naraTag ' + c.tone}>{c.tag}</span><span className="naraArea">{c.area}</span></div>
        <strong>{brief.done ? c.value : <span className="naraSkel" aria-label="Memuat"/>}</strong>
        <p>{brief.done ? c.text : ' '}</p>
        <button type="button" className="naraAsk" disabled={!brief.done} onClick={() => ask(c.prompt)}>Tanya NARA <span aria-hidden="true">→</span></button>
      </article>)}
    </section>

    <div className="naraLower">
      <section className="naraChat" aria-label="Percakapan dengan NARA">
        <TanyaAureka sb={sb} page={page || 'NARA AI'} embedded assistantName="NARA AI" assistantSubtitle="Membaca data sesuai hak akses Anda" showAvatar initialPrompt={prompt}/>
      </section>
      <aside className="naraSide" aria-label="Analisis cepat">
        <section className="naraQuick">
          <h2>Analisis cepat</h2>
          {MODES.map((mode) => <button type="button" key={mode.id} className={'naraQuickBtn' + (activeMode === mode.id ? ' selected' : '')} aria-pressed={activeMode === mode.id} onClick={() => ask(mode.prompt, mode.id)}>
            <span className="naraQuickIco" aria-hidden="true"><svg viewBox="0 0 24 24">{GLYPH[mode.id]}</svg></span>
            <span className="naraQuickText"><b>{mode.label}</b><small>{mode.detail}</small></span>
          </button>)}
        </section>
        <p className="naraNote">NARA hanya membaca ringkasan agregat sesuai hak akses Anda. Identitas pasien tidak dikirim ke AI. Jawaban AI bisa keliru, cek kembali angka penting di modul terkait.</p>
      </aside>
    </div>

    <style jsx>{`
      .naraWorkspace{display:flex;flex-direction:column;gap:16px;min-width:0;color:#1f2430}
      .naraHello{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:22px 24px;border-radius:24px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(31,36,48,.06)}
      .naraHeroAvatar{display:grid;place-items:center;flex:0 0 auto;filter:drop-shadow(0 8px 16px rgba(20,76,112,.18))}
      .naraHelloText{flex:1 1 420px;min-width:0}
      .naraEyebrow{display:block;font-size:13px;font-weight:700;color:#0e7490}
      .naraHelloText h1{margin:2px 0 4px!important;font-size:26px!important;line-height:1.2!important;font-weight:800!important;letter-spacing:-.02em;color:#1f2430;text-wrap:balance}
      .naraHelloText p{margin:0;font-size:14px;line-height:1.55;color:#4b5565}
      .naraEngines{position:relative;flex:0 0 auto;align-self:flex-start}
      .naraEngines summary{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 14px;border-radius:999px;background:#fff;border:1px solid #dfe7f0;font-size:13px;font-weight:700;color:#1f2430;cursor:pointer;list-style:none}
      .naraEngines summary::-webkit-details-marker{display:none}
      .naraEngines summary::after{content:'';width:7px;height:7px;margin-left:2px;border-right:1.8px solid #64748b;border-bottom:1.8px solid #64748b;transform:rotate(45deg) translateY(-2px);transition:transform .2s ease}
      .naraEngines[open] summary::after{transform:rotate(-135deg) translateY(-1px)}
      .naraEnginesMenu{position:absolute;right:0;top:calc(100% + 8px);z-index:20;width:250px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #dfe7f0;box-shadow:0 18px 40px rgba(31,36,48,.14)}
      .naraEnginesMenu ul{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}
      .naraEnginesMenu li{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
      .naraEnginesMenu p{margin:0;font-size:12px;line-height:1.5;color:#5b6878}
      .naraLiveDot{width:8px;height:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15);flex:0 0 auto}
      .naraFeed{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:12px}
      .naraInsight{display:flex;flex-direction:column;gap:10px;padding:18px;border-radius:20px;background:#fff;border:1px solid #dfe7f0;box-shadow:0 6px 18px rgba(15,35,60,.05)}
      .naraInsight.red{border-top:3px solid #e5484d}.naraInsight.amber{border-top:3px solid #f59e0b}.naraInsight.green{border-top:3px solid #22a35a}
      .naraInsightTop{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .naraTag{display:inline-flex;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800}
      .naraTag.red{background:#fdecea;color:#b42318}.naraTag.amber{background:#fff3dc;color:#b45309}.naraTag.green{background:#e5f6ec;color:#15803d}
      .naraArea{font-size:12px;font-weight:600;color:#6b7684}
      .naraInsight strong{font-size:36px;line-height:1;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#1f2430}
      .naraInsight.red strong{color:#b42318}
      .naraInsight p{margin:0;min-height:40px;font-size:13px;line-height:1.5;color:#4b5565}
      .naraSkel{display:inline-block;width:72px;height:32px;border-radius:10px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400% 100%;animation:naraShim 1.3s ease infinite}
      @keyframes naraShim{0%{background-position:100% 50%}100%{background-position:0 50%}}
      .naraAsk{margin-top:auto;align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border:0;border-radius:11px;background:rgba(94,196,207,.16);color:#0e5566;font:inherit;font-size:13px;font-weight:800;cursor:pointer;transition:background-color .15s ease}
      .naraAsk:hover:not(:disabled){background:rgba(94,196,207,.28)}.naraAsk:disabled{opacity:.5;cursor:default}
      .naraAsk span{transition:translate .18s ease}.naraAsk:hover:not(:disabled) span{translate:3px 0}
      .naraLower{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}
      .naraChat{scroll-margin-top:90px;min-width:0;border-radius:20px;overflow:hidden;border:1px solid #dfe7f0;background:#fff;box-shadow:0 6px 20px rgba(15,35,60,.05)}
      .naraChat :global(.tanyaChips){flex-direction:row;flex-wrap:wrap}
      .naraChat :global(.tanyaChips button){width:auto;border-radius:999px;padding:8px 14px;font-size:13px}
      .naraChat :global(.tanyaClose){display:none}
      .naraSide{display:flex;flex-direction:column;gap:10px}
      .naraQuick{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:20px;background:rgba(255,255,255,.7);border:1px solid #dfe7f0}
      .naraQuick h2{margin:2px 4px 6px!important;font-size:14px!important;line-height:1.3!important;font-weight:800!important;color:#1f2430}
      .naraQuickBtn{display:flex;align-items:flex-start;gap:10px;padding:10px;text-align:left;border-radius:14px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:background-color .15s ease,border-color .15s ease}
      .naraQuickBtn:hover{background:#fff;border-color:#dfe7f0}
      .naraQuickBtn:focus-visible,.naraAsk:focus-visible{outline:2px solid rgba(34,211,238,.7);outline-offset:2px}
      .naraQuickBtn.selected{background:#fff;border-color:rgba(14,116,144,.45)}
      .naraQuickIco{width:32px;height:32px;flex:0 0 32px;display:grid;place-items:center;border-radius:10px;background:rgba(94,196,207,.16);color:#0e5566}
      .naraQuickIco svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .naraQuickBtn.selected .naraQuickIco{background:#0e7490;color:#fff}
      .naraQuickText{display:grid;gap:1px;min-width:0}.naraQuickText b{font-size:13px;font-weight:700;color:#1f2430}.naraQuickText small{font-size:12px;line-height:1.4;color:#6b7684}
      .naraNote{margin:0;padding:0 6px;font-size:12px;line-height:1.5;color:#64748b}
      @media(max-width:1100px){.naraLower{grid-template-columns:1fr}.naraQuick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.naraQuick h2{grid-column:1/-1}}
      @media(max-width:760px){.naraFeed{grid-template-columns:1fr}.naraHello{padding:18px}.naraHelloText h1{font-size:21px!important}.naraQuick{grid-template-columns:1fr}.naraEnginesMenu{left:0;right:auto}.naraInsight p{min-height:0}}
      @media(prefers-reduced-motion:reduce){.naraSkel{animation:none}.naraAsk span,.naraEngines summary::after{transition:none}}
      :global(html[data-mode="gelap"]) .naraWorkspace{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraHello{background:linear-gradient(150deg,rgba(94,196,207,.12),rgba(16,22,32,.6) 60%);border-color:rgba(94,196,207,.2);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraHelloText h1,:global(html[data-mode="gelap"]) .naraInsight strong,:global(html[data-mode="gelap"]) .naraQuick h2,:global(html[data-mode="gelap"]) .naraQuickText b{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraHelloText p,:global(html[data-mode="gelap"]) .naraInsight p,:global(html[data-mode="gelap"]) .naraQuickText small,:global(html[data-mode="gelap"]) .naraNote,:global(html[data-mode="gelap"]) .naraArea,:global(html[data-mode="gelap"]) .naraEnginesMenu p{color:#aab6c6}
      :global(html[data-mode="gelap"]) .naraEyebrow{color:#8ee3ea}
      :global(html[data-mode="gelap"]) .naraEngines summary{background:rgba(20,27,38,.8);border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraEnginesMenu{background:#141b26;border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraInsight{background:rgba(20,27,38,.85);border-left-color:rgba(255,255,255,.1);border-right-color:rgba(255,255,255,.1);border-bottom-color:rgba(255,255,255,.1);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraInsight.red strong{color:#fda4af}
      :global(html[data-mode="gelap"]) .naraTag.red{background:rgba(244,63,94,.15);color:#fda4af}
      :global(html[data-mode="gelap"]) .naraTag.amber{background:rgba(251,191,36,.14);color:#fcd34d}
      :global(html[data-mode="gelap"]) .naraTag.green{background:rgba(34,197,94,.14);color:#86efac}
      :global(html[data-mode="gelap"]) .naraAsk{background:rgba(94,196,207,.18);color:#bdf0f5}
      :global(html[data-mode="gelap"]) .naraChat{background:rgba(20,27,38,.85);border-color:rgba(255,255,255,.1)}
      :global(html[data-mode="gelap"]) .naraQuick{background:rgba(20,27,38,.7);border-color:rgba(255,255,255,.1)}
      :global(html[data-mode="gelap"]) .naraQuickBtn:hover,:global(html[data-mode="gelap"]) .naraQuickBtn.selected{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}
      :global(html[data-mode="gelap"]) .naraQuickIco{background:rgba(94,196,207,.18);color:#bdf0f5}
      :global(html[data-mode="gelap"]) .naraSkel{background:linear-gradient(90deg,rgba(255,255,255,.05) 25%,rgba(255,255,255,.1) 37%,rgba(255,255,255,.05) 63%);background-size:400% 100%}
    `}</style>
  </div>
}
