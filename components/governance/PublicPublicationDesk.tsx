'use client'

import { aurekaConfirm } from '@/components/ui/aurekaConfirm'
import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { NATIONAL_INDICATORS } from '@/lib/aureka/national-indicators'

type Domain = 'inm' | 'safety' | 'risk'
type Topic = 'classifications' | 'monthly' | 'actions' | 'levels' | 'controls'
type InmDraft = {
  code: string; title: string; actual: string; target: string; numerator: string
  denominator: string; source: string; unit: string; operator: string
}
type AggregateDraft = { label:string; count:string }
type Snapshot = {
  id:string; domain:Domain;period:string;status:string;created_at:string
  created_by:string;approved_by:string|null;published_at:string|null
  payload:Record<string,unknown>
}
const TYPES:Record<Domain,string>={inm:'Indikator Nasional Mutu',safety:'Keselamatan Pasien',risk:'Manajemen Risiko'}
const TOPICS:Record<Domain,readonly Topic[]>={inm:[],safety:['classifications','monthly','actions'],risk:['levels','controls','monthly']}
const TOPIC_TITLES:Record<Topic,string>={
  classifications:'Klasifikasi insiden',monthly:'Tren bulanan',actions:'Tindak lanjut',
  levels:'Tingkat risiko',controls:'Pengendalian risiko'
}
const originalRows=():InmDraft[]=>NATIONAL_INDICATORS.map(([code,title])=>({
  code,title,actual:'',target:'',numerator:'',denominator:'',source:'',unit:'%',operator:'>='
}))
const parseNumber=(value:string):number|null=>{
  const normalized=value.trim().replace(',','.')
  if(!normalized)return null
  const parsed=Number(normalized)
  return Number.isFinite(parsed)?parsed:null
}
const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}):'-'
function PublicationState({status}:{status:string}) {
  const labels:Record<string,string>={draft:'Menunggu tinjauan',published:'Tayang',superseded:'Digantikan',withdrawn:'Ditarik'}
  return <span className={'aurekaPublishState aurekaPublishState-'+status}>{labels[status]||status}</span>
}

