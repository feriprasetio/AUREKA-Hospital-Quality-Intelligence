'use client'
import { useEffect,useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { parseCarePattern,doctorsForCarePattern,type CarePattern } from '@/lib/aureka/care-pattern-engine'
import { toUserFacingError } from '@/lib/ui/error-feedback'
const dayNames=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']
const fmt=(x:number|null)=>x===null?'—':x.toLocaleString('id-ID')
function Distribution({rows,total}:{rows:{label:string;count:number}[];total:number}){
  return total>0?<div>{rows.map(r=><div className="pmaQualityRow" key={r.label}><span>{r.label}</span><b>{fmt(r.count)}</b><progress max={total} value={r.count} aria-label={r.label}/></div>)}</div>:<p className="prEmpty">Belum ada observasi yang dapat dianalisis.</p>
}
export default function PatientCarePatternPanel({room,year,mode}:{room:string;year:string;mode:'visite'|'pemulangan'}){
  const [ready,setReady]=useState(false)
  const [revision,setRevision]=useState(0)
  const request=JSON.stringify([room,year,ready,revision])
  const [state,setState]=useState<{request:string;data?:CarePattern;error?:string}|null>(null)
  const data=state?.request===request?state.data:undefined
  const error=state?.request===request?state.error:undefined
  const loading=state?.request!==request
  const doctors=data?doctorsForCarePattern(data,mode):[]
  useEffect(()=>{
    const controller=new AbortController()
    const scope={room:room?Number(room):null,year:Number(year),ready}
    void (async()=>{
      try{
        const {data,error}=await aurekaSupabase.rpc('aureka_care_pattern_summary',{p_room:scope.room,p_year:scope.year,p_include_ready:scope.ready}).abortSignal(controller.signal)
        if(error)throw error
        const parsed=parseCarePattern(data,scope)
        if(!controller.signal.aborted)setState({request,data:parsed})
      }catch(e){if(!controller.signal.aborted)setState({request,error:toUserFacingError(e,{fallback:'Pola perawatan belum tersedia. Periksa akses dan koneksi.'})})}
    })()
    return()=>controller.abort()
  },[request,room,year,ready])
  return <section style={{display:'grid',gap:12}}>
    <div className="prPanel prFilters">
      <label>Dataset<select value={ready?'ready':'validated'} onChange={e=>setReady(e.target.value==='ready')}><option value="validated">Tervalidasi</option><option value="ready">Pratinjau termasuk siap validasi</option></select></label>
      <button className="prButton" type="button" disabled={loading} onClick={()=>setRevision(v=>v+1)}>Muat ulang</button>
    </div>
    {ready&&<div className="pmaNote" role="status"><b>Pratinjau sementara.</b> Record siap validasi dapat berubah. Tidak digunakan sebagai hasil resmi OPPE atau publikasi.</div>}
    {loading&&<div className="prPanel prEmpty" role="status">Memuat agregat pola perawatan…</div>}
    {error&&<div className="prAlert" role="alert">{error}</div>}
    {data&&<>
      <div className="pmaKpis pmaKpis3">
        <article><span>Catatan episode dalam cakupan</span><strong>{fmt(data.records)}</strong><small>Termasuk siap validasi: {fmt(data.ready_records)}</small></article>
        {mode==='visite'?<>
          <article><span>Catatan dengan respons visite</span><strong>{fmt(data.visit_source_records)}</strong><small>Berdasarkan profil indikator visite</small></article>
          <article><span>Respons kategori dapat dianalisis</span><strong>{fmt(data.visit_classified)}</strong><small>Respons tidak ambigu dan telah diklasifikasi</small></article>
        </>:<>
          <article><span>Tanggal keluar valid</span><strong>{fmt(data.discharge_dated)}</strong><small>Dari {fmt(data.discharge_source_records)} catatan dengan data keluar</small></article>
          <article><span>Jam keluar dapat dianalisis</span><strong>{fmt(data.discharge_timed)}</strong><small>Tidak menebak waktu dari tanggal saja</small></article>
        </>}
      </div>
      {mode==='visite'?<div className="prPanel"><h3>Distribusi kategori visite</h3><p>Jam dalam rentang sumber bukan timestamp aktual. Kategori hari libur atau dokter pengganti tidak otomatis dianggap gagal.</p><Distribution rows={data.visit_categories} total={data.visit_classified}/></div>:<div className="pmaGrid"><section className="prPanel"><h3>Hari pemulangan</h3><Distribution total={data.discharge_dated} rows={data.discharge_days.map(r=>({label:dayNames[r.day-1],count:r.count}))}/></section><section className="prPanel"><h3>Jam keluar yang tercatat</h3><p>Waktu WIB; tanggal saja dan jam 00.00 yang berpotensi hasil normalisasi tidak dipakai.</p><Distribution total={data.discharge_timed} rows={data.discharge_hours.map(r=>({label:String(r.hour).padStart(2,'0')+'.00',count:r.count}))}/></section></div>}
      <section className="prPanel"><h3>Profil menurut DPJP</h3>
        {!data.named_allowed?<p className="prEmpty">Rincian per dokter memerlukan hak akses kinerja SDM.</p>:<>
          <p>{fmt(data.attributed_records)} catatan memiliki atribusi DPJP kanonik tunggal. Hanya kelompok dengan sekurang-kurangnya lima observasi relevan ditampilkan. Nama bebas pada logbook tidak digunakan untuk mencocokkan tenaga medis.</p>
          {doctors.length?<div className="prTableWrap"><table className="prTable"><thead><tr><th>DPJP</th>{mode==='visite'?<><th>Observasi visite</th><th>06.00–14.00</th><th>Setelah 14.00</th></>:<><th>Tanggal keluar</th><th>Jam keluar tercatat</th></>}</tr></thead><tbody>{doctors.map(d=><tr key={d.staff_id}><td>{d.name}</td>{mode==='visite'?<><td>{fmt(d.visite_n)}</td><td>{fmt(d.visit_regular)}</td><td>{fmt(d.visit_late)}</td></>:<><td>{fmt(d.discharge_n)}</td><td>{fmt(d.clock_n)}</td></>}</tr>)}</tbody></table></div>:<p className="prEmpty">Belum ada atribusi dokter yang memenuhi syarat.</p>}
        </>}
      </section>
      <div className="pmaNote">Unit analisis adalah record logbook, bukan pasien unik. Waktu keluar tercatat bukan waktu keputusan pulang. Distribusi ini bukan ranking dokter dan tidak membuktikan hubungan sebab akibat.</div>
    </>}
  </section>
}
