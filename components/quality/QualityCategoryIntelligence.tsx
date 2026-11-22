'use client'

import { useMemo, useState } from 'react'
import { QUALITY_CATEGORY_CATALOG, buildCategoryNaraBrief, buildQualityCategoryAnalytics,
  indicatorProfileKey, type QualityCategoryAnalytics, type QualityProgram } from '@/lib/aureka/quality-category-engine'
import type { IndicatorResult, ResultRecord } from '@/lib/aureka/quality-results-engine'

type Props = {
  results: IndicatorResult[]
  records: ResultRecord[]
  year: number
  scopeLabel: string
  selectedCategoryId: string
  onSelectCategory: (id: string) => void
  includeReady: boolean
  onAskNara?: (prompt: string, source: string) => void
  roomName: (id: number) => string
}
const fmt = (number: number): string => number.toLocaleString('id-ID')
const pct = (value: number | null): string => value == null ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%'
const resultValue = (result: IndicatorResult): string =>
  result.continuous ? (result.annualMean == null ? '—' :
    result.annualMean.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + (result.unit ? ' ' + result.unit : ''))
    : pct(result.annualRate)
const resultStatus = (result: IndicatorResult): string => !result.validatedRecords ? 'Belum ada hasil' :
  result.targetMet == null ? 'Target belum dapat dinilai' : result.targetMet ? 'Memenuhi' : 'Belum memenuhi'
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const CSS = [
  '.qci{display:grid;gap:12px;padding:14px}',
  '.qciHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}',
  '.qciHead h3{margin:0;font-size:16px}.qciHead p{font-size:12px;color:var(--muted);line-height:1.55;max-width:750px;margin:5px 0}',
  '.qciCount{font-size:12px;color:var(--muted);font-weight:750}',
  '.qciTabs{display:flex;gap:6px;flex-wrap:wrap}.qciTabs button,.qciAction{border:1px solid var(--line);border-radius:9px;padding:9px 12px;background:var(--surface,#fff);color:var(--ink);font-size:12px;font-weight:800;cursor:pointer}',
  '.qciTabs button[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent2);color:var(--accent2)}',
  '.qciGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
  '.qciCard{display:grid;gap:6px;align-content:start;text-align:left;min-height:95px;border:1px solid var(--line);background:var(--surface,#fff);border-radius:12px;padding:12px;cursor:pointer;color:var(--ink)}',
  '.qciCard[aria-pressed="true"]{border-color:var(--accent2);background:var(--accent-soft)}',
  '.qciCard b{font-size:12px;line-height:1.4}.qciCard small{font-size:11px;color:var(--muted)}',
  '.qciTag{font-size:10px;font-weight:850;color:var(--accent2)}',
  '.qciClear{justify-self:start;background:none;border:0;color:var(--accent2);font-size:12px;font-weight:850;cursor:pointer}',
  '.qciDetail{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface,#fff)}',
  '.qciDetailHead{padding:12px 14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;background:var(--surface-secondary,#f8faf9);border-bottom:1px solid var(--line)}',
  '.qciDetailHead h4{margin:0;font-size:14px}.qciDetailHead p{font-size:12px;color:var(--muted);margin:4px 0 0}',
  '.qciKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px}',
  '.qciKpi{padding:10px;border:1px solid var(--line);border-radius:10px}.qciKpi span{display:block;font-size:11px;color:var(--muted)}.qciKpi b{font-size:19px;display:block;margin-top:4px}',
  '.qciExplain{padding:11px 13px;font-size:12px;color:var(--muted);line-height:1.55}.qciWarning{color:#945d20}',
  '.qciCodes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;padding:10px 12px}',
  '.qciCode{padding:9px;border:1px solid var(--line);border-radius:9px}.qciCode b{font-size:16px;display:block}.qciCode span{font-size:11px;color:var(--muted)}',
  '.qciTrend{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:5px;padding:11px}',
  '.qciTrendItem{display:grid;justify-items:center;gap:3px}.qciTrendItem b,.qciTrendItem small{font-size:10px;color:var(--muted)}',
  '.qciTrack{width:100%;height:75px;display:flex;align-items:end;background:var(--surface-secondary,#f1f5f3);border-radius:5px;overflow:hidden}.qciTrack span{display:block;width:100%;background:var(--accent2);border-radius:3px}',
  '.qciTableWrap{max-width:100%;overflow:auto}.qciTable{width:100%;min-width:880px;border-collapse:collapse;font-size:12px}',
  '.qciTable th,.qciTable td{padding:9px;text-align:left;border-top:1px solid var(--line);vertical-align:top}.qciTable th{background:var(--surface-secondary,#f8faf9);color:var(--muted);white-space:nowrap}',
  '.qciTable td b{display:block;font-size:12px}.qciTable td small{display:block;color:var(--muted);margin-top:4px}',
  '.qciAction{background:var(--accent-soft);color:var(--accent2)}.qciAction:disabled{opacity:.5;cursor:not-allowed}',
  '.qciEmpty{text-align:center;padding:24px;color:var(--muted);font-size:12px}',
  '@media(max-width:1000px){.qciGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
  '@media(max-width:650px){.qci{padding:10px}.qciGrid{grid-template-columns:1fr}.qciKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.qciCodes{grid-template-columns:repeat(3,minmax(0,1fr))}.qciTrend{gap:2px}.qciTrendItem b,.qciTrendItem small{font-size:9px}}',
].join('\n')

