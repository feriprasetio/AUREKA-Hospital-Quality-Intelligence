export type IndividualReportSection = {
  title: string
  columns: string[]
  rows: unknown[][]
}

export type IndividualReportOptions = {
  title: string
  subtitle: string
  metadata: Array<[string, unknown]>
  sections: IndividualReportSection[]
  footer?: string
}

const escapeHtml = (value: unknown) => String(value ?? '—')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const fileStem = (value: string) => value
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100) || 'aureka-report'

export function downloadAssessmentJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  downloadBlob(filename.endsWith('.json') ? filename : `${filename}.json`, blob)
}

export function downloadAssessmentCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csvCell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob)
}

export function openPrintableIndividualReport(options: IndividualReportOptions): boolean {
  if (typeof window === 'undefined') return false
  const reportWindow = window.open('', '_blank')
  if (!reportWindow) return false

  const metadata = options.metadata.map(([label, value]) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
  ).join('')
  const sections = options.sections.map((section) => {
    const columns = section.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')
    const rows = section.rows.length
      ? section.rows.map((row) => `<tr>${section.columns.map((_, index) => `<td>${escapeHtml(row[index])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${Math.max(1, section.columns.length)}" class="empty">Belum ada data pada bagian ini.</td></tr>`
    return `<section><h2>${escapeHtml(section.title)}</h2><div class="table-wrap"><table><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table></div></section>`
  }).join('')
  const footer = escapeHtml(options.footer || 'Dokumen internal AUREKA. Simpan dan distribusikan sesuai kebijakan kerahasiaan rekam mutu rumah sakit.')
  const documentHtml = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
:root{color-scheme:light;--ink:#203b2e;--muted:#627369;--accent:#24724e;--line:#dbe5de;--soft:#f3f7f4}
*{box-sizing:border-box}
body{margin:0;background:#edf3ef;color:#23372d;font:13px/1.5 Arial,Helvetica,sans-serif}
.toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:12px max(16px,calc((100vw - 1100px)/2));background:rgba(249,252,250,.94);border-bottom:1px solid #dce5de;z-index:5}
button{border:1px solid #d0ded3;border-radius:10px;padding:9px 13px;font-weight:700;color:#234333;background:#fff;cursor:pointer}
button.primary{background:#26724f;color:#fff;border-color:#26724f}
main{max-width:1100px;margin:22px auto;padding:26px;background:#fff;border:1px solid #e0e8e2;border-radius:18px;box-shadow:0 10px 34px rgba(23,55,37,.08)}
.brand{font-size:10px;letter-spacing:.15em;font-weight:800;color:var(--accent);text-transform:uppercase}
h1{font-size:24px;margin:6px 0;color:var(--ink)}
.subtitle{margin:0 0 20px;color:var(--muted);font-size:12px}
.identity{width:100%;border-collapse:collapse;margin:14px 0 20px}
th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
.identity th{width:24%;background:var(--soft);font-size:11px;color:#40594a}
section{margin-top:20px;break-inside:avoid}
h2{font-size:15px;margin:0 0 8px;color:var(--ink)}
.table-wrap{overflow:visible;border:1px solid var(--line);border-radius:9px}
table{width:100%;border-collapse:collapse;table-layout:auto}
thead th{background:#edf4ef;color:#3b5745;font-size:10px}
td{font-size:10px}
.empty{text-align:center;color:#718075}
footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--line);font-size:9px;color:var(--muted)}
@media(max-width:700px){main{margin:0;padding:12px;border-radius:0}.toolbar{position:static}.identity th{width:35%}body{font-size:12px}}
@media print{@page{size:A4 portrait;margin:12mm}.toolbar{display:none!important}body{background:#fff;font-size:10pt}main{max-width:none;margin:0;padding:0;border:0;box-shadow:none;border-radius:0}h1{font-size:18pt}.subtitle{margin-bottom:10mm}.identity{margin:5mm 0}.table-wrap{border:0}th,td{padding:4px 5px;break-inside:avoid}section{break-inside:avoid}.table-wrap,table{break-inside:auto}tr{break-inside:avoid;break-after:auto}footer{margin-top:8mm}}
</style></head>
<body>
<div class="toolbar"><button type="button" onclick="window.close()">Tutup</button><button class="primary" type="button" onclick="window.print()">Cetak / Simpan PDF</button></div>
<main><div class="brand">AUREKA · Hospital Quality Intelligence</div><h1>${escapeHtml(options.title)}</h1><p class="subtitle">${escapeHtml(options.subtitle)}</p>
<table class="identity"><tbody>${metadata}</tbody></table>${sections}<footer>${footer}<br>Dicetak pada ${escapeHtml(new Date().toLocaleString('id-ID'))}.</footer></main>
</body></html>`

  try {
    reportWindow.document.open()
    reportWindow.document.write(documentHtml)
    reportWindow.document.close()
    reportWindow.opener = null
    reportWindow.focus()
    return true
  } catch {
    reportWindow.close()
    return false
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileStem(filename)
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
