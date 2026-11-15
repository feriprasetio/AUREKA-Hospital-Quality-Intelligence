'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
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

export default function NaraAIWorkspace({ sb, page }: { sb: SupabaseClient; page?: string }) {
  const [prompt, setPrompt] = useState<string | undefined>()
  const [activeMode, setActiveMode] = useState<string | null>(null)
  const selectMode = (mode: typeof MODES[number]) => {
    setActiveMode(mode.id)
    setPrompt(mode.prompt)
    window.setTimeout(() => document.querySelector('.naraChat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  return <div className="naraWorkspace" aria-label="NARA AI">
    <header className="naraHero">
      <div className="naraHeroIdentity">
        <NaraAvatar size={60}/>
        <div>
          <span className="naraEyebrow">Kecerdasan AUREKA</span>
          <h1>NARA AI</h1>
          <p>Asisten analisis mutu, keselamatan pasien, dan manajemen risiko. Mengubah data jadi temuan dan rekomendasi yang bisa langsung ditindaklanjuti.</p>
        </div>
      </div>
      <details className="naraEngines">
        <summary><span className="naraLiveDot" aria-hidden="true"/> {ENGINES.length} mesin AI aktif</summary>
        <div className="naraEnginesMenu">
          <ul>{ENGINES.map((name) => <li key={name}><span className="naraLiveDot" aria-hidden="true"/>{name}</li>)}</ul>
          <p>Dipilih otomatis lewat gateway AUREKA. Kunci API tersimpan aman di server.</p>
        </div>
      </details>
    </header>

    <div className="naraGrid">
      <div className="naraMain">
        <section aria-labelledby="nara-modes-title">
          <h2 id="nara-modes-title" className="naraSectionTitle">Mau analisis apa hari ini?</h2>
          <div className="naraModeGrid">{MODES.map((mode) => <button type="button" key={mode.id} className={'naraModeCard' + (activeMode === mode.id ? ' selected' : '')} aria-pressed={activeMode === mode.id} onClick={() => selectMode(mode)}>
            <span className="naraModeGlyph" aria-hidden="true"><svg viewBox="0 0 24 24">{GLYPH[mode.id]}</svg></span>
            <span className="naraModeText"><b>{mode.label}</b><small>{mode.detail}</small></span>
          </button>)}</div>
        </section>
        <section className="naraChat" aria-label="Ruang analisis NARA">
          <TanyaAureka sb={sb} page={page || 'NARA AI'} embedded assistantName="NARA AI" assistantSubtitle="Membaca data sesuai hak akses Anda" showAvatar initialPrompt={prompt}/>
        </section>
      </div>

      <aside className="naraSide" aria-label="Tentang NARA">
        <section className="naraSideCard">
          <h3>Yang bisa NARA bantu</h3>
          <ul className="naraList">
            <li>Membaca capaian dan tren indikator mutu</li>
            <li>Menemukan pola insiden keselamatan pasien</li>
            <li>Memprioritaskan risiko dan tindak pengendalian</li>
            <li>Menyusun ringkasan dan rekomendasi untuk manajemen</li>
            <li>Membantu metode statistik dan riset</li>
          </ul>
        </section>
        <section className="naraSideCard naraPrivacy">
          <h3>Privasi data</h3>
          <p>NARA hanya membaca ringkasan agregat sesuai hak akses Anda. Identitas pasien tidak dikirim ke AI.</p>
          <ul className="naraChecks">
            <li>Kunci API di server</li>
            <li>Akses sesuai peran dan unit</li>
            <li>Tanpa identitas pasien</li>
          </ul>
        </section>
        <p className="naraNote">Jawaban AI bisa keliru. Cek kembali angka penting di modul terkait sebelum dipakai untuk keputusan.</p>
      </aside>
    </div>

    <style jsx>{`
      .naraWorkspace{display:flex;flex-direction:column;gap:18px;min-width:0;color:#1f2430}
      .naraHero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;padding:24px 26px;border-radius:24px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(31,36,48,.06)}
      .naraHeroIdentity{display:flex;align-items:center;gap:16px;min-width:0;flex:1 1 420px}
      .naraHeroAvatar{display:grid;place-items:center;flex:0 0 auto;filter:drop-shadow(0 8px 16px rgba(20,76,112,.18))}
      .naraEyebrow{display:block;font-size:13px;font-weight:700;color:#0e7490}
      .naraHeroIdentity h1{margin:2px 0 4px;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.02em;color:#1f2430}
      .naraHeroIdentity p{margin:0;max-width:620px;font-size:14px;line-height:1.6;color:#4b5565}
      .naraEngines{position:relative;flex:0 0 auto}
      .naraEngines summary{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 14px;border-radius:999px;background:#fff;border:1px solid #dfe7f0;font-size:13px;font-weight:700;color:#1f2430;cursor:pointer;list-style:none}
      .naraEngines summary::-webkit-details-marker{display:none}
      .naraEngines summary::after{content:'';width:7px;height:7px;margin-left:2px;border-right:1.8px solid #64748b;border-bottom:1.8px solid #64748b;transform:rotate(45deg) translateY(-2px);transition:transform .2s ease}
      .naraEngines[open] summary::after{transform:rotate(-135deg) translateY(-1px)}
      .naraEnginesMenu{position:absolute;right:0;top:calc(100% + 8px);z-index:20;width:250px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #dfe7f0;box-shadow:0 18px 40px rgba(31,36,48,.14)}
      .naraEnginesMenu ul{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}
      .naraEnginesMenu li{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
      .naraEnginesMenu p{margin:0;font-size:12px;line-height:1.5;color:#5b6878}
      .naraLiveDot{width:8px;height:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15);flex:0 0 auto}
      .naraGrid{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}
      .naraMain{display:flex;flex-direction:column;gap:16px;min-width:0}
      .naraSectionTitle{margin:0 0 10px;font-size:18px;font-weight:800;letter-spacing:-.01em;color:#1f2430}
      .naraModeGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .naraModeCard{display:flex;align-items:flex-start;gap:12px;min-height:76px;padding:14px;text-align:left;border-radius:16px;border:1px solid #dfe7f0;background:#fff;color:inherit;font:inherit;cursor:pointer;transition:border-color .18s ease,box-shadow .18s ease,translate .18s cubic-bezier(.22,1,.36,1)}
      .naraModeCard:hover{border-color:rgba(14,116,144,.45);box-shadow:0 8px 22px rgba(15,35,60,.08);translate:0 -1px}
      .naraModeCard:focus-visible{outline:2px solid rgba(34,211,238,.7);outline-offset:2px}
      .naraModeCard.selected{border-color:#0e7490;background:linear-gradient(180deg,rgba(94,196,207,.12),#fff);box-shadow:0 0 0 3px rgba(94,196,207,.18)}
      .naraModeGlyph{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border-radius:12px;background:rgba(94,196,207,.16);color:#0e5566}
      .naraModeGlyph svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .naraModeCard.selected .naraModeGlyph{background:#0e7490;color:#fff}
      .naraModeText{display:grid;gap:3px;min-width:0}.naraModeText b{font-size:14px;font-weight:700;color:#1f2430}.naraModeText small{font-size:12px;line-height:1.45;color:#5b6878}
      .naraChat{scroll-margin-top:90px;border-radius:20px;overflow:hidden;border:1px solid #dfe7f0;background:#fff;box-shadow:0 6px 20px rgba(15,35,60,.05)}
      .naraChat :global(.tanyaChips){flex-direction:row;flex-wrap:wrap}
      .naraChat :global(.tanyaChips button){width:auto;border-radius:999px;padding:8px 14px;font-size:13px}
      .naraChat :global(.tanyaClose){display:none}
      .naraSide{display:flex;flex-direction:column;gap:12px}
      .naraSideCard{padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.7);border:1px solid #dfe7f0}
      .naraSideCard h3{margin:0 0 10px;font-size:15px;font-weight:800;color:#1f2430}
      .naraList{margin:0;padding:0;list-style:none;display:grid;gap:8px}
      .naraList li{position:relative;padding-left:16px;font-size:13px;line-height:1.5;color:#334155}
      .naraList li::before{content:'';position:absolute;left:0;top:.6em;width:6px;height:6px;border-radius:50%;background:#5ec4cf}
      .naraPrivacy p{margin:0 0 10px;font-size:13px;line-height:1.55;color:#4b5565}
      .naraChecks{margin:0;padding:0;list-style:none;display:grid;gap:6px}
      .naraChecks li{display:flex;align-items:center;gap:8px;font-size:13px;color:#1f2430;font-weight:600}
      .naraChecks li::before{content:'';width:16px;height:16px;flex:0 0 16px;border-radius:50%;background:#16a34a url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 12.5 4 4 8-9'/%3E%3C/svg%3E") center/11px no-repeat}
      .naraNote{margin:0;padding:0 4px;font-size:12px;line-height:1.5;color:#64748b}
      @media(max-width:1180px){.naraModeGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:1000px){.naraGrid{grid-template-columns:1fr}.naraSide{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.naraNote{grid-column:1/-1}}
      @media(max-width:640px){.naraHero{padding:18px}.naraHeroIdentity{align-items:flex-start}.naraHeroIdentity h1{font-size:24px}.naraModeGrid,.naraSide{grid-template-columns:1fr}.naraEnginesMenu{left:0;right:auto}}
      @media(prefers-reduced-motion:reduce){.naraModeCard,.naraEngines summary::after{transition:none}}
      :global(html[data-mode="gelap"]) .naraWorkspace{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraHero{background:linear-gradient(150deg,rgba(94,196,207,.12),rgba(16,22,32,.6) 60%);border-color:rgba(94,196,207,.2);box-shadow:none}
      :global(html[data-mode="gelap"]) .naraHeroIdentity h1,:global(html[data-mode="gelap"]) .naraSectionTitle,:global(html[data-mode="gelap"]) .naraModeText b,:global(html[data-mode="gelap"]) .naraSideCard h3,:global(html[data-mode="gelap"]) .naraChecks li{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraHeroIdentity p,:global(html[data-mode="gelap"]) .naraModeText small,:global(html[data-mode="gelap"]) .naraPrivacy p,:global(html[data-mode="gelap"]) .naraList li,:global(html[data-mode="gelap"]) .naraEnginesMenu p,:global(html[data-mode="gelap"]) .naraNote{color:#aab6c6}
      :global(html[data-mode="gelap"]) .naraEyebrow{color:#8ee3ea}
      :global(html[data-mode="gelap"]) .naraEngines summary{background:rgba(20,27,38,.8);border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraEnginesMenu{background:#141b26;border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraModeCard{background:rgba(20,27,38,.8);border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraChat{background:rgba(20,27,38,.8);border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraSideCard{background:rgba(20,27,38,.8);border-color:rgba(255,255,255,.1);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraModeCard.selected{border-color:#5ec4cf;background:rgba(94,196,207,.12)}
      :global(html[data-mode="gelap"]) .naraModeGlyph{background:rgba(94,196,207,.18);color:#bdf0f5}
    `}</style>
  </div>
}