function MonthlyTrend({ summary }: { summary: QualityCategoryAnalytics }) {
  return <div className="qciTrend" role="img" aria-label="Persentase indikator memenuhi target per bulan, bukan rata-rata capaian klinis">
    {summary.trend.map(month => <div className="qciTrendItem" key={month.month}
      title={month.met + ' dari ' + month.assessed + ' indikator memenuhi target pada bulan ' + MONTHS[month.month - 1]}>
      <div className="qciTrack"><span style={{ height: month.assessed ? (100 * month.met / month.assessed) + '%' : '0%' }} /></div>
      <b>{month.assessed ? Math.round(month.met / month.assessed * 100) + '%' : '—'}</b>
      <small>{MONTHS[month.month - 1]}</small>
    </div>)}
  </div>
}

export default function QualityCategoryIntelligence({
  results, records, year, scopeLabel, selectedCategoryId, onSelectCategory, includeReady, onAskNara, roomName,
}: Props) {
  const [program, setProgram] = useState<'all' | QualityProgram>('all')
  const analytics = useMemo(() => buildQualityCategoryAnalytics(results, records, year), [results, records, year])
  const byId = useMemo(() => new Map(analytics.map(item => [item.definition.id, item])), [analytics])
  const catalogue = useMemo(() => [...QUALITY_CATEGORY_CATALOG,
    ...analytics.filter(item => !QUALITY_CATEGORY_CATALOG.some(def => def.id === item.definition.id)).map(item => item.definition),
  ], [analytics])
  const selected = byId.get(selectedCategoryId) ?? null
  const definition = catalogue.find(item => item.id === selectedCategoryId) ?? null
  const configured = analytics.reduce((n, item) => n + item.configured, 0)
  const assessed = analytics.reduce((n, item) => n + item.assessed, 0)
  const met = analytics.reduce((n, item) => n + item.met, 0)

  return <section className="qci" aria-label="Analisis capaian berdasarkan kategori indikator mutu">
    <style>{CSS}</style>
    <header className="qciHead">
      <div><h3>Intelijen Hasil Capaian per Kategori</h3>
        <p>19 kategori dari kolom G workbook referensi, dipetakan ke INM, IMP-RS, dan IMP-Unit. Katalog dan engine tersedia tanpa mengimpor profil maupun data pasien.</p></div>
      <span className="qciCount">{fmt(analytics.length)} kategori terkonfigurasi · {fmt(configured)} indikator aktif · {met}/{assessed} indikator terukur memenuhi target</span>
    </header>
    <div className="qciTabs" aria-label="Kelompok indikator">
      {(['all', 'INM', 'IMP-RS', 'IMP-Unit'] as const).map(item => <button type="button"
        aria-pressed={program === item} key={item} onClick={() => setProgram(item)}>
        {item === 'all' ? 'Seluruh kategori' : item}
      </button>)}
    </div>
    <div className="qciGrid">
      {catalogue.filter(item => program === 'all' || item.program === program).map(item => {
        const value = byId.get(item.id)
        return <button type="button" className="qciCard" key={item.id} aria-pressed={selectedCategoryId === item.id}
          onClick={() => onSelectCategory(selectedCategoryId === item.id ? '' : item.id)}>
          <span className="qciTag">{item.program} · {item.kind === 'audit' ? 'AUDIT MEDIS' : item.kind === 'inm' ? 'NASIONAL' : item.kind === 'oppe' ? 'OPPE' : 'PENGUKURAN'}</span>
          <b>{item.name}</b>
          <small>{value ? value.configured + ' indikator · ' + value.assessed + ' dinilai · ' + value.met + ' memenuhi target' : 'Belum terdapat profil aktif yang terbit'}</small>
        </button>
      })}
    </div>
    {selectedCategoryId && <button className="qciClear" type="button" onClick={() => onSelectCategory('')}>Tampilkan seluruh indikator</button>}
    {definition && <article className="qciDetail">
      <div className="qciDetailHead">
        <div><h4>{definition.name}</h4><p>{definition.description} · {scopeLabel} · {year}</p></div>
        <button type="button" className="qciAction" disabled={!onAskNara || !selected?.validatedObservations}
          onClick={() => selected && onAskNara?.(
            (includeReady ? 'PRATINJAU: mencakup data belum disahkan, jangan dianggap laporan resmi.\n' : '') +
              buildCategoryNaraBrief(selected, year, scopeLabel),
            'Hasil Capaian · ' + definition.name,
          )}>Analisis NARA AI</button>
      </div>
      {!selected ? <div className="qciEmpty">Engine kategori siap. Angka capaian menunggu Profil Indikator diterbitkan dan tersedianya data pengukuran tervalidasi.</div> : <>
        <div className="qciKpis">
          <div className="qciKpi"><span>Indikator aktif</span><b>{fmt(selected.configured)}</b></div>
          <div className="qciKpi"><span>Indikator dapat dinilai</span><b>{fmt(selected.assessed)}</b></div>
          <div className="qciKpi"><span>Memenuhi target</span><b>{fmt(selected.met)}</b></div>
          <div className="qciKpi"><span>Belum ada data / target</span><b>{fmt(selected.withoutData + selected.withoutTarget)}</b></div>
        </div>
        {definition.kind === 'audit' ? <>
          <p className="qciExplain">Audit {definition.diagnosis}: <b>{fmt(selected.subjects)} subjek/episode teridentifikasi</b>. Distribusi Code di bawah menghitung respons <b>per kriteria audit</b>, bukan jumlah pasien unik. Perhitungan numerator/denominator tetap terpisah pada setiap indikator.</p>
          <div className="qciCodes">{([
            ['Code 1', selected.codes.code1], ['Code 2 · pengecualian', selected.codes.code2],
            ['Code 3', selected.codes.code3], ['Tanpa Code', selected.codes.uncoded],
            ['Perlu rekonsiliasi', selected.codes.pending],
          ] as const).map(([label, amount]) => <div className="qciCode" key={label}><b>{fmt(amount)}</b><span>{label}</span></div>)}</div>
        </> : <p className="qciExplain">{definition.kind === 'inm' ?
          'INM: numerator, denominator, capaian bulanan, target dan tren tetap per indikator. Ekspor CSV INM tersedia pada bagian atas. Pengiriman Kemenkes dan publikasi agregat memerlukan validasi serta persetujuan manusia.' :
          definition.kind === 'oppe' ? 'Audit OPPE memerlukan telaah profesional dan tidak boleh otomatis digunakan sebagai penilaian individu.' :
          definition.kind === 'program' ? 'Program Nasional dihitung sesuai definisi dan standar masing-masing, tidak sebagai satu persentase gabungan yang menyesatkan.' :
          'IMP: status per indikator, target, tren dan perbandingan unit; persentase indikator memenuhi target bukan rata-rata hasil numerator/denominator.'}
        </p>}
        <div className="qciDetailHead"><div><h4>Tren pemenuhan target bulanan</h4><p>Jumlah indikator memenuhi target / jumlah indikator dapat dinilai pada bulan yang sama</p></div></div>
        <MonthlyTrend summary={selected}/>
        <div className="qciTableWrap"><table className="qciTable">
          <thead><tr><th>Indikator</th><th>Unit</th>
            {definition.kind === 'audit' && <><th>Code 1</th><th>Code 2</th><th>Code 3</th><th>Tanpa Code</th><th>Perlu telaah</th></>}
            <th>Numerator</th><th>Denominator</th><th>Capaian</th><th>Target</th><th>Penilaian</th>
          </tr></thead>
          <tbody>{selected.results.map(item => {
            const breakdown = selected.byIndicator[indicatorProfileKey(item.profile)]
            return <tr key={indicatorProfileKey(item.profile)}>
              <td><b>{String(item.profile.code ?? '')} · {String(item.profile.title ?? 'Tanpa judul')}</b><small>{item.continuous ? 'Nilai kontinu' : 'Rasio N/D atau respons berkode'}</small></td>
              <td>{roomName(Number(item.profile.room_id))}</td>
              {definition.kind === 'audit' && <><td>{breakdown?.code1 ?? 0}</td><td>{breakdown?.code2 ?? 0}</td><td>{breakdown?.code3 ?? 0}</td><td>{breakdown?.uncoded ?? 0}</td><td>{breakdown?.pending ?? 0}</td></>}
              <td>{item.continuous ? '—' : fmt(item.annualNumerator)}</td>
              <td>{item.continuous ? '—' : fmt(item.annualDenominator)}</td>
              <td><b>{resultValue(item)}</b></td><td>{String(item.profile.target_text ?? 'Belum ditetapkan')}</td>
              <td className={item.targetMet === false ? 'qciWarning' : ''}>{resultStatus(item)}</td>
            </tr>
          })}</tbody>
        </table></div>
        {definition.kind === 'inm' && <div className="qciExplain">Kandidat publikasi internal saja: tanpa identitas pasien. Publikasi landing page tidak dilakukan otomatis dan memerlukan peninjauan definisi nasional, hasil, serta otorisasi.</div>}
      </>}
    </article>}
    {includeReady && <p className="qciExplain qciWarning" role="status">Pratinjau termasuk laporan belum disahkan. Jangan gunakan angka pratinjau sebagai laporan resmi atau sumber publikasi.</p>}
    {!definition && <div className="qciExplain">Pilih kategori untuk membuka analitik khusus. Tabel hasil di bawah dapat menampilkan seluruh kategori tanpa mengambil data dari profil bawaan lama.</div>}
  </section>
}
