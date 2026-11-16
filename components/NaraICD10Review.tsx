'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type ReviewRow = { diagnosis: string; patient_count: number; mapping_status: string; icd10_code: string | null; icd10_title: string | null; validation_reference: string | null }
type Draft = { code: string; title: string; reference: string }

export default function NaraICD10Review({ sb }: { sb: SupabaseClient }) {
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const year = new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear()
    const { data, error: queryError } = await sb.rpc('aureka_nara_icd10_review_queue', { p_year: year, p_room: null, p_limit: 100 })
    if (queryError) { setError('Daftar diagnosis belum dapat dimuat. Pastikan migrasi Clinical Intelligence telah diterapkan dan role Anda memiliki akses.'); setRows([]) }
    else {
      const items = (Array.isArray(data) ? data : []) as ReviewRow[]
      setRows(items)
      setDrafts((previous) => { const next = { ...previous }; for (const row of items) if (!next[row.diagnosis]) next[row.diagnosis] = { code: row.icd10_code || '', title: row.icd10_title || '', reference: row.validation_reference || '' }; return next })
    }
    setLoading(false)
  }, [sb])
  useEffect(() => {
    let cancelled = false
    void sb.rpc('aureka_get_my_profile').then(({ data, error: profileError }) => {
      if (cancelled) return
      const profile = Array.isArray(data) ? data[0] : data
      setAuthorized(!profileError && ['ADMIN','PMKP'].includes(String(profile?.role_code || '').toUpperCase()))
      setChecking(false)
    }).catch(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [sb])
  useEffect(() => { if (authorized) void load() }, [authorized, load])
  const update = (diagnosis: string, key: keyof Draft, value: string) => setDrafts((p) => ({ ...p, [diagnosis]: { ...(p[diagnosis] || { code: '', title: '', reference: '' }), [key]: value } }))
  const save = async (row: ReviewRow) => {
    const d = drafts[row.diagnosis] || { code: '', title: '', reference: '' }
    if (!/^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/.test(d.code.trim().toUpperCase())) { setError('Format kode tidak sesuai pola ICD-10.'); return }
    if (!d.title.trim() || !d.reference.trim()) { setError('Judul diagnosis dan referensi validasi wajib diisi.'); return }
    setSaving(row.diagnosis); setError(''); setNotice('')
    const { error: saveError } = await sb.rpc('aureka_nara_icd10_upsert_mapping', { p_diagnosis: row.diagnosis, p_icd10_code: d.code.trim().toUpperCase(), p_icd10_title: d.title.trim(), p_status: 'validated', p_validation_reference: d.reference.trim(), p_review_note: 'Divalidasi melalui ruang kerja koding NARA oleh reviewer berwenang.' })
    if (saveError) setError('Pemetaan belum tersimpan. Periksa kode, referensi, dan hak akses reviewer.')
    else { setNotice('Pemetaan ' + row.diagnosis + ' berhasil disimpan sebagai tervalidasi.'); await load() }
    setSaving(null)
  }
  return <section aria-label="Validasi kamus ICD-10" style={{ display:'grid', gap:12, padding:16, border:'1px solid #dce5ed', borderRadius:16, background:'#fff', color:'#23374a' }}>
    <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
      <div><small style={{ fontSize:10, letterSpacing:'.13em', fontWeight:800, color:'#497a93' }}>CLINICAL CODING GOVERNANCE</small><h3 style={{ margin:'3px 0', fontSize:16 }}>Validasi diagnosis ICD-10</h3><p style={{ margin:0, color:'#69798a', fontSize:11 }}>Istilah diagnosis agregat tanpa nama atau nomor rekam medis.</p></div>
      {authorized && <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Memuat…' : 'Muat ulang'}</button>}
    </header>
    {checking ? <p>Memeriksa hak akses…</p> : !authorized ? <p>Ruang validasi hanya tersedia untuk Super Admin dan Komite PMKP.</p> : <>
      <p style={{ margin:0, padding:10, borderRadius:10, background:'#f2f7fa', color:'#516677', fontSize:11, lineHeight:1.5 }}>Kode hanya ditetapkan sebagai tervalidasi setelah diperiksa reviewer terhadap rujukan resmi ICD-10. NARA tidak menebak kode dari singkatan ambigu.</p>
      {error && <p role="alert" style={{ margin:0, padding:10, background:'#fff2f0', color:'#a33225', fontSize:11 }}>{error}</p>}
      {notice && <p role="status" style={{ margin:0, padding:10, background:'#eef8f2', color:'#21734a', fontSize:11 }}>{notice}</p>}
      {loading && !rows.length ? <p>Mengambil istilah diagnosis agregat…</p> : rows.length === 0 ? <p>Tidak ada diagnosis yang menunggu pemetaan atau jumlahnya di bawah ambang privasi.</p> :
        <div style={{ display:'grid', gap:10, maxHeight:520, overflow:'auto' }}>{rows.map((row) => {
          const d = drafts[row.diagnosis] || { code:'', title:'', reference:'' }
          return <article key={row.diagnosis} style={{ display:'grid', gap:9, padding:12, border:'1px solid #e5ebf0', borderRadius:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}><strong style={{ fontSize:12 }}>{row.diagnosis}</strong><span style={{ fontSize:10, color:'#738292' }}>{row.patient_count} pasien unik · {row.mapping_status}</span></div>
            <div style={{ display:'grid', gridTemplateColumns:'minmax(90px,.6fr) minmax(150px,1fr) minmax(180px,1.3fr) auto', gap:8, alignItems:'end' }}>
              <label style={{ display:'grid', gap:4, fontSize:10 }}>Kode ICD-10<input value={d.code} onChange={(e) => update(row.diagnosis,'code',e.target.value)} placeholder="K35.8" maxLength={12}/></label>
              <label style={{ display:'grid', gap:4, fontSize:10 }}>Judul baku<input value={d.title} onChange={(e) => update(row.diagnosis,'title',e.target.value)} placeholder="Judul sesuai tabular ICD-10" maxLength={180}/></label>
              <label style={{ display:'grid', gap:4, fontSize:10 }}>Referensi validasi<input value={d.reference} onChange={(e) => update(row.diagnosis,'reference',e.target.value)} placeholder="WHO ICD-10 2019 · review PMIK/DPJP" maxLength={300}/></label>
              <button type="button" disabled={saving===row.diagnosis} onClick={() => void save(row)}>{saving===row.diagnosis ? 'Menyimpan…' : 'Validasi kode'}</button>
            </div>
          </article>
        })}</div>
      }
    </>}
    <style jsx>{`
      input{width:100%;min-width:0;min-height:36px;padding:7px 9px;border:1px solid #d7e1e9;border-radius:8px;font-size:11px;color:#24374a;background:#fff}
      button{min-height:36px;border:0;border-radius:9px;padding:8px 12px;background:#194f72;color:#fff;font-size:11px;font-weight:750;cursor:pointer}
      button:disabled{opacity:.55;cursor:wait}
      @media(max-width:900px){article>div:last-child{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:540px){article>div:last-child{grid-template-columns:1fr!important}}
    `}</style>
  </section>
}