// Laporan PMKP (bulanan, triwulan, atau tahunan) siap cetak/PDF (dibuka di jendela baru lalu dialog cetak browser → "Simpan sebagai PDF").
// Hanya angka agregat; tidak memuat identitas pasien.

type CountItem = { label: string; count: number }
type MonthItem = { month: number; total: number; validated?: number }
export type ReportSummary = {
  quality: { active_indicators: number; records: number; validated: number; validation_rate: number; monthly: MonthItem[]; categories: CountItem[] }
  clinical: { episodes: number; validated_episodes: number; clinical_pathway_audits: number; clinical_death_audits: number; monthly: MonthItem[] }
  incidents: { total: number; open: number; closed: number; monthly: MonthItem[] }
  risk: { total: number; very_high: number; open: number; monthly: MonthItem[]; levels: CountItem[]; categories: CountItem[] }
  program: { recommendations: number; actions: number; open_actions: number; overdue_actions: number; completed_actions: number }
}
/** months: bulan-bulan dalam periode yang sudah diisi logbook oleh ruangan ini. */
export type ReportRoomStatus = { name: string; months: number[] }
export type ReportPeriod = { kind: 'month'; month: number } | { kind: 'quarter'; quarter: number } | { kind: 'year' }

export const periodMonths = (p: ReportPeriod): number[] => p.kind === 'month' ? [p.month] : p.kind === 'quarter' ? [p.quarter * 3 - 2, p.quarter * 3 - 1, p.quarter * 3] : Array.from({ length: 12 }, (_, i) => i + 1)
const ROMAN = ['I', 'II', 'III', 'IV']
export const periodLabel = (p: ReportPeriod, year: number) => p.kind === 'month' ? `${MONTHS[p.month - 1]} ${year}` : p.kind === 'quarter' ? `Triwulan ${ROMAN[p.quarter - 1]} ${year}` : `Tahun ${year}`

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const f = (v: unknown) => n(v).toLocaleString('id-ID')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const inMonths = (rows: MonthItem[] | undefined, ms: number[], key: 'total' | 'validated' = 'total') => ms.reduce((sum, m) => sum + n((rows || []).find((r) => Number(r.month) === m)?.[key]), 0)

