'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'

const sb=createClient('https://ktukmjscopggkzrkgnzp.supabase.co','sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
const q=()=>sb.schema('aureka_quality')
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const CONTAINERS=['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian','Audit OPPE'] as const
const STATUS=['Semua','Aktif','Draft','Ready for Review','Validated']
const YEARS=[2025,2026,2027,2028,2029]
const LOCAL_KEY='aureka-quality-episode-cache-v3',AUDIT_KEY='aureka-quality-audit-v3'

type Room={id:number;name:string};type Profile=Record<string,any>;type Resp={answer?:string;occurrence?:string;time?:string;start?:string;end?:string;minutes?:number|null;value?:number|null;evidence?:string;reference?:string;notes?:string;code?:number|null};type Patient=Record<string,any>;type Audit=Record<string,any>

const CSS=`
.aq{display:grid;gap:14px}.aq .glass{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.54),rgba(255,255,255,.22));border:1px solid rgba(255,255,255,.72);border-radius:26px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.78);backdrop-filter:blur(24px) saturate(165%);-webkit-backdrop-filter:blur(24px) saturate(165%)}.aqHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px}.aqHead h3{margin:5px 0;font-size:29px;letter-spacing:-.055em}.aqHead p{margin:0;max-width:760px;color:var(--muted);font-size:12px;line-height:1.55}.aqActions{display:flex;gap:8px;flex-wrap:wrap}.aqBtn{min-height:42px;border:1px solid rgba(255,255,255,.78);background:rgba(255,255,255,.44);color:#264237;border-radius:13px;padding:10px 13px;font-size:11px;font-weight:900}.aqBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}.aqTabs{padding:6px;display:flex;gap:7px;flex-wrap:wrap}.aqTab{border:1px solid rgba(255,255,255,.68);background:rgba(255,255,255,.28);color:#52625b;padding:10px 14px;border-radius:14px;font-size:11px;font-weight:850;min-height:42px}.aqTab.active{background:linear-gradient(135deg,rgba(255,255,255,.76),rgba(var(--accent-rgb),.13));color:var(--accent2)}.aqFilters{padding:17px 18px}.aqGrid{display:grid;grid-template-columns:1fr .55fr .75fr 1.8fr;gap:10px}.aqField span,.aqLabel{display:block;font-size:10px;color:#6f7d75;font-weight:900;text-transform:uppercase;letter-spacing:.055em;margin:0 0 6px 2px}.aqField input,.aqField select,.aqField textarea,.aqCat input,.aqCat select{width:100%;border:1px solid rgba(35,63,50,.12);border-radius:14px;background:rgba(255,255,255,.56);padding:11px 13px;font-size:13px;color:var(--ink);outline:none;min-height:46px}.aqField textarea{min-height:88px;resize:vertical}.aqMonths{display:grid;grid-template-columns:repeat(13,minmax(70px,1fr));gap:7px;overflow:auto;margin-top:6px}.aqMonths button{border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.34);border-radius:13px;padding:10px 8px;color:#506059;font-weight:850;font-size:11px;white-space:nowrap}.aqMonths .active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}.aqKpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.aqKpi .glass{padding:16px 17px}.aqKpi span{font-size:10px;color:#6c7a73;font-weight:900;text-transform:uppercase}.aqKpi strong{display:block;font-size:27px;margin-top:5px}.aqKpi small{color:var(--muted);font-size:10px}.aqTable{overflow:hidden}.aqTableHead{display:flex;justify-content:space-between;align-items:flex-end;gap:15px;padding:16px 18px;border-bottom:1px solid var(--line)}.aqTableHead h4{margin:0;font-size:18px}.aqTableHead p{margin:4px 0 0;color:var(--muted);font-size:11px}.aqMeta{display:flex;gap:7px;flex-wrap:wrap}.aqPill{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.66);font-size:10px;font-weight:850}.aqPill.green{background:var(--accent-soft);color:var(--accent2);border:0}.aqNotice{padding:10px 17px;background:#fff8e7;color:#7b5d25;font-size:11px}.aqWrap{overflow:auto;max-height:calc(100vh - 455px)}table.aqData{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0;font-size:12px}table.aqData th,table.aqData td{padding:12px 11px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}table.aqData th{position:sticky;top:0;background:rgba(249,252,250,.94);font-size:9px;color:#748078;text-transform:uppercase;z-index:3}table.aqData tbody tr{cursor:pointer}.aqName{font-weight:900;color:var(--accent2)}.aqSub{font-size:10px;color:var(--muted)}.aqStatus{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:900;background:#eef1ef}.aqStatus.aktif{background:#e8f7ef;color:#216b49}.aqStatus.ready-for-review{background:#edf2ff;color:#4c5f98}.aqStatus.validated{background:var(--accent-soft);color:var(--accent2)}.aqLos,.aqFilled{font-weight:900;color:var(--accent2)}.aqEmpty{min-height:120px;display:grid;place-items:center;color:var(--muted);font-size:11px}.aqBack{position:fixed;inset:0;z-index:100;background:rgba(11,22,17,.24);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}.aqDrawer{height:100%;width:min(950px,96vw);background:rgba(248,251,249,.98);box-shadow:-24px 0 65px rgba(0,0,0,.18);display:flex;flex-direction:column}.aqWide{width:min(1180px,97vw)}.aqDHead{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:20px}.aqDHead h4{font-size:24px;margin:4px 0}.aqDHead p{margin:0;color:var(--muted);font-size:11px}.aqClose{width:38px;height:38px;border:0;background:#eceeed;border-radius:12px;font-size:22px}.aqBody{padding:18px 22px;overflow:auto;min-height:0;flex:1}.aqEpisode{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.aqDerived{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:13px 0}.aqDerived div{padding:11px 13px;background:#fff;border:1px solid var(--line);border-radius:14px}.aqDerived span{font-size:9px;color:var(--muted)}.aqDerived strong{display:block;margin-top:4px;font-size:13px}.aqGuard{padding:11px 13px;border-radius:14px;background:#e9f7ef;color:#1e6c43;font-size:11px;line-height:1.5}.aqSection{display:flex;justify-content:space-between;align-items:end;margin:15px 0 8px}.aqSection h5{margin:0;font-size:17px}.aqSection span{font-size:10px;color:var(--muted)}.aqInd{background:#fff;border:1px solid var(--line);border-radius:17px;margin:11px 0;overflow:hidden}.aqInd.hit{border-color:rgba(var(--accent-rgb),.3)}.aqIHead{padding:14px 15px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px}.aqIHead strong{font-size:13px;line-height:1.42}.aqMetaText{font-size:9px;color:var(--muted);margin-top:4px}.aqMatch{font-size:9px;background:var(--accent-soft);color:var(--accent2);padding:5px 7px;border-radius:999px;font-weight:900;white-space:nowrap}.aqIBody{padding:15px}.aqQ{font-size:16px;font-weight:900;line-height:1.42;margin-bottom:9px}.aqTwo{display:grid;grid-template-columns:1fr 1fr;gap:10px}.aqAuto{padding:11px 13px;background:#eef8f4;border:1px solid #dcefe7;border-radius:13px}.aqAuto span,.aqAuto small{display:block;font-size:9px;color:var(--muted)}.aqAuto strong{display:block;font-size:18px;color:var(--accent2)}.aqRadio{display:flex;gap:8px;flex-wrap:wrap}.aqRadio label{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dadc;background:#fff;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:800}.aqEvidence{border-top:1px dashed #d9dcda;margin-top:12px;padding-top:11px}.aqFoot{padding:13px 22px;border-top:1px solid var(--line);background:rgba(255,255,255,.82);display:flex;justify-content:space-between;align-items:center;gap:10px}.aqCat{padding:18px 22px;overflow:auto}.aqCatFilters{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;gap:9px;margin-bottom:12px}.aqCatWrap{overflow:auto;max-height:calc(100vh - 220px)}table.aqCatalog{width:100%;min-width:1100px;border-collapse:separate;border-spacing:0}table.aqCatalog th,table.aqCatalog td{font-size:10px;padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}table.aqCatalog th{font-size:8px;color:#748078;position:sticky;top:0;background:#f8fbf9}table.aqCatalog td:nth-child(3){white-space:normal;min-width:390px}@media(max-width:1180px){.aqGrid{grid-template-columns:1fr 1fr 1fr}.aqGrid label:last-child{grid-column:1/-1}.aqEpisode{grid-template-columns:1fr 1fr}.aqCatFilters{grid-template-columns:1fr 1fr}.aqMonths{grid-template-columns:repeat(13,86px)}}@media(max-width:850px){.aqHead{display:block}.aqActions{margin-top:12px}.aqGrid{grid-template-columns:1fr 1fr}.aqKpi{grid-template-columns:1fr}.aqWrap{max-height:calc(100vh - 520px)}.aqDrawer,.aqWide{width:100%}.aqDerived{grid-template-columns:1fr}.aqTwo{grid-template-columns:1fr}.aqEpisode{grid-template-columns:1fr 1fr}.aqFoot{display:block}.aqCatFilters{grid-template-columns:1fr 1fr}}@media(max-width:560px){.aqGrid{grid-template-columns:1fr}.aqGrid label:last-child{grid-column:auto}.aqEpisode{grid-template-columns:1fr}.aqIHead{display:block}.aqMatch{display:inline-flex;margin-top:7px}.aqCatFilters{grid-template-columns:1fr}.aqMeta{margin-top:8px}}
`
function localRead<T>(k:string,f:T):T{if(typeof window==='undefined')return f;try{const r=window.localStorage.getItem(k);return r?JSON.parse(r):f}catch{return f}}
function localWrite(k:string,v:unknown){try{window.localStorage.setItem(k,JSON.stringify(v))}catch{}}
function ymd(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getFullYear()}
function mon(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getMonth()+1}
function fmt(v:string){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
function los(a:string,b:string){if(!a)return 0;const x=new Date(a).getTime(),y=(b?new Date(b):new Date()).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.max(1,Math.ceil((y-x)/86400000)):0}
function tm(v:string){if(!/^\d\d:\d\d$/.test(v))return null;const[a,b]=v.split(':').map(Number);return a<24&&b<60?a*60+b:null}
function diff(a:string,b:string){const x=tm(a),y=tm(b);return x==null||y==null?null:y>=x?y-x:y+1440-x}
function hit(p:Profile,dx:string){const h=`${p.indicator_type} ${p.title}`.toLowerCase(),d=dx.toLowerCase();if(!h.includes('audit medis'))return false;const rules=[[/stroke|iskemik/,/stroke/],[/stemi|infark/,/stemi|killip|ekg/],[/tuberkulosis|tbc/,/tuberkulosis|sitb|oat/],[/sirosis/,/sirosis|varises/],[/ginjal|ckd|gagal ginjal/,/ginjal|dialisis|kt\/v/],[/diabetes|dm /,/diabetes|pedis|ankle|kaki/],[/carcinoma|kanker|mammae/,/mammae|mastektomi|imunohistokimia|tnm/],[/asfiksia|neonatus/,/asfiksia|apgar|vtp/],[/sectio|seksio|persalinan/,/sectio|menyusui|hemostasis/]];return rules.some(([a,b])=>(a as RegExp).test(d)&&(b as RegExp).test(h))}
function kind(p:Profile){const h=String(p.title).toLowerCase();if(h.includes('jam visite dokter spesialis'))return'visit';if(h.includes('door-to-decision'))return'door';if(h.includes('response time')||h.includes('waktu tanggap'))return'minutes';if(h.includes('kt/v'))return'numeric';if(/kejadian |angka kematian|overcrowding|unplanned|kekosongan |dead stock|limfedema/.test(h))return'occurrence';return'compliance'}
function filled(r:Resp|undefined){return!!r&&(!!r.answer||!!r.occurrence||!!r.time||!!r.start||!!r.end||r.minutes!=null||r.value!=null)}
function empty(p:Profile):Resp{const k=kind(p);return k==='occurrence'?{occurrence:''}:k==='numeric'?{value:null}:k==='minutes'?{minutes:null}:k==='door'?{start:'',end:'',minutes:null}:k==='visit'?{time:'',answer:''}:{answer:''}}

export default function QualityIndicatorWorkspace({initialRoomId,rooms,isAdmin}:{initialRoomId:number|null;rooms:Room[];isAdmin:boolean}){
 const [container,setContainer]=useState<(typeof CONTAINERS)[number]>(CONTAINERS[0])
 const [year,setYear]=useState(2026)
 const [roomId,setRoomId]=useState<number|null>(initialRoomId??(isAdmin?null:rooms[0]?.id??null))
 const [monthFilter,setMonthFilter]=useState(0)
 const [status,setStatus]=useState('Semua')
 const [search,setSearch]=useState('')
 const [profiles,setProfiles]=useState<Profile[]>([])
 const [patients,setPatients]=useState<Patient[]>([])
 const [selected,setSelected]=useState<Patient|null>(null)
 const [draft,setDraft]=useState<Record<string,Resp>>({})
 const [message,setMessage]=useState('')
 const [busy,setBusy]=useState(false)
 const [source,setSource]=useState('Memuat…')
 const [catalogOpen,setCatalogOpen]=useState(false)
 const [auditOpen,setAuditOpen]=useState(false)
 const [patientOpen,setPatientOpen]=useState(false)
 const [catSearch,setCatSearch]=useState('')
 const [catUnit,setCatUnit]=useState('Semua unit')
 const [catGrain,setCatGrain]=useState('patient_episode')
 const [auditRows,setAuditRows]=useState<Audit[]>([])

 const roomMap=useMemo(()=>new Map(rooms.map(r=>[Number(r.id),r.name])),[rooms])
 const patientProfiles=useMemo(()=>profiles.filter(p=>p.measurement_grain==='patient_episode'),[profiles])

 const load=useCallback(async()=>{
   setBusy(true)
   setMessage('')
   setAuditRows(localRead<Audit[]>(AUDIT_KEY,[]))
   const local=localRead<Patient[]>(LOCAL_KEY,[]).filter(p=>ymd(p.admit)===year)
   try{
     let pq=q().from('indicator_profiles').select('*').eq('profile_year',year).eq('status','published').eq('is_active',true).order('code')
     if(roomId!=null) pq=pq.eq('room_id',roomId)
     const {data:pd,error:pe}=await pq
     if(pe) throw pe
     setProfiles(pd??[])
     const rows:any[]=[]
     let from=0
     while(true){
       let rq=q().from('quality_records').select('*').eq('profile_year',year).eq('measurement_grain','patient_episode').order('created_at',{ascending:false}).range(from,from+499)
       if(roomId!=null) rq=rq.eq('room_id',roomId)
       const {data,error}=await rq
       if(error) throw error
       rows.push(...(data??[]))
       if((data??[]).length<500) break
       from+=500
     }
     const db=rows.filter(r=>r.status!=='archived').map((r:any)=>{
       const c=r.core_data??r.subject_json??{}
       return {
         id:String(r.id),recordId:String(r.id),roomId:r.room_id??c.room_id??null,
         unit:String(c.unit_name??roomMap.get(Number(r.room_id))??''),name:String(c.patient_name??c.subject??''),
         rm:String(c.medical_record_no??c.rm??''),sex:String(c.sex??''),age:c.age==null||c.age===''?null:Number(c.age),
         admit:String(c.admission_at??c.admit??r.record_date??''),discharge:String(c.discharge_at??c.discharge??''),
         diagnosis:String(c.diagnosis??c.dx??''),dpjp:String(c.dpjp??''),status:String(c.status??(c.discharge_at?'Ready for Review':'Aktif')),
         indicatorValues:(c.indicator_values??{}),source:'database',updatedAt:String(r.updated_at??r.created_at??'')
       }
     })
     const merged=[...db,...local.filter(l=>!db.some(d=>d.rm===l.rm||d.id===l.id))]
     setPatients(merged)
     setSource('Supabase')
   }catch(e){
     const scoped=local.filter(p=>roomId==null||Number(p.roomId)===Number(roomId))
     setPatients(scoped)
     setProfiles([])
     setSource('Cache lokal')
     setMessage(`Backend belum dapat dimuat; workspace tetap berjalan dengan cache lokal. ${e instanceof Error?e.message:''}`.trim())
   }finally{setBusy(false)}
 },[roomId,roomMap,year])

 useEffect(()=>{void load()},[load])

 const filtered=useMemo(()=>patients.filter(p=>{
   const roomOk=roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId))
   const monthOk=!monthFilter||mon(p.admit)===monthFilter
   const statusOk=status==='Semua'||(status==='Aktif'?!p.discharge:p.status===status)
   const hay=`${p.name} ${p.rm} ${p.diagnosis} ${p.dpjp} ${p.unit}`.toLowerCase()
   return ymd(p.admit)===year&&roomOk&&monthOk&&statusOk&&hay.includes(search.toLowerCase().trim())
 }),[patients,year,roomId,roomMap,monthFilter,status,search])
 const yearPatients=useMemo(()=>patients.filter(p=>ymd(p.admit)===year&&(roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId)))),[patients,year,roomId,roomMap])
 const applicable=useMemo(()=>selected?patientProfiles.filter(p=>p.unit_name===selected.unit).sort((a,b)=>(hit(a,selected.diagnosis)?0:1)-(hit(b,selected.diagnosis)?0:1)||String(a.code).localeCompare(String(b.code),undefined,{numeric:true})):[],[selected,patientProfiles])
 const catalog=useMemo(()=>profiles.filter(p=>(catUnit==='Semua unit'||p.unit_name===catUnit)&&(!catGrain||p.measurement_grain===catGrain)&&`${p.code} ${p.title} ${p.unit_name}`.toLowerCase().includes(catSearch.toLowerCase().trim())),[profiles,catUnit,catGrain,catSearch])
 const filledN=useMemo(()=>applicable.filter(p=>filled(draft[p.id??p.code])).length,[applicable,draft])

 const openPatient=(p:Patient)=>{
   const r:any={}
   patientProfiles.filter(x=>x.unit_name===p.unit).forEach(x=>{r[x.id??x.code]=p.indicatorValues?.[x.code]??empty(x)})
   setSelected({...p})
   setDraft(r)
   setPatientOpen(true)
   setMessage('')
 }
 const newPatient=()=>{
   if(roomId==null){setMessage('Pilih unit terlebih dahulu sebelum membuat pasien baru.');return}
   const u=rooms.find(r=>Number(r.id)===Number(roomId))
   const now=new Date().toISOString().slice(0,16)
   setSelected({id:`LOCAL-${Date.now()}`,recordId:null,roomId,unit:u?.name??'',name:'',rm:'',sex:'',age:null,admit:now,discharge:'',diagnosis:'',dpjp:'',status:'Draft',indicatorValues:{},source:'local',updatedAt:null})
   setDraft({});setPatientOpen(true);setMessage('')
 }
 const setResp=(p:Profile,patch:Resp)=>{const k=String(p.id??p.code);setDraft(x=>({...x,[k]:{...(x[k]??empty(p)),...patch}}))}
 const audit=(x:Audit)=>{const a=[x,...localRead<Audit[]>(AUDIT_KEY,[])].slice(0,500);localWrite(AUDIT_KEY,a);setAuditRows(a)}

 const save=async()=>{
   if(!selected)return
   if(!selected.name.trim()||!selected.rm.trim()||!selected.admit||!selected.diagnosis.trim()||!selected.dpjp.trim()){setMessage('Nama pasien, No. RM, tanggal masuk, diagnosis, dan DPJP wajib diisi.');return}
   const values:any={}
   applicable.forEach(p=>{const r=draft[p.id??p.code];if(r)values[p.code]=r})
   const complete=applicable.length>0&&applicable.every(p=>filled(draft[p.id??p.code]))
   const finalStatus=selected.discharge?(complete?'Ready for Review':'Draft'):(complete?'Ready for Review':'Aktif')
   const now=new Date().toISOString()
   const core={patient_name:selected.name.trim(),medical_record_no:selected.rm.trim(),sex:selected.sex,age:selected.age,admission_at:selected.admit,discharge_at:selected.discharge,diagnosis:selected.diagnosis.trim(),dpjp:selected.dpjp.trim(),unit_name:selected.unit,room_id:selected.roomId,status:finalStatus,indicator_values:values,los_days:los(selected.admit,selected.discharge)}
   setBusy(true)
   let recordId=selected.recordId,backend=false,warning=''
   try{
     const {data:{user}}=await sb.auth.getUser()
     if(!user) throw new Error('Sesi login tidak ditemukan.')
     const payload={room_id:selected.roomId,profile_year:year,measurement_grain:'patient_episode',record_date:selected.admit||null,subject_key:selected.rm.trim(),subject_json:core,core_data:core,status:'ready',review_required:!complete,entered_by:user.id}
     if(recordId){const {error}=await q().from('quality_records').update(payload).eq('id',recordId);if(error)throw error}
     else{const {data,error}=await q().from('quality_records').insert(payload).select('*').single();if(error)throw error;recordId=String(data.id)}
     await q().from('quality_record_responses').delete().eq('record_id',recordId)
     const obs=applicable.map(p=>{const r=values[p.code];if(!r||!p.id)return null;return{record_id:recordId,indicator_id:p.id,response_label:r.answer??r.occurrence??null,response_code:r.code??null,raw_value:r,other_text:r.evidence??r.notes??null,review_status:r.answer==='Exception'?'pending':'not_required'}}).filter(Boolean)
     if(obs.length){const {error}=await q().from('quality_record_responses').insert(obs);if(error)warning=`Episode tersimpan, tetapi detail respons belum tersalin ke ledger respons: ${error.message}`}
     backend=true
   }catch(e){
     const cached:Patient={...selected,recordId:recordId??null,status:finalStatus,updatedAt:now,indicatorValues:values,source:'local'}
     localWrite(LOCAL_KEY,[cached,...localRead<Patient[]>(LOCAL_KEY,[]).filter(x=>x.id!==selected.id&&x.rm!==selected.rm)].slice(0,5000))
     setSource('Cache lokal')
     warning=`Episode tersimpan di cache lokal karena backend belum menerima perubahan. ${e instanceof Error?e.message:''}`.trim()
   }
   const saved:Patient={...selected,recordId:recordId??null,status:finalStatus,updatedAt:now,indicatorValues:values,source:backend?'database':'local'}
   setPatients(p=>[saved,...p.filter(x=>x.id!==selected.id&&x.rm!==saved.rm)])
   audit({at:now,actor:'PIC / Pengguna Aktif',unit:selected.unit,patient:selected.name,indicator:`${Object.keys(values).length}/${applicable.length} indikator`,action:selected.recordId?'Ubah':'Isi',change:`Episode ${finalStatus}`})
   setSelected(saved);setPatientOpen(false);setMessage(warning||'Episode pasien tersimpan dan siap dilanjutkan.');setBusy(false)
 }

 const indicatorEditor=(p:Profile)=>{
   const k=String(p.id??p.code),r=draft[k]??empty(p),kindNow=kind(p),isHit=hit(p,selected?.diagnosis??'')
   const commonEvidence=<details className="aqEvidence"><summary>Bukti & catatan audit</summary><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Sumber bukti</span><input value={r.evidence??''} onChange={(e:any)=>setResp(p,{evidence:e.target.value})} placeholder="RME / RM / hasil observasi…"/></label><label className="aqField"><span>Referensi / lokasi data</span><input value={r.reference??''} onChange={(e:any)=>setResp(p,{reference:e.target.value})} placeholder="No. dokumen / waktu / lokasi…"/></label></div><label className="aqField" style={{marginTop:10}}><span>Catatan</span><textarea value={r.notes??''} onChange={(e:any)=>setResp(p,{notes:e.target.value})} placeholder="Catatan audit bila diperlukan…"/></label></details>
   return <article className={`aqInd ${isHit?'hit':''}`} key={k}><div className="aqIHead"><div><strong>{p.code} · {p.title}</strong><div className="aqMetaText">{p.unit_name} · Target {p.target_text||'—'} · {p.measurement_grain}</div></div>{isHit&&<span className="aqMatch">Relevan dengan diagnosis</span>}</div><div className="aqIBody"><div className="aqQ">{kindNow==='visit'?'Apakah pasien ini divisite dokter spesialis pada pukul 06.00–14.00?':kindNow==='door'?'Apakah keputusan medis definitif diperoleh dalam ≤ 2 jam sejak pasien tiba?':kindNow==='minutes'?'Apakah waktu tanggap berada dalam batas target indikator?':kindNow==='numeric'?'Nilai numerik indikator pada episode pasien:':kindNow==='occurrence'?'Apakah kejadian indikator terjadi pada episode pasien?':'Apakah indikator mutu ini dipenuhi pada pasien tersebut?'}</div>
     {kindNow==='visit'&&<><div className="aqRadio"><label><input type="radio" checked={r.answer==='Ya'} onChange={()=>setResp(p,{answer:'Ya',code:1})}/> Ya, divisite 06.00–14.00</label><label><input type="radio" checked={r.answer==='Tidak'} onChange={()=>setResp(p,{answer:'Tidak',code:3})}/> Tidak</label></div><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Waktu visite aktual</span><input type="time" value={r.time??''} onChange={(e:any)=>setResp(p,{time:e.target.value})}/></label><div className="aqAuto"><span>Hasil otomatis</span><strong>{r.time?(() => {const m=tm(r.time);return m!=null&&m>=360&&m<=840?'Memenuhi':'Tidak memenuhi'})():'Belum dihitung'}</strong><small>06.00–14.00</small></div></div></>}
     {kindNow==='door'&&<><div className="aqTwo"><label className="aqField"><span>Waktu pasien tiba</span><input type="time" value={r.start??''} onChange={(e:any)=>setResp(p,{start:e.target.value})}/></label><label className="aqField"><span>Waktu keputusan medis</span><input type="time" value={r.end??''} onChange={(e:any)=>setResp(p,{end:e.target.value})}/></label></div><div className="aqAuto" style={{marginTop:10}}><span>Durasi otomatis</span><strong>{r.start&&r.end&&diff(r.start,r.end)!=null?`${diff(r.start,r.end)} menit`:'Belum dihitung'}</strong><small>Target ≤ 120 menit</small></div></>}
     {kindNow==='minutes'&&<div className="aqTwo"><label className="aqField"><span>Waktu aktual (menit)</span><input type="number" min="0" value={r.minutes??''} onChange={(e:any)=>setResp(p,{minutes:e.target.value===''?null:Number(e.target.value)})}/></label><div className="aqAuto"><span>Interpretasi</span><strong>{r.minutes==null?'Belum diisi':r.minutes<=30?'Memenuhi':'Tidak memenuhi'}</strong></div></div>}
     {kindNow==='numeric'&&<label className="aqField"><span>Nilai indikator</span><input type="number" step="0.01" value={r.value??''} onChange={(e:any)=>setResp(p,{value:e.target.value===''?null:Number(e.target.value)})}/></label>}
     {kindNow==='occurrence'&&<div className="aqRadio"><label><input type="radio" checked={r.occurrence==='Tidak terjadi'} onChange={()=>setResp(p,{occurrence:'Tidak terjadi',code:1})}/> Tidak terjadi</label><label><input type="radio" checked={r.occurrence==='Terjadi'} onChange={()=>setResp(p,{occurrence:'Terjadi',code:3})}/> Terjadi</label></div>}
     {kindNow==='compliance'&&<div className="aqRadio"><label><input type="radio" checked={r.answer==='Sesuai'} onChange={()=>setResp(p,{answer:'Sesuai',code:1})}/> Sesuai</label><label><input type="radio" checked={r.answer==='Exception'} onChange={()=>setResp(p,{answer:'Exception',code:2})}/> Justified Exception</label><label><input type="radio" checked={r.answer==='Tidak sesuai'} onChange={()=>setResp(p,{answer:'Tidak sesuai',code:3})}/> Tidak sesuai</label></div>}
     {(r.answer==='Tidak sesuai'||r.answer==='Exception'||r.occurrence==='Terjadi')&&commonEvidence}
     {r.answer!=='Tidak sesuai'&&r.answer!=='Exception'&&r.occurrence!=='Terjadi'&&<details className="aqEvidence"><summary>Bukti & catatan audit</summary><div style={{marginTop:10}}>{commonEvidence.props.children}</div></details>}
   </div></article>
 }

 return <div className="aq">
   <style dangerouslySetInnerHTML={{__html:CSS}}/>
   <section className="glass aqHead"><div><div className="eyebrow">AUREKA · INDIKATOR MUTU</div><h3>Audit Indikator Mutu</h3><p>Logbook master–detail. PIC mengisi fakta pasien; AUREKA menghitung agregat indikator dari episode pasien.</p></div><div className="aqActions"><button className="aqBtn" onClick={()=>setCatalogOpen(true)}>Master {profiles.length} Indikator</button><button className="aqBtn" onClick={()=>{setAuditRows(localRead<Audit[]>(AUDIT_KEY,[]));setAuditOpen(true)}}>Audit Trail</button><button className="aqBtn primary" onClick={newPatient}>＋ Pasien</button></div></section>
   <nav className="glass aqTabs">{CONTAINERS.map(x=><button key={x} className={`aqTab ${container===x?'active':''}`} onClick={()=>setContainer(x)}>{x}</button>)}</nav>
   {container!=='Audit Indikator Mutu'?<section className="glass aqBody" style={{minHeight:320,display:'grid',placeItems:'center',textAlign:'center'}}><div><div className="eyebrow">AUREKA · CONTAINER</div><h4 style={{fontSize:24,margin:'6px 0'}}>{container}</h4><p style={{maxWidth:720,color:'var(--muted)',fontSize:12,lineHeight:1.6}}>Container menggunakan shell AUREKA yang sama. Workspace pengumpulan data lanjutan mengikuti master indikator dan audit trail yang sama.</p></div></section>:<>
     <section className="glass aqFilters"><div className="aqGrid"><label className="aqField"><span>Unit</span><select value={roomId??''} disabled={!isAdmin} onChange={(e:any)=>setRoomId(e.target.value?Number(e.target.value):null)}>{isAdmin&&<option value="">Semua Unit</option>}{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="aqField"><span>Tahun</span><select value={year} onChange={(e:any)=>setYear(Number(e.target.value))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></label><label className="aqField"><span>Status</span><select value={status} onChange={(e:any)=>setStatus(e.target.value)}>{STATUS.map(s=><option key={s}>{s==='Aktif'?'Aktif (Belum Pulang)':s}</option>)}</select></label><label className="aqField"><span>Pencarian</span><input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Nama / No. RM / diagnosis / DPJP…"/></label></div><div style={{marginTop:12}}><div className="aqLabel">Bulan Pengamatan</div><div className="aqMonths"><button className={!monthFilter?'active':''} onClick={()=>setMonthFilter(0)}>Semua Bulan</button>{MONTHS.map((m,i)=><button key={m} className={monthFilter===i+1?'active':''} onClick={()=>setMonthFilter(i+1)}>{m}</button>)}</div></div></section>
     <section className="aqKpi"><div className="glass"><span>Total Pasien Dirawat</span><strong>{yearPatients.length}</strong><small>Akumulasi Januari–Desember {year}</small></div><div className="glass"><span>Total Pasien Aktif</span><strong>{yearPatients.filter(p=>!p.discharge).length}</strong><small>Belum memiliki tanggal pulang</small></div><div className="glass"><span>Total Pasien dengan Indikator Terisi</span><strong>{yearPatients.filter(p=>(Object.values(p.indicatorValues??{}) as Resp[]).some(filled)).length}</strong><small>Memiliki minimal satu respons indikator mutu</small></div></section>
     <section className="glass aqTable"><div className="aqTableHead"><div><h4>Logbook Pasien</h4><p>Klik nama pasien untuk membuka indikator mutu yang melekat pada episode pasien.</p></div><div className="aqMeta"><span className="aqPill green">{filtered.length} pasien</span><span className="aqPill">{patientProfiles.length} patient_episode</span><span className="aqPill green">{source}</span></div></div>{message&&<div className="aqNotice">{message}</div>}<div className="aqWrap"><table className="aqData"><thead><tr><th>No.</th><th>Pasien</th><th>No. RM</th><th>Masuk</th><th>Pulang</th><th>LOS</th><th>Diagnosis</th><th>DPJP</th><th>Indikator</th><th>Status</th></tr></thead><tbody>{filtered.map((p:any,i:number)=>{const inds=patientProfiles.filter(x=>x.unit_name===p.unit),total=inds.length,count=inds.filter(x=>filled(p.indicatorValues?.[x.code])).length;return <tr key={`${p.id}-${p.rm}`} tabIndex={0} onClick={()=>openPatient(p)} onKeyDown={(e:any)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPatient(p)}}}><td>{i+1}</td><td><div className="aqName">{p.name||'Tanpa nama'}</div><div className="aqSub">{p.sex||'—'} · {p.age??'—'} th · {p.unit}</div></td><td>{p.rm||'—'}</td><td>{fmt(p.admit)}</td><td>{fmt(p.discharge)}</td><td><span className="aqLos">{los(p.admit,p.discharge)} hari</span></td><td>{p.diagnosis||'—'}</td><td>{p.dpjp||'—'}</td><td><span className="aqFilled">{count}/{total}</span></td><td><span className={`aqStatus ${!p.discharge?'aktif':String(p.status).toLowerCase().replaceAll(' ','-')}`}>{!p.discharge?'Aktif':p.status}</span></td></tr>})}{!filtered.length&&<tr><td colSpan={10}><div className="aqEmpty">Tidak ada episode pasien pada filter ini.</div></td></tr>}</tbody></table></div></section>
   </>}

   {patientOpen&&selected&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget&&!busy)setPatientOpen(false)}}><section className="aqDrawer" role="dialog" aria-modal="true" aria-label={`Episode pasien ${selected.name||'baru'}`}><div className="aqDHead"><div><div className="eyebrow">PATIENT EPISODE · {selected.unit}</div><h4>{selected.name||'Episode Pasien Baru'}</h4><p>No. RM {selected.rm||'—'} · {selected.diagnosis||'Diagnosis belum diisi'}</p></div><button className="aqClose" onClick={()=>!busy&&setPatientOpen(false)}>×</button></div><div className="aqBody"><div className="aqEpisode"><label className="aqField"><span>Nama pasien</span><input value={selected.name} onChange={(e:any)=>setSelected(s=>s?{...s,name:e.target.value}:s)}/></label><label className="aqField"><span>No. RM</span><input value={selected.rm} onChange={(e:any)=>setSelected(s=>s?{...s,rm:e.target.value}:s)}/></label><label className="aqField"><span>Jenis kelamin</span><select value={selected.sex||''} onChange={(e:any)=>setSelected(s=>s?{...s,sex:e.target.value}:s)}><option value="">Pilih</option><option>Laki-laki</option><option>Perempuan</option></select></label><label className="aqField"><span>Usia (tahun)</span><input type="number" min="0" value={selected.age??''} onChange={(e:any)=>setSelected(s=>s?{...s,age:e.target.value===''?null:Number(e.target.value)}:s)}/></label><label className="aqField"><span>Masuk</span><input type="datetime-local" value={selected.admit?.slice(0,16)||''} onChange={(e:any)=>setSelected(s=>s?{...s,admit:e.target.value}:s)}/></label><label className="aqField"><span>Pulang</span><input type="datetime-local" value={selected.discharge?.slice(0,16)||''} onChange={(e:any)=>setSelected(s=>s?{...s,discharge:e.target.value}:s)}/></label><label className="aqField" style={{gridColumn:'1/-1'}}><span>Diagnosis</span><input value={selected.diagnosis} onChange={(e:any)=>setSelected(s=>s?{...s,diagnosis:e.target.value}:s)} placeholder="Diagnosis utama pasien…"/></label><label className="aqField" style={{gridColumn:'1/-1'}}><span>DPJP</span><input value={selected.dpjp} onChange={(e:any)=>setSelected(s=>s?{...s,dpjp:e.target.value}:s)} placeholder="Nama DPJP…"/></label></div><div className="aqDerived"><div><span>LOS otomatis</span><strong>{los(selected.admit,selected.discharge)} hari</strong></div><div><span>Status perawatan</span><strong>{selected.discharge?'Sudah pulang':'Masih dirawat'}</strong></div><div><span>Kelengkapan indikator</span><strong>{filledN}/{applicable.length} terisi</strong></div></div><div className="aqGuard">AUREKA hanya menampilkan indikator <b>patient_episode</b> yang terhubung dengan unit episode ini. Indikator Audit Klinis dan Kematian yang relevan dengan diagnosis diprioritaskan di bagian atas.</div><div className="aqSection"><h5>Indikator Mutu Melekat pada Pasien</h5><span>{filledN} dari {applicable.length} terisi</span></div>{applicable.length?applicable.map(indicatorEditor):<div className="aqEmpty">Belum ada profil indikator patient_episode aktif untuk unit episode ini.</div>}</div><div className="aqFoot"><span style={{fontSize:11,color:'var(--muted)'}}>{source} · perubahan tersimpan setelah menekan tombol simpan.</span><div style={{display:'flex',gap:8}}><button className="aqBtn" onClick={()=>!busy&&setPatientOpen(false)}>Batal</button><button className="aqBtn primary" onClick={save} disabled={busy}>{busy?'Menyimpan…':'Simpan Episode & Lanjut Review'}</button></div></div></section></div>}

   {catalogOpen&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget)setCatalogOpen(false)}}><section className="aqDrawer aqWide" role="dialog" aria-modal="true" aria-label="Master indikator mutu"><div className="aqDHead"><div><div className="eyebrow">MASTER AUREKA</div><h4>Seluruh Indikator Mutu</h4><p>Profil live dari Supabase · 37 unit · 188 indikator terkonfigurasi di master sumber.</p></div><button className="aqClose" onClick={()=>setCatalogOpen(false)}>×</button></div><div className="aqCat"><div className="aqCatFilters"><select value={catUnit} onChange={(e:any)=>setCatUnit(e.target.value)}><option>Semua unit</option>{rooms.map(r=><option key={r.id}>{r.name}</option>)}</select><select value={catGrain} onChange={(e:any)=>setCatGrain(e.target.value)}><option value="">Semua measurement grain</option><option value="patient_episode">patient_episode</option><option value="provider_day">provider_day</option><option value="daily_metric">daily_metric</option><option value="event">event</option><option value="activity">activity</option><option value="aggregate">aggregate</option></select><input value={catSearch} onChange={(e:any)=>setCatSearch(e.target.value)} placeholder="Cari kode / indikator / unit…"/><button className="aqBtn" onClick={()=>{setCatSearch('');setCatUnit('Semua unit');setCatGrain('')}}>Reset</button></div><div className="aqCatWrap"><table className="aqCatalog"><thead><tr><th>Kode</th><th>Unit</th><th>Indikator</th><th>Jenis</th><th>Grain</th><th>Target</th></tr></thead><tbody>{catalog.map(p=><tr key={p.id??p.code}><td>{p.code}</td><td>{p.unit_name}</td><td>{p.title}</td><td>{p.indicator_type}</td><td>{p.measurement_grain}</td><td>{p.target_text||'—'}</td></tr>)}{!catalog.length&&<tr><td colSpan={6}><div className="aqEmpty">Tidak ada indikator yang cocok.</div></td></tr>}</tbody></table></div></div></section></div>}

   {auditOpen&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget)setAuditOpen(false)}}><section className="aqDrawer aqWide" role="dialog" aria-modal="true" aria-label="Audit trail indikator mutu"><div className="aqDHead"><div><div className="eyebrow">AUDIT TRAIL</div><h4>Jejak Perubahan Data Mutu</h4><p>Riwayat perubahan yang dicatat oleh workspace ini.</p></div><button className="aqClose" onClick={()=>setAuditOpen(false)}>×</button></div><div className="aqCat"><div className="aqCatWrap"><table className="aqCatalog"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Unit</th><th>Pasien</th><th>Indikator</th><th>Aksi</th><th>Perubahan</th></tr></thead><tbody>{auditRows.map((a:any,i:number)=><tr key={`${a.at}-${i}`}><td>{a.at?new Date(a.at).toLocaleString('id-ID'):'—'}</td><td>{a.actor||'—'}</td><td>{a.unit||'—'}</td><td>{a.patient||'—'}</td><td>{a.indicator||'—'}</td><td>{a.action||'—'}</td><td>{a.change||'—'}</td></tr>)}{!auditRows.length&&<tr><td colSpan={7}><div className="aqEmpty">Belum ada catatan audit trail lokal.</div></td></tr>}</tbody></table></div></div></section></div>}
 </div>
}
