'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { aurekaConfirm } from '@/components/ui/aurekaConfirm'

type Room = { id: number | string; name: string }
type Row = Record<string, any>
const q = () => aurekaSupabase.schema('aureka_quality')
const active = (r: Row) => r.is_active === true && r.status === 'published'

// Kolom yang tidak ikut disalin (identitas baris, jejak waktu & penulis, rantai versi).
const SKIP = /^(id|created_at|updated_at|published_at|retired_at|created_by|updated_by|retired_by|approved_at|approved_by|version|previous_version_id|parent_id|supersedes_id|superseded_by)$/

/**
 * Kelengkapan profil indikator per unit untuk satu tahun, dengan tombol menyalin
 * profil aktif tahun sebelumnya ke unit yang belum punya. Tanpa profil aktif, logbook unit tidak bisa diisi.
 */
export default function IndicatorCoveragePanel({ rooms, year, onCopied }: { rooms: Room[]; year: number; onCopied?: () => void }) {
  const [cur, setCur] = useState<Row[]>([])
  const [prev, setPrev] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string>('')
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b] = await Promise.all([
      q().from('indicator_profiles').select('id,room_id,code,status,is_active').eq('profile_year', year),
      q().from('indicator_profiles').select('id,room_id,code,status,is_active').eq('profile_year', year - 1),
    ])
    setLoading(false)
    if (a.error || b.error) { setMsg(toUserFacingError(a.error || b.error, { fallback: 'Kelengkapan indikator belum dapat dimuat.' })); return }
    setCur((a.data || []) as Row[])
    setPrev((b.data || []) as Row[])
  }, [year])
  useEffect(() => { void load() }, [load])

  const units = useMemo(() => rooms.map((r) => {
    const id = Number(r.id)
    const now = cur.filter((p) => Number(p.room_id) === id && active(p))
    const before = prev.filter((p) => Number(p.room_id) === id && active(p))
    const nowCodes = new Set(now.map((p) => String(p.code)))
    const copyable = before.filter((p) => !nowCodes.has(String(p.code))).length
    return { id, name: r.name, now: now.length, before: before.length, copyable }
  }).sort((x, y) => (x.now === 0 ? 0 : 1) - (y.now === 0 ? 0 : 1) || x.name.localeCompare(y.name, 'id')), [rooms, cur, prev])

  const covered = units.filter((u) => u.now > 0).length
  const fillable = units.filter((u) => u.now === 0 && u.copyable > 0)

  const copyUnits = async (unitIds: number[]) => {
    const { data: auth } = await aurekaSupabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
    let total = 0
    for (const roomId of unitIds) {
      const { data: src, error } = await q().from('indicator_profiles').select('*')
        .eq('profile_year', year - 1).eq('room_id', roomId).eq('status', 'published').eq('is_active', true)
      if (error) throw error
      const existing = new Set(cur.filter((p) => Number(p.room_id) === roomId && active(p)).map((p) => String(p.code)))
      const rows = ((src || []) as Row[]).filter((p) => !existing.has(String(p.code))).map((p) => {
        const out: Row = {}
        Object.keys(p).forEach((k) => { if (!SKIP.test(k)) out[k] = p[k] })
        return { ...out, profile_year: year, version: 1, status: 'published', is_active: true, created_by: uid, updated_by: uid }
      })
      if (!rows.length) continue
      const ins = await q().from('indicator_profiles').insert(rows)
      if (ins.error) throw ins.error
      total += rows.length
    }
    return total
  }

  const run = async (unitIds: number[], label: string) => {
    const n = unitIds.reduce((sum, id) => sum + (units.find((u) => u.id === id)?.copyable || 0), 0)
    if (!n) return
    const ok = await aurekaConfirm(`Salin ${n} profil indikator aktif tahun ${year - 1} ke ${label} untuk tahun ${year}? Target dan definisi ikut tersalin; periksa lagi bila ada perubahan.`, { title: 'Salin profil indikator', confirmLabel: 'Salin' })
    if (!ok) return
    setBusy(unitIds.length === 1 ? String(unitIds[0]) : 'all')
    setMsg('')
    try {
      const total = await copyUnits(unitIds)
      setMsg(`${total} profil indikator berhasil disalin ke tahun ${year}.`)
      await load()
      onCopied?.()
    } catch (e) {
      setMsg('Penyalinan gagal: ' + toUserFacingError(e, { fallback: 'Periksa hak akses Anda.' }))
    } finally {
      setBusy('')
    }
  }

  if (!rooms.length) return null
  return (
    <section className="icPanel" aria-label={'Kelengkapan profil indikator ' + year}>
      <div className="icHead">
        <div>
          <span className="icEyebrow">Kelengkapan {year}</span>
          <h4>{loading ? 'Memeriksa unit…' : `${covered} dari ${units.length} unit punya indikator aktif`}</h4>
          <p>Unit tanpa profil aktif belum bisa mengisi logbook.{fillable.length > 0 ? ` ${fillable.length} unit bisa disalin dari ${year - 1}.` : ''}</p>
        </div>
        <div className="icActions">
          {fillable.length > 1 && <button type="button" className="icPrimary" disabled={!!busy} onClick={() => void run(fillable.map((u) => u.id), fillable.length + ' unit')}>{busy === 'all' ? 'Menyalin…' : `Salin untuk ${fillable.length} unit`}</button>}
          <button type="button" className="icGhost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Tutup daftar' : 'Lihat per unit'}</button>
        </div>
      </div>
      <div className="icMeter" aria-hidden="true"><i style={{ width: (units.length ? (covered / units.length) * 100 : 0) + '%' }} /></div>
      {msg && <p className="icMsg" role="status">{msg}</p>}
      {open && <ul className="icList">
        {units.map((u) => <li key={u.id} className={u.now ? 'ok' : 'empty'}>
          <span className="icName">{u.name}</span>
          <span className="icCount">{u.now ? `${u.now} aktif` : 'Belum ada'}<small>{year - 1}: {u.before}</small></span>
          {u.now === 0 && u.copyable > 0
            ? <button type="button" disabled={!!busy} onClick={() => void run([u.id], u.name)}>{busy === String(u.id) ? 'Menyalin…' : `Salin ${u.copyable} dari ${year - 1}`}</button>
            : u.now === 0 ? <em>Tambah manual</em> : <span />}
        </li>)}
      </ul>}
    </section>
  )
}
