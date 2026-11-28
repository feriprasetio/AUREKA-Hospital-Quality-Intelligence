'use client'
import {useEffect,useRef,useState} from 'react'
import type {SupabaseClient} from '@supabase/supabase-js'
import {requestSensitiveAccess} from '@/lib/aureka/sensitive-access'
import {toUserFacingError} from '@/lib/ui/error-feedback'
import {CLINICAL_LINK_STATES,parseClinicalCostLinkage,type ClinicalCostLinkage} from '@/lib/aureka/clinical-cost-linkage'
const num=(x:number|null)=>x===null?'—':x.toLocaleString('id-ID',{maximumFractionDigits:2})
const rp=(x:number|null)=>x===null?'—':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(x)
export default function RealcostClinicalLinkagePanel({sb,importId,canRead}:{sb:SupabaseClient;importId:string;canRead:boolean}){
 const [data,setData]=useState<ClinicalCostLinkage|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const request=useRef<AbortController|null>(null)
 useEffect(()=>()=>request.current?.abort(),[])
 const load=async()=>{
  if(busy||!canRead)return
  const c=new AbortController();request.current=c;setBusy(true);setError('');setData(null)
  try{
   if(!(await requestSensitiveAccess('realcost_detail',importId,'Rekonsiliasi agregat Clinical Pathway dan Audit Realcost'))||c.signal.aborted)return
   const {data,error}=await sb.rpc('aureka_realcost_clinical_linkage',{p_import_id:importId}).abortSignal(c.signal)
   if(error)throw error
   if(!c.signal.aborted)setData(parseClinicalCostLinkage(data,importId))
  }catch(e){if(!c.signal.aborted)setError(toUserFacingError(e,{fallback:'Rekonsiliasi klinis dan biaya belum dapat dibaca sesuai kewenangan.'}))}
  finally{if(!c.signal.aborted)setBusy(false)}
 }
 return <section className="rmPanel" style={{padding:16,display:'grid',gap:12}}>
  <h3>Rekonsiliasi Clinical Pathway dan Realcost</h3>
  <p>Kandidat persis menggunakan No. RM ternormalisasi serta tanggal masuk dan keluar yang sama. Kunci ganda dipisahkan; tidak ada tautan episode atau identitas pasien yang ditulis otomatis.</p>
  {!canRead?<p role="status">Analisis ini memerlukan izin rincian biaya dan identitas pasien.</p>:<button type="button" className="rmButton primary" disabled={busy} onClick={()=>void load()}>{busy?'Menghitung…':data?'Hitung ulang':'Analisis keterkaitan episode'}</button>}
  {error&&<p role="alert" className="rmNotice error">{error}</p>}
  {data&&<>
   <div className="rmKpis"><div className="rmKpi"><span>Episode impor selesai</span><strong>{num(data.episodes)}</strong></div><div className="rmKpi"><span>Kandidat audit tervalidasi</span><strong>{num(data.states.find(s=>s.state==='unique_validated_candidate')?.count??0)}</strong></div></div>
   <h4>Cakupan dan kualitas rekonsiliasi</h4>
   {CLINICAL_LINK_STATES.map(([key,label])=>{const n=data.states.find(x=>x.state===key)?.count??0;return <div key={key} style={{display:'grid',gap:5}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><span>{label}</span><b>{num(n)}</b></div>{data.episodes>0&&<progress style={{width:'100%'}} max={data.episodes} value={n} aria-label={label}/>}</div>})}
   <h4>Kelompok kandidat audit tervalidasi menurut template, INA-CBG dan kelas</h4>
   {data.cohorts.length===0?<p>Belum ada kelompok berisi minimal lima kandidat audit tervalidasi.</p>:<div className="rmTableWrap"><table className="rmTable"><thead><tr><th>Template</th><th>INA-CBG / kelas</th><th>n</th><th>Rerata TARIF_RS</th><th>Rerata INA-CBG</th><th>Rerata selisih</th><th>Rerata LOS</th></tr></thead><tbody>{data.cohorts.map(c=><tr key={[c.template_code,c.inacbg_code,c.class_code].join('|')}><td>{c.template_code}</td><td>{c.inacbg_code} / {c.class_code}</td><td>{num(c.n)}</td><td>{rp(c.mean_tarif_rs)}<small className="rmCellSmall">n={c.tarif_n}</small></td><td>{rp(c.mean_tariff_inacbg)}<small className="rmCellSmall">n={c.ina_n}</small></td><td>{rp(c.mean_gap)}</td><td>{num(c.mean_los)} hari<small className="rmCellSmall">n={c.los_n}</small></td></tr>)}</tbody></table></div>}
   <p>Kelompok minimal n=5; maksimal 100 kelompok terbesar. Kandidat persis belum merupakan Episode ID terverifikasi. Audit tervalidasi tidak berarti pathway patuh. Tidak ditemukannya kandidat bukan bukti audit tidak pernah dilakukan. Selisih tarif bukan laba/rugi; perbandingan ini deskriptif tanpa penyesuaian case mix.</p>
  </>}
 </section>
}