export default function PublicPublicationDesk({role,userId}:{role:string|null;userId:string}){
  const [domain,setDomain]=useState<Domain>('inm')
  const [period,setPeriod]=useState('')
  const [rows,setRows]=useState<InmDraft[]>(originalRows)
  const [aggregates,setAggregates]=useState<Record<Topic,AggregateDraft[]>>({
    classifications:[{label:'',count:''}],monthly:[{label:'',count:''}],
    actions:[{label:'',count:''}],levels:[{label:'',count:''}],controls:[{label:'',count:''}]
  })
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
    setSnapshots(Array.isArray(data)?data as Snapshot[]:[])
  },[])
  useEffect(()=>{
    let mounted=true
    refresh().catch(()=>{if(mounted)setError('Register publikasi belum dapat dibaca.')})
      .finally(()=>{if(mounted)setLoading(false)})
    return()=>{mounted=false}
  },[refresh])
  const patchRow=(i:number,key:keyof InmDraft,value:string)=>setRows(previous=>previous.map((row,j)=>i===j?{...row,[key]:value}:row))
  const patchAggregate=(topic:Topic,i:number,key:keyof AggregateDraft,value:string)=>setAggregates(previous=>({
    ...previous,[topic]:previous[topic].map((row,j)=>i===j?{...row,[key]:value}:row)
  }))
  const addAggregate=(topic:Topic)=>setAggregates(prev=>({...prev,[topic]:[...prev[topic],{label:'',count:''}]}))
  const removeAggregate=(topic:Topic,i:number)=>setAggregates(prev=>({...prev,[topic]:prev[topic].filter((_,j)=>j!==i)}))

  const makePayload=():Record<string,unknown>=>{
    if(domain==='inm'){
      const indicators=rows.filter(row=>row.actual.trim()!==''||row.target.trim()!==''||row.numerator.trim()!==''||row.denominator.trim()!=='').map(row=>{
        const actual=parseNumber(row.actual),target=parseNumber(row.target)
        if(actual===null||target===null||row.source.trim().length<8)throw new Error('Setiap indikator yang dipublikasikan wajib memiliki capaian, target, dan sumber data yang dapat diaudit.')
        const numerator=parseNumber(row.numerator),denominator=parseNumber(row.denominator)
        if((row.numerator.trim()||row.denominator.trim())&&(numerator===null||denominator===null||denominator===0))
          throw new Error('Numerator/denominator harus lengkap dan denominator tidak boleh nol.')
        if(numerator!==null&&(numerator<0||denominator===null||denominator<0))
          throw new Error('Numerator/denominator harus positif dan konsisten.')
        const met=row.operator==='>='?actual>=target:row.operator==='>'?actual>target:row.operator==='<='?actual<=target:row.operator==='<'?actual<target:actual===target
        return {
          code:row.code,title:row.title,actual,target,unit:row.unit.slice(0,30),
          operator:row.operator,period,numerator,denominator,
          source:row.source.trim().slice(0,300),status:met?'Memenuhi target':'Belum memenuhi target'
        }
      })
      if(!indicators.length)throw new Error('Tidak ada indikator yang sudah dilengkapi. Draf kosong tidak diterbitkan.')
      return {indicators}
    }
    const result:Record<string,unknown>={}
    let count=0
    for(const topic of TOPICS[domain]){
      const valid:AggregateDraft[]=aggregates[topic].filter(row=>row.label.trim()||row.count.trim())
      result[topic]=valid.map(row=>{
        const value=parseNumber(row.count)
        if(!row.label.trim()||value===null||!Number.isInteger(value)||value<0)
          throw new Error('Setiap kelompok agregat harus memiliki nama dan jumlah bilangan bulat nonnegatif.')
        if(domain==='safety'&&value>0&&value<5)
          throw new Error('Jumlah insiden antara 1 dan 4 tidak boleh diterbitkan. Gabungkan kategori atau hilangkan kelompok tersebut.')
        if(row.label.length>70)throw new Error('Label kategori terlalu panjang.')
        count++
        return {label:row.label.trim(),count:value}
      })
    }
    if(!count)throw new Error('Minimal satu agregat harus tersedia untuk membuat draf.')
    return result
  }

  const stage=async()=>{
    if(!canStage||busy)return
    setNotice('');setError('')
    if(period.trim().length<4||period.trim().length>64){setError('Isi periode pelaporan, misalnya 2026-11 atau Tahun 2026.');return}
    let payload:Record<string,unknown>
    try{payload=makePayload()}catch(e){setError(e instanceof Error?e.message:'Data belum memenuhi syarat.');return}
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
      const {error}=await aurekaSupabase.rpc(name,{p_snapshot_id:item.id})
      if(error)throw error
      await refresh()
      setNotice(action==='approve'?'Snapshot berhasil dipublikasikan.':'Snapshot berhasil ditarik dari portal.')
    }catch(e){setError(e instanceof Error?e.message:'Tindakan belum berhasil.')}
    finally{setBusy(false)}
  }
  if(!canStage)return null
  return <section className="aurekaPublishDesk" aria-label="Konsol publikasi publik">
    <div className="aurekaPublishIntro">

      <h2>Public Publication Desk</h2>
      <p>Susun dan setujui data yang layak tayang untuk masyarakat. Angka harus ditranskripsikan dari hasil yang sudah tervalidasi; draf tidak otomatis menjadi publik.</p>
    </div>
    {!!error&&<p className="aurekaPublishAlert aurekaPublishError" role="alert">{error}</p>}
    {!!notice&&<p className="aurekaPublishAlert" role="status">{notice}</p>}
    <div className="aurekaPublishGrid">
      <div className="aurekaPublishPanel">
        <h3>Buat draf terverifikasi</h3>
        <div className="aurekaPublishFields">
          <label>Domain publikasi
            <select value={domain} onChange={e=>setDomain(e.target.value as Domain)}>
              <option value="inm">Indikator Nasional Mutu</option><option value="safety">Keselamatan Pasien</option><option value="risk">Manajemen Risiko</option>
            </select>
          </label>
          <label>Periode laporan
            <input type="text" value={period} maxLength={64} onChange={e=>setPeriod(e.target.value)} placeholder="Contoh: 2026-11"/>
          </label>
        </div>
        {domain==='inm'?<div className="aurekaPublishMetricList">
          {rows.map((row,i)=><details key={row.code} className="aurekaPublishMetric">
            <summary><b>{String(i+1).padStart(2,'0')}. {row.title}</b><span>{row.actual?'Capaian '+row.actual:'Belum diisi'}</span></summary>
            <div className="aurekaPublishFields">
              <label>Capaian aktual<input inputMode="decimal" value={row.actual} onChange={e=>patchRow(i,'actual',e.target.value)} placeholder="Tidak boleh perkiraan"/></label>
              <label>Target<input inputMode="decimal" value={row.target} onChange={e=>patchRow(i,'target',e.target.value)} placeholder="Sesuai versi profil"/></label>
              <label>Satuan<input value={row.unit} onChange={e=>patchRow(i,'unit',e.target.value)} maxLength={30}/></label>
              <label>Operator<select value={row.operator} onChange={e=>patchRow(i,'operator',e.target.value)}>
                <option value=">=">≥</option><option value=">">{">"}</option><option value="<=">≤</option><option value="<">{"<"}</option><option value="=">=</option>
              </select></label>
              <label>Numerator (opsional)<input inputMode="decimal" value={row.numerator} onChange={e=>patchRow(i,'numerator',e.target.value)}/></label>
              <label>Denominator (opsional)<input inputMode="decimal" value={row.denominator} onChange={e=>patchRow(i,'denominator',e.target.value)}/></label>
              <label className="aurekaPublishFull">Sumber data resmi dan periode validasi<input value={row.source} onChange={e=>patchRow(i,'source',e.target.value)} placeholder="Referensi validasi dan versi profil, minimal 8 karakter"/></label>
            </div>
          </details>)}
        </div>:<div className="aurekaPublishAggregates">{TOPICS[domain].map(topic=>
          <fieldset key={topic}><legend>{TOPIC_TITLES[topic]}</legend>
            {aggregates[topic].map((row,i)=><div className="aurekaPublishAggregate" key={i}>
              <input aria-label={'Kategori '+(i+1)} value={row.label} onChange={e=>patchAggregate(topic,i,'label',e.target.value)} placeholder={topic==='monthly'?'2026-11':'Nama kategori'} maxLength={70}/>
              <input aria-label={'Jumlah '+(i+1)} inputMode="numeric" value={row.count} onChange={e=>patchAggregate(topic,i,'count',e.target.value)} placeholder="Jumlah"/>
              <button type="button" className="aurekaPublishGhost" onClick={()=>removeAggregate(topic,i)} aria-label={'Hapus baris '+(i+1)}>Hapus</button>
            </div>)}
            <button type="button" className="aurekaPublishGhost" onClick={()=>addAggregate(topic)}>Tambah kategori</button>
          </fieldset>)}</div>}
        <p className="aurekaPublishNote">Informasi tidak boleh memuat nama pasien, petugas, lokasi sensitif, kronologi kasus, atau sumber identifikasi personal. Pembuat draf tidak dapat menyetujui drafnya sendiri.</p>
        <button type="button" className="aurekaPublishPrimary" disabled={busy} onClick={()=>void stage()}>{busy?'Memproses…':'Ajukan draf untuk persetujuan'}</button>
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
