'use client'
import { useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
type PatientIndexSummary = { total: number; dengan_nik: number; terhubung_simrs: number }
type Props = { onOpenDirectory: () => void; onOpenPatterns: () => void; onAskNara?: (prompt: string, pageContext: string) => void }
const number = (value: unknown) => Number(value ?? 0).toLocaleString('id-ID')
const percent = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : 0
export default function PatientRegistryIntelligence({ onOpenDirectory, onOpenPatterns, onAskNara }: Props) {
  const [summary, setSummary] = useState<PatientIndexSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true); setError('')
      const result = await aurekaSupabase.rpc('aureka_patient_index_overview')
      if (cancelled) return
      if (result.error) { setSummary(null); setError('Ringkasan direktori pasien belum tersedia. Pastikan migrasi indeks pasien dan hak akses database telah diterapkan.') }
      else setSummary(result.data as PatientIndexSummary)
      setLoading(false)
    })().catch(() => { if (!cancelled) { setSummary(null); setError('Ringkasan pasien tidak dapat dimuat. Periksa koneksi dan hak akses.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])
  const total = summary ? Number(summary.total ?? 0) : 0
  const withNik = summary ? Number(summary.dengan_nik ?? 0) : 0
  const simrs = summary ? Number(summary.terhubung_simrs ?? 0) : 0
  const cards = [
    { label: 'Pasien unik terindeks', value: summary ? number(total) : '—', caption: 'Satu identitas pasien per nomor rekam medis' },
    { label: 'Memiliki NIK', value: summary ? number(withNik) : '—', caption: summary ? percent(withNik,total)+'% dari pasien terindeks' : 'Menunggu ringkasan database' },
    { label: 'Terhubung SIMRS', value: summary ? number(simrs) : '—', caption: summary ? percent(simrs,total)+'% dari pasien terindeks' : 'Menunggu status integrasi' },
  ]
  return <section className="patientRegistryIntelligence" aria-labelledby="patient-registry-intelligence-title" aria-busy={loading}>
    <header className="priHero"><div><span className="priEyebrow">PATIENT INTELLIGENCE</span><h2 id="patient-registry-intelligence-title">Visual Intelligence Direktori Pasien</h2><p>Ikhtisar indeks pasien yang terbentuk dari data pelayanan dan logbook lintas unit. Identitas pasien tidak ditampilkan pada ringkasan ini.</p></div><span className="priStatus">{loading?'Memuat data':summary?'Data agregat tersedia':'Data belum tersedia'}</span></header>
    {error && <div className="priNotice" role="status">{error}</div>}
    <div className="priMetrics">{cards.map(card=><article className="priMetric" key={card.label}><span>{card.label}</span><strong>{loading?'…':card.value}</strong><small>{card.caption}</small></article>)}</div>
    <div className="priActions"><button type="button" className="priPrimary" onClick={onOpenDirectory}>Lihat Direktori Pasien</button><button type="button" className="priSecondary" onClick={onOpenPatterns}>Lihat Pola Perawatan</button><button type="button" className="priNara" onClick={()=>onAskNara?.('Analisis ikhtisar direktori pasien AUREKA berdasarkan data agregat yang tersedia dan diizinkan. Jelaskan cakupan, kelengkapan indeks, keterhubungan SIMRS, keterbatasan data, dan prioritas perbaikan. Jangan meminta atau menampilkan identitas pasien dan jangan mengubah data.','Register Pasien · Visual Intelligence Direktori Pasien')}>Analisis dengan NARA AI</button></div>
    <div className="priFootnote">Data ditampilkan sesuai cakupan hak akses pengguna. Angka yang tidak tersedia ditampilkan sebagai tanda pisah dan tidak ditafsirkan sebagai nol.</div>
    <style jsx>{`
      .patientRegistryIntelligence{display:grid;gap:18px;min-width:0;color:var(--ink,#18324a)}
      .priHero{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px;border:1px solid rgba(255,255,255,.8);border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(231,241,249,.66));box-shadow:0 10px 30px rgba(36,65,90,.06)}
      .priEyebrow{font-size:10px;letter-spacing:.14em;font-weight:800;color:#38799f}.priHero h2{margin:8px 0 7px;font-size:clamp(20px,2vw,27px);line-height:1.2;font-weight:800;color:#193c59}.priHero p{max-width:68ch;margin:0;color:#657b8d;font-size:13px;line-height:1.65}
      .priStatus{flex:none;border:1px solid rgba(85,137,171,.22);border-radius:999px;padding:7px 11px;background:rgba(255,255,255,.66);font-size:11px;font-weight:700;color:#446c86}
      .priMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.priMetric{display:grid;gap:9px;min-width:0;padding:18px;border:1px solid rgba(255,255,255,.88);border-radius:18px;background:rgba(255,255,255,.68);box-shadow:0 8px 24px rgba(36,65,90,.045)}
      .priMetric span{font-size:12px;font-weight:700;color:#63798a}.priMetric strong{font-size:clamp(24px,3vw,34px);font-weight:800;letter-spacing:-.04em;color:#1d5274;font-variant-numeric:tabular-nums}.priMetric small{font-size:11px;line-height:1.5;color:#8796a2}
      .priActions{display:flex;flex-wrap:wrap;gap:9px}.priActions button{min-height:42px;padding:0 15px;border-radius:12px;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
      .priPrimary{border:1px solid #245f86;background:#245f86;color:#fff;box-shadow:0 5px 14px rgba(36,95,134,.16)}.priSecondary{border:1px solid #c8d9e5;background:rgba(255,255,255,.76);color:#285674}.priNara{border:1px solid rgba(67,151,177,.38);background:rgba(222,244,247,.72);color:#246678}
      .priNotice{padding:12px 14px;border:1px solid #e5d4b1;border-radius:12px;background:rgba(255,248,232,.82);color:#7a5d2b;font-size:12px;line-height:1.5}.priFootnote{font-size:11px;line-height:1.5;color:#82919d}
      @media(max-width:760px){.priHero{display:grid}.priMetrics{grid-template-columns:1fr}.priMetric{grid-template-columns:1fr auto}.priMetric small{grid-column:1/-1}.priActions{display:grid}.priActions button{width:100%}}
      :global(html[data-mode="gelap"]) .priHero,:global(html[data-mode="gelap"]) .priMetric{background:rgba(20,27,38,.78);border-color:rgba(255,255,255,.1);box-shadow:none}
      :global(html[data-mode="gelap"]) .priHero h2,:global(html[data-mode="gelap"]) .priMetric strong{color:#d9eefb}
      :global(html[data-mode="gelap"]) .priHero p,:global(html[data-mode="gelap"]) .priMetric span,:global(html[data-mode="gelap"]) .priMetric small,:global(html[data-mode="gelap"]) .priFootnote{color:#a7b8c7}
      :global(html[data-mode="gelap"]) .priSecondary{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#cfe7f4}
    `}</style>
  </section>
}
