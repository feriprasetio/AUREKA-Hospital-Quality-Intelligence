'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import TanyaAureka from '@/components/TanyaAureka'

const MODES = [
  { id:'executive', label:'Executive Brief', detail:'Ringkasan prioritas manajemen', prompt:'Susun executive brief kondisi mutu, keselamatan pasien, dan manajemen risiko rumah sakit saat ini. Tampilkan temuan utama, prioritas, dan keputusan yang perlu diambil manajemen.' },
  { id:'quality', label:'Quality Intelligence', detail:'Analisis indikator dan tren mutu', prompt:'Analisis capaian indikator mutu rumah sakit. Identifikasi indikator yang belum mencapai target, pola penting, kemungkinan penyebab, dan rekomendasi perbaikannya.' },
  { id:'safety', label:'Patient Safety', detail:'Analisis insiden dan pembelajaran', prompt:'Buat analisis keselamatan pasien berdasarkan data agregat yang tersedia. Identifikasi pola, prioritas pembelajaran, dan rekomendasi penguatan sistem.' },
  { id:'risk', label:'Risk Intelligence', detail:'Prioritas risiko, FMEA, dan RTP', prompt:'Analisis profil manajemen risiko rumah sakit. Prioritaskan risiko tinggi dan sangat tinggi, evaluasi tindak pengendalian, dan berikan rekomendasi.' },
  { id:'strategy', label:'Strategic Advisor', detail:'Rekomendasi strategis berbasis data', prompt:'Bertindak sebagai strategic advisor rumah sakit. Rumuskan 5 prioritas strategis berbasis data mutu, keselamatan pasien, dan manajemen risiko, lengkap dengan indikator keberhasilan.' },
  { id:'research', label:'Research & Evidence', detail:'Dukungan analisis ilmiah dan statistik', prompt:'Bantu saya melakukan analisis ilmiah dan statistik untuk peningkatan mutu rumah sakit. Jelaskan metode, asumsi, keterbatasan data, dan interpretasi secara akademik.' },
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
  const selectMode = (mode: typeof MODES[number]) => { setActiveMode(mode.id); setPrompt(mode.prompt) }
  return <main className="naraWorkspace" aria-label="NARA AI">
    <header className="naraHero"><div className="naraHeroIdentity"><NaraAvatar size={64}/><div><small>AUREKA INTELLIGENCE</small><h1>NARA AI</h1><p>Hospital Intelligence & Decision Support</p></div></div>
      <div className="naraHeroStatus"><span className="naraLiveDot"/> Multi-provider orchestration <b>5 engines</b></div>
      <p className="naraHeroDescription">Asisten intelijen rumah sakit untuk mengubah data mutu, keselamatan pasien, dan manajemen risiko menjadi insight dan rekomendasi yang dapat ditindaklanjuti.</p>
    </header>
    <section className="naraEngineRail" aria-label="Mesin AI terintegrasi"><div className="naraRailTitle"><strong>AI ENGINE LAYER</strong><span>Gateway terpusat · kredensial aman di server</span></div>
      <div className="naraEngineList">{['Groq','NVIDIA','Gemini','DeepSeek','LLM7'].map((name,i)=><div className="naraEngine" key={name}><span className="naraEngineIndex">0{i+1}</span><b>{name}</b><span className="naraEngineState">Terintegrasi</span></div>)}</div>
    </section>
    <section className="naraWorkspaceGrid"><div className="naraMainColumn"><div className="naraSectionHeading"><div><small>INTELLIGENCE WORKSPACE</small><h2>Apa yang ingin dianalisis?</h2></div><span>AI-assisted decision support</span></div>
      <div className="naraModeGrid">{MODES.map(mode=><button type="button" key={mode.id} className={'naraModeCard '+(activeMode===mode.id?'selected':'')} onClick={()=>selectMode(mode)}><span className="naraModeGlyph" aria-hidden="true">{mode.id==='executive'?'▤':mode.id==='quality'?'◫':mode.id==='safety'?'✚':mode.id==='risk'?'⌁':mode.id==='strategy'?'◎':'∑'}</span><span><b>{mode.label}</b><small>{mode.detail}</small></span><span className="naraModeArrow">↗</span></button>)}</div>
      <section className="naraChatSurface"><div className="naraChatIntro"><NaraAvatar size={38}/><div><b>Ruang Analisis NARA</b><span>Pilih fokus analisis di atas atau ajukan pertanyaan secara langsung.</span></div><span className="naraSecureLabel">PRIVATE · RLS</span></div>
        <TanyaAureka sb={sb} page={page || 'NARA AI'} embedded assistantName="NARA AI" assistantSubtitle="Hospital Intelligence Assistant · Data sesuai hak akses" showAvatar initialPrompt={prompt}/>
      </section></div>
      <aside className="naraSideColumn"><section className="naraSideCard"><small>CORE INTELLIGENCE</small><h3>Kapabilitas NARA</h3><ul><li>Analisis indikator mutu dan tren capaian</li><li>Identifikasi pola keselamatan pasien</li><li>Prioritisasi risiko dan tindak pengendalian</li><li>Executive brief dan rekomendasi strategis</li><li>Dukungan metodologi statistik dan riset</li></ul></section>
        <section className="naraSideCard naraPrivacyCard"><small>DATA GOVERNANCE</small><h3>Privasi & Keamanan</h3><p>Permintaan diproses melalui gateway Supabase terautentikasi. Akses data mengikuti RLS, dan konteks AI menggunakan ringkasan agregat tanpa identitas pasien.</p><span><i/> Server-side API keys</span><span><i/> Role-based data access</span><span><i/> No patient identifiers</span></section></aside>
    </section>
    <style jsx>{`
      .naraWorkspace{display:flex;flex-direction:column;gap:17px;min-width:0;color:var(--text-primary,#243447)}
      .naraHero{padding:22px 24px;border:1px solid var(--border-color,rgba(128,128,128,.2));border-radius:18px;background:linear-gradient(115deg,#f9fcff 0%,#edf7fb 58%,#eaf8f5 100%)}
      .naraHeroIdentity{display:flex;align-items:center;gap:16px}.naraHeroAvatar{display:grid;place-items:center;flex:0 0 auto;filter:drop-shadow(0 7px 14px rgba(20,76,112,.16))}
      .naraHeroIdentity small,.naraSectionHeading small,.naraSideCard>small{font-size:10px;letter-spacing:.14em;font-weight:850;color:#4e809c}.naraHeroIdentity h1{margin:2px 0;font-size:25px;line-height:1.2;font-weight:850;color:#1b344a}.naraHeroIdentity p{margin:3px 0 0;font-size:12px;color:#64748b}
      .naraHeroStatus{float:right;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #d8e7ed;border-radius:99px;background:#fff;font-size:11px;color:#536779}.naraHeroStatus b{padding-left:8px;border-left:1px solid #dce6eb;color:#1d526d}.naraLiveDot{width:7px;height:7px;border-radius:50%;background:#12a879}
      .naraHeroDescription{max-width:850px;margin:16px 0 0 80px;font-size:13px;line-height:1.65;color:#526779}.naraEngineRail,.naraSideCard,.naraChatSurface{border:1px solid var(--border-color,rgba(128,128,128,.2));border-radius:15px;background:var(--surface-card,#fff)}
      .naraEngineRail{padding:14px 16px}.naraRailTitle{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.naraRailTitle strong{font-size:10px;letter-spacing:.14em;color:#4e809c}.naraRailTitle span{font-size:10px;color:#778797}
      .naraEngineList{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.naraEngine{display:flex;align-items:center;gap:7px;min-width:0;padding:9px;border-radius:10px;background:#f4f7fa}.naraEngineIndex{font-size:9px;color:#8a9bab}.naraEngine b{font-size:11px;color:#263e52}.naraEngineState{margin-left:auto;font-size:9px;color:#25856e}
      .naraWorkspaceGrid{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:14px;align-items:start}.naraMainColumn{display:flex;flex-direction:column;gap:12px;min-width:0}.naraSectionHeading{display:flex;align-items:end;justify-content:space-between;gap:10px}.naraSectionHeading h2{margin:3px 0 0;font-size:19px;color:var(--text-primary,#26394a)}.naraSectionHeading>span{font-size:10px;color:#778797}
      .naraModeGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.naraModeCard{display:flex;align-items:center;gap:11px;text-align:left;padding:12px;border:1px solid var(--border-color,rgba(128,128,128,.2));border-radius:12px;background:var(--surface-card,#fff);color:inherit;cursor:pointer;transition:border-color .15s,transform .15s}.naraModeCard:hover,.naraModeCard.selected{border-color:#4a9caa;transform:translateY(-1px);background:#f4fbfb}.naraModeGlyph{width:32px;height:32px;display:grid;place-items:center;flex:0 0 32px;border-radius:10px;background:#e8f4f7;color:#276c86;font-size:18px}.naraModeCard b,.naraModeCard small{display:block}.naraModeCard b{font-size:12px}.naraModeCard small{margin-top:3px;font-size:10px;color:#738393}.naraModeArrow{margin-left:auto;color:#7792a3}
      .naraChatSurface{overflow:hidden}.naraChatIntro{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--border-color,rgba(128,128,128,.15))}.naraChatIntro>div{display:flex;flex-direction:column;gap:3px}.naraChatIntro b{font-size:12px}.naraChatIntro span{font-size:10px;color:#778797}.naraSecureLabel{margin-left:auto;padding:5px 8px;border-radius:7px;background:#eef7f3;color:#26866a!important;font-size:9px!important;font-weight:800}
      .naraSideColumn{display:flex;flex-direction:column;gap:12px}.naraSideCard{padding:15px}.naraSideCard h3{margin:5px 0 10px;font-size:14px}.naraSideCard ul{margin:0;padding-left:17px}.naraSideCard li{margin:7px 0;font-size:11px;line-height:1.5;color:#5d6f80}.naraPrivacyCard p{font-size:11px;line-height:1.6;color:#607182}.naraPrivacyCard>span{display:block;margin-top:9px;font-size:10px;color:#516777}.naraPrivacyCard i{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#19a47a}
      @media(max-width:950px){.naraWorkspaceGrid{grid-template-columns:1fr}.naraSideColumn{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:650px){.naraHero{padding:16px}.naraHeroStatus{float:none;width:max-content;margin:13px 0 0 78px}.naraHeroDescription{margin:12px 0 0;font-size:12px}.naraEngineList{grid-template-columns:repeat(2,minmax(0,1fr))}.naraEngineList .naraEngine:last-child{grid-column:span 2}.naraRailTitle{align-items:flex-start;flex-direction:column}.naraModeGrid{grid-template-columns:1fr}.naraSideColumn{grid-template-columns:1fr}.naraSectionHeading>span{display:none}}
    `}</style>
  </main>
}