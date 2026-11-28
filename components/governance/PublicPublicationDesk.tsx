'use client'

import { aurekaConfirm } from '@/components/ui/aurekaConfirm'
import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { loadPublicInm, loadPublicAggregate } from '@/lib/aureka/public-publication-source'

type Domain = 'inm' | 'safety' | 'risk'
type Snapshot = {
  id:string; domain:Domain;period:string;status:string;created_at:string
  created_by:string;approved_by:string|null;published_at:string|null
  payload:Record<string,unknown>
}
const TYPES:Record<Domain,string>={inm:'Indikator Nasional Mutu',safety:'Keselamatan Pasien',risk:'Manajemen Risiko'}
const currentPeriod=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Pontianak',year:'numeric',month:'2-digit'}).format(new Date())
const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}):'-'
function PublicationState({status}:{status:string}) {
  const labels:Record<string,string>={draft:'Menunggu tinjauan',published:'Tayang',superseded:'Digantikan',withdrawn:'Ditarik'}
  return <span className={'aurekaPublishState aurekaPublishState-'+status}>{labels[status]||status}</span>
}

export default function PublicPublicationDesk({role,userId}:{role:string|null;userId:string}){
  const [domain,setDomain]=useState<Domain>('inm')
  const [period,setPeriod]=useState(currentPeriod)
  const [preview,setPreview]=useState<{domain:Domain;period:string;payload:Record<string,unknown>}|null>(null)
  const currentPreview=preview?.domain===domain&&preview.period===period?preview:null
  const [snapshots,setSnapshots]=useState<Snapshot[]>([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const canApprove=['ADMIN','PMKP','DIREKTUR'].includes(role||'')
  const canStage=['ADMIN','PMKP','DIREKTUR','MANAGEMENT'].includes(role||'')
  const refresh=useCallback(async()=>{
    const {data,error}=await aurekaSupabase.rpc('aureka_manage_public_portal_snapshots')
    if(error)throw error
    if(!Array.isArray(data))throw new Error('Register publikasi belum dapat dibaca.')
    setSnapshots(data as Snapshot[])
  },[])
  useEffect(()=>{
    let mounted=true
    refresh().catch(()=>{if(mounted)setError('Register publikasi belum dapat dibaca.')})
      .finally(()=>{if(mounted)setLoading(false)})
    return()=>{mounted=false}
  },[refresh])
  const generate=async()=>{
    if(!canStage||busy)return
    setPreview(null);setError('');setNotice('')
    const match=domain==='inm'?/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(period):/^(20\d{2})$/.exec(period)
    if(!match){setError(domain==='inm'?'Pilih periode YYYY-MM.':'Pilih tahun YYYY.');return}
    setBusy(true)
    try{
      const payload=domain==='inm'?await loadPublicInm(Number(match[1]),Number(match[2]),new AbortController().signal):await loadPublicAggregate(domain,Number(match[1]))
      setPreview({domain,period,payload})
    }catch(e){setError(e instanceof Error?e.message:'Sumber belum dapat dibaca.')}
    finally{setBusy(false)}
  }

  const stage=async()=>{
    if(!canStage||busy||!currentPreview)return
    setNotice('');setError('')
    const payload=currentPreview.payload
    setBusy(true)
    try{
      const {error}=await aurekaSupabase.rpc('aureka_stage_public_portal_snapshot',{
        p_domain:domain,p_period_label:period.trim(),p_payload:payload
      })
      if(error)throw error
      await refresh()
      setNotice('Draf berhasil diajukan. Data belum tayang dan membutuhkan persetujuan pejabat berbeda.')
    }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan draf publikasi.')}
    finally{setBusy(false)}
  }
  const decide=async(item:Snapshot,action:'approve'|'withdraw')=>{
    if(!canApprove||busy)return
    if (!(await aurekaConfirm(
      action === 'approve' ? 'Snapshot lama pada domain yang sama akan digantikan.' : 'Snapshot ini akan ditarik dari portal.',
      { title: action === 'approve' ? 'Setujui publikasi?' : 'Tarik publikasi?', confirmLabel: action === 'approve' ? 'Publikasikan' : 'Tarik publikasi', danger: action === 'withdraw' },
    ))) return
    setNotice('');setError('');setBusy(true)
    try{
      const name=action==='approve'?'aureka_approve_public_portal_snapshot':'aureka_withdraw_public_portal_snapshot'
      const {data,error}=await aurekaSupabase.rpc(name,{p_snapshot_id:item.id})
      if(error)throw error
      if(data!==true){
        await refresh()
        setError('Status snapshot sudah berubah atau tindakan belum dikonfirmasi. Periksa register publikasi.')
        return
      }
      await refresh().catch(()=>setError('Tindakan berhasil. Muat ulang register untuk melihat status terbaru.'))
      setNotice(action==='approve'?'Snapshot berhasil dipublikasikan.':'Snapshot berhasil ditarik dari portal.')
    }catch(e){setError(e instanceof Error?e.message:'Tindakan belum berhasil.')}
    finally{setBusy(false)}
  }
  if(!canStage)return null
  return <section className="aurekaPublishDesk" aria-label="Konsol publikasi publik">
    <div className="aurekaPublishIntro">

      <h2>Public Publication Desk</h2>
      <p>Susun dan setujui data yang layak tayang untuk masyarakat. Pratinjau otomatis dari modul sumber. Draf tidak otomatis menjadi publik.</p>
    </div>
    {!!error&&<p className="aurekaPublishAlert aurekaPublishError" role="alert">{error}</p>}
    {!!notice&&<p className="aurekaPublishAlert" role="status">{notice}</p>}
    <div className="aurekaPublishGrid">
      <div className="aurekaPublishPanel">
        <h3>Buat draf terverifikasi</h3>
        <div className="aurekaPublishFields">
          <label>Domain publikasi
            <select value={domain} disabled={busy} onChange={e=>{const next=e.target.value as Domain;setDomain(next);setPeriod(next==='inm'?currentPeriod():currentPeriod().slice(0,4));setPreview(null)}}>
              <option value="inm">Indikator Nasional Mutu</option><option value="safety">Keselamatan Pasien</option><option value="risk">Manajemen Risiko</option>
            </select>
          </label>
          <label>Periode laporan
            <input type="text" value={period} maxLength={7} disabled={busy} onChange={e=>{setPeriod(e.target.value);setPreview(null)}} placeholder={domain==='inm'?'2026-11':'2026'}/>
          </label>
        </div>
        <button type="button" className="aurekaPublishPrimary" disabled={busy} onClick={()=>void generate()}>{busy?'Memproses…':'Ambil data dari modul sumber'}</button>
        {currentPreview&&<div className="aurekaPublishHistory"><article><strong>Pratinjau · {currentPreview.period}</strong><p>Angka tidak dapat diedit. Data yang tidak memenuhi kelengkapan dan privasi tidak ditampilkan.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(currentPreview.payload,null,2)}</pre></article></div>}
        <p className="aurekaPublishNote">Informasi tidak boleh memuat nama pasien, petugas, lokasi sensitif, kronologi kasus, atau sumber identifikasi personal. Pembuat draf tidak dapat menyetujui drafnya sendiri.</p>
        <button type="button" className="aurekaPublishPrimary" disabled={busy||!currentPreview} onClick={()=>void stage()}>{busy?'Memproses…':'Ajukan draf untuk persetujuan'}</button>
      </div>
      <div className="aurekaPublishPanel">
        <div className="aurekaPublishReviewTitle"><h3>Register publikasi</h3><button type="button" className="aurekaPublishGhost" disabled={busy} onClick={()=>void refresh().catch(()=>setError('Register belum dapat diperbarui.'))}>Muat ulang</button></div>
        {loading?<p>Memuat register publikasi…</p>:snapshots.length===0?<p className="aurekaPublishNote">Belum ada snapshot terdaftar. Data publik tetap kosong sampai ada persetujuan.</p>:
          <div className="aurekaPublishHistory">
            {snapshots.map(item=><article key={item.id}>
              <div className="aurekaPublishHistoryHeader"><strong>{TYPES[item.domain]} · {item.period}</strong><PublicationState status={item.status}/></div>
              <p>{item.status==='draft'?'Diajukan':'Dibuat'} {dateLabel(item.created_at)} · {Object.values(item.payload).reduce<number>((n,v)=>n+(Array.isArray(v)?v.length:0),0)} kelompok data</p>
              <details><summary>Tinjau data dan sumber</summary><pre>{JSON.stringify(item.payload,null,2)}</pre></details>
              <div className="aurekaPublishHistoryActions">
                {item.status==='draft'&&canApprove&&item.created_by!==userId&&<button className="aurekaPublishPrimary" type="button" disabled={busy} onClick={()=>void decide(item,'approve')}>Setujui dan terbitkan</button>}
                {item.status==='draft'&&item.created_by===userId&&<span className="aurekaPublishNote">Menunggu penyetuju berbeda</span>}
                {item.status==='published'&&canApprove&&<button className="aurekaPublishGhost" type="button" disabled={busy} onClick={()=>void decide(item,'withdraw')}>Tarik publikasi</button>}
              </div>
            </article>)}
          </div>}
      </div>
    </div>
  </section>
}
