'use client'

import { useState } from 'react'
import { LiquidGlass } from '@/components/LiquidGlass'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

/** Unduh cadangan data satu tahun (tanpa identitas pasien) sebagai satu file Excel. */
export default function BackupPanel({ rooms }: { rooms: Array<{ id: number | string; name: string }> }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const run = async () => {
    setBusy(true); setMsg('')
    try {
      const { collectBackup, buildBackupXlsx } = await import('@/lib/aureka/data-backup')
      const { sheets, problems } = await collectBackup(year, rooms)
      const { data: auth } = await aurekaSupabase.auth.getUser()
      const bytes = await buildBackupXlsx(year, sheets, problems, String(auth.user?.user_metadata?.full_name || auth.user?.email || 'admin'))
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aureka-cadangan-${year}-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      const total = sheets.reduce((s, x) => s + x.rows.length, 0)
      setMsg(`Cadangan ${year} diunduh: ${total.toLocaleString('id-ID')} baris dalam ${sheets.length} lembar.` + (problems.length ? ` ${problems.length} bagian tidak termuat (lihat lembar Info).` : ''))
    } catch (e) {
      setMsg('Cadangan gagal dibuat: ' + toUserFacingError(e, { fallback: 'Coba lagi.' }))
    } finally { setBusy(false) }
  }
  return <LiquidGlass className="stPanel">
    <h4>Cadangan data</h4>
    <p className="stPanelHint">Satu file Excel berisi profil indikator, kepatuhan logbook, daftar insiden, register risiko, rekomendasi, dan RTL. Tidak memuat identitas pasien.</p>
    <div className="akHelpRow">
      <select aria-label="Tahun cadangan" value={year} onChange={(e) => setYear(Number(e.target.value))} className="akBackupYear">
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button type="button" className="akInstallBtn" disabled={busy} onClick={() => void run()}>{busy ? 'Menyusun…' : 'Unduh cadangan (Excel)'}</button>
    </div>
    {msg && <p className="stPanelHint" role="status" style={{ marginTop: 8 }}>{msg}</p>}
  </LiquidGlass>
}
