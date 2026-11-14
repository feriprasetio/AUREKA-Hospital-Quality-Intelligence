'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import TanyaAureka from '@/components/TanyaAureka'

export default function NaraAIWorkspace({ sb, page }: { sb: SupabaseClient; page?: string }) {
  return <main className="naraWorkspace" aria-label="NARA AI">
    <header className="naraHeader">
      <div className="naraMark" aria-hidden="true">N</div>
      <div><small>AUREKA INTELLIGENCE</small><h1>NARA AI</h1><p>Hospital Intelligence Assistant · Multi-Provider AI</p></div>
      <span className="naraEnginePill"><i /> 5 AI engines</span>
    </header>
    <section className="naraCapabilities" aria-label="Kapabilitas NARA">
      <article><b>Clinical Quality</b><span>Indikator mutu dan capaian</span></article>
      <article><b>Patient Safety</b><span>IKP dan budaya keselamatan</span></article>
      <article><b>Risk Intelligence</b><span>Risiko, FMEA, dan RTP</span></article>
      <article><b>Evidence Support</b><span>Analisis dan rekomendasi berbasis bukti</span></article>
    </section>
    <section className="naraChat"><TanyaAureka sb={sb} page={page || 'NARA AI'} embedded /></section>
    <style jsx>{`
      .naraWorkspace{display:flex;flex-direction:column;gap:16px;min-width:0}
      .naraHeader{display:flex;align-items:center;gap:14px;padding:20px;border:1px solid var(--border-color,rgba(128,128,128,.2));border-radius:16px;background:var(--surface-card,#fff)}
      .naraMark{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#172f55,#2876a8);color:#fff;font-size:25px;font-weight:800}
      .naraHeader small{font-size:10px;letter-spacing:.15em;font-weight:800;color:#5286a8}.naraHeader h1{margin:2px 0;font-size:23px}.naraHeader p{margin:0;font-size:12px;color:var(--text-secondary,#667085)}
      .naraEnginePill{margin-left:auto;white-space:nowrap;border:1px solid var(--border-color,rgba(128,128,128,.2));border-radius:99px;padding:7px 10px;font-size:11px;font-weight:700}.naraEnginePill i{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:#16a36a}
      .naraCapabilities{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.naraCapabilities article{display:flex;flex-direction:column;gap:5px;padding:13px;border:1px solid var(--border-color,rgba(128,128,128,.18));border-radius:12px;background:var(--surface-card,#fff)}.naraCapabilities b{font-size:12px}.naraCapabilities span{font-size:11px;line-height:1.4;color:var(--text-secondary,#667085)}
      .naraChat{min-width:0}@media(max-width:760px){.naraCapabilities{grid-template-columns:repeat(2,minmax(0,1fr))}.naraHeader{padding:14px}.naraEnginePill{font-size:10px;padding:6px 8px}}
    `}</style>
  </main>
}