export function buildPeriodReportHtml(opts: { year: number; period: ReportPeriod; scope: string; summary: ReportSummary; rooms: ReportRoomStatus[]; preparedBy: string }) {
  const { year, scope, summary: s, rooms, preparedBy } = opts
  const ms = periodMonths(opts.period)
  const period = periodLabel(opts.period, year)
  const kindWord = opts.period.kind === 'month' ? 'Bulanan' : opts.period.kind === 'quarter' ? 'Triwulan' : 'Tahunan'
  const colLabel = opts.period.kind === 'month' ? MONTHS[ms[0] - 1] : opts.period.kind === 'quarter' ? 'Triwulan ' + ROMAN[(opts.period as { quarter: number }).quarter - 1] : 'Tahun ' + year
  const ytdLabel = opts.period.kind === 'year' ? 'Total ' + year : `Jan–${MONTHS[ms[ms.length - 1] - 1].slice(0, 3)} ${year}`
  const full = rooms.filter((r) => ms.every((m) => r.months.includes(m)))
  const notFull = rooms.filter((r) => !ms.every((m) => r.months.includes(m)))
  const reported = full
  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Pontianak' }).format(new Date())
  const row = (label: string, month: string | number, ytd: string | number, note = '') => `<tr><td>${esc(label)}</td><td class="num">${month}</td><td class="num">${ytd}</td><td>${esc(note)}</td></tr>`
  const list = (items: CountItem[]) => items.length ? `<table><thead><tr><th>Level / kategori</th><th class="num">Jumlah</th></tr></thead><tbody>${items.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${f(i.count)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada data.</p>'
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan ${kindWord} PMKP ${esc(period)}</title>
<style>
@page{size:A4;margin:18mm 16mm}
*{box-sizing:border-box}body{font-family:"Plus Jakarta Sans",Arial,sans-serif;color:#1f2430;font-size:11pt;line-height:1.45;margin:0}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f2430;padding-bottom:8px;margin-bottom:14px}
h1{font-size:16pt;margin:0}h2{font-size:12pt;margin:18px 0 6px;color:#0e5566}.sub{color:#4b5565;font-size:10pt}
table{width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:10pt}th,td{border:1px solid #cfd8e3;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef3f8}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.muted{color:#6b7684}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0}.kpi{border:1px solid #cfd8e3;border-radius:8px;padding:8px}.kpi b{display:block;font-size:15pt}.kpi span{font-size:9pt;color:#4b5565}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rooms{columns:2;font-size:9.5pt;margin:4px 0;padding-left:18px}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px;text-align:center;page-break-inside:avoid}.sign div{min-height:110px;display:flex;flex-direction:column;justify-content:space-between}
footer{margin-top:16px;font-size:8.5pt;color:#6b7684;border-top:1px solid #cfd8e3;padding-top:6px}
.tools{position:fixed;right:16px;top:16px}.tools button{font:inherit;padding:8px 14px;border-radius:8px;border:0;background:#1f2430;color:#fff;cursor:pointer}
@media print{.tools{display:none}}
</style></head><body>
<div class="tools"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
<header><div><div class="sub">UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak · Komite PMKP</div><h1>Laporan ${kindWord} Mutu dan Keselamatan Pasien</h1></div><div class="sub">Periode: <b>${esc(period)}</b><br>Cakupan: ${esc(scope)}</div></header>

<div class="kpis">
<div class="kpi"><span>Ruangan lengkap mengisi logbook</span><b>${reported.length}/${rooms.length}</b></div>
<div class="kpi"><span>Catatan indikator periode ini</span><b>${f(inMonths(s.quality.monthly, ms))}</b></div>
<div class="kpi"><span>Laporan insiden periode ini</span><b>${f(inMonths(s.incidents.monthly, ms))}</b></div>
<div class="kpi"><span>Risiko sangat tinggi</span><b>${f(s.risk.very_high)}</b></div>
</div>

<h2>1. Indikator mutu</h2>
<table><thead><tr><th>Ukuran</th><th class="num">${esc(colLabel)}</th><th class="num">${esc(ytdLabel)}</th><th>Keterangan</th></tr></thead><tbody>
${row('Catatan indikator masuk', f(inMonths(s.quality.monthly, ms)), f(s.quality.records))}
${row('Catatan tervalidasi', f(inMonths(s.quality.monthly, ms, 'validated')), f(s.quality.validated), 'Tingkat validasi tahun berjalan ' + n(s.quality.validation_rate).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%')}
${row('Indikator aktif', '–', f(s.quality.active_indicators), 'Profil indikator terbit')}
${row('Episode pelayanan klinis', f(inMonths(s.clinical.monthly, ms)), f(s.clinical.episodes))}
${row('Audit Clinical Pathway', '–', f(s.clinical.clinical_pathway_audits))}
${row('Audit klinis & kematian', '–', f(s.clinical.clinical_death_audits))}
</tbody></table>
<p class="muted">Bulan berisi 0 berarti belum ada data masuk, bukan capaian 0%.</p>

<h2>2. Kepatuhan pelaporan logbook ${esc(period)}</h2>
${notFull.length ? `<p>${notFull.length} dari ${rooms.length} ruangan belum lengkap mengisi logbook${ms.length > 1 ? ' (angka = bulan terisi dari ' + ms.length + ')' : ''}:</p><ul class="rooms">${notFull.map((r) => `<li>${esc(r.name)}${ms.length > 1 ? ` <span class="muted">${ms.filter((m) => r.months.includes(m)).length}/${ms.length}</span>` : ''}</li>`).join('')}</ul>` : '<p>Seluruh ruangan sudah mengisi logbook.</p>'}

<h2>3. Keselamatan pasien</h2>
<table><thead><tr><th>Ukuran</th><th class="num">${esc(colLabel)}</th><th class="num">Tahun berjalan</th><th>Keterangan</th></tr></thead><tbody>
${row('Laporan insiden (IKP)', f(inMonths(s.incidents.monthly, ms)), f(s.incidents.total), 'Jumlah laporan, bukan tingkat kejadian')}
${row('Masih terbuka', '–', f(s.incidents.open))}
${row('Selesai', '–', f(s.incidents.closed))}
</tbody></table>

<h2>4. Manajemen risiko</h2>
<div class="two"><div><table><tbody>
<tr><td>Risiko terdaftar</td><td class="num">${f(s.risk.total)}</td></tr>
<tr><td>Risiko sangat tinggi</td><td class="num">${f(s.risk.very_high)}</td></tr>
<tr><td>Masih open</td><td class="num">${f(s.risk.open)}</td></tr>
<tr><td>Ditambahkan periode ini</td><td class="num">${f(inMonths(s.risk.monthly, ms))}</td></tr>
</tbody></table></div><div>${list(s.risk.levels || [])}</div></div>

<h2>5. Program & rencana tindak lanjut</h2>
<table><tbody>
<tr><td>Rekomendasi</td><td class="num">${f(s.program.recommendations)}</td></tr>
<tr><td>Rencana tindak lanjut (RTL)</td><td class="num">${f(s.program.actions)}</td></tr>
<tr><td>RTL selesai</td><td class="num">${f(s.program.completed_actions)}</td></tr>
<tr><td>RTL belum selesai</td><td class="num">${f(s.program.open_actions)}</td></tr>
<tr><td>RTL lewat tenggat</td><td class="num">${f(s.program.overdue_actions)}</td></tr>
</tbody></table>

<h2>6. Catatan & tindak lanjut</h2>
<p style="min-height:70px;border:1px dashed #cfd8e3;border-radius:6px;padding:8px" contenteditable="true">Ketik catatan Komite PMKP di sini sebelum dicetak…</p>

<div class="sign"><div><span>Disusun oleh,<br>Ketua Komite PMKP</span><span>(………………………………)</span></div><div><span>Pontianak, ${esc(today)}<br>Mengetahui, Direktur</span><span>(………………………………)</span></div></div>
<footer>Dibuat dari AUREKA oleh ${esc(preparedBy)} pada ${esc(today)}. Angka agregat sesuai hak akses; tidak memuat identitas pasien.</footer>
<script>setTimeout(function(){try{window.print()}catch(e){}},400)</script>
</body></html>`
}

/** Kompatibilitas: laporan satu bulan. */
export function buildMonthlyReportHtml(opts: { year: number; month: number; scope: string; summary: ReportSummary; rooms: Array<{ name: string; reported: boolean }>; preparedBy: string }) {
  return buildPeriodReportHtml({ ...opts, period: { kind: 'month', month: opts.month }, rooms: opts.rooms.map((r) => ({ name: r.name, months: r.reported ? [opts.month] : [] })) })
}
