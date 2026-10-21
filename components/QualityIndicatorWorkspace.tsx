'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'
import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'

const sb=aurekaSupabase
const q=()=>sb.schema('aureka_quality')
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const CONTAINERS=['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian','Audit OPPE'] as const
const STATUS=['Semua','Aktif','Draft','Ready for Review','Validated']
const YEARS=[2025,2026,2027,2028,2029]
const LOCAL_KEY='aureka-quality-episode-cache-v3',AUDIT_KEY='aureka-quality-audit-v3'

type Room={id:number;name:string};type Profile=Record<string,any>;type AuditLayout={roomId:number;fields:string[];indicators:string[];measurementGrain?:string;providerGroups?:{clinic:string;doctors:string[]}[]};type Resp={answer?:string;occurrence?:string;time?:string;start?:string;end?:string;minutes?:number|null;value?:number|null;numerator?:number|null;denominator?:number|null;evidence?:string;reference?:string;notes?:string;code?:number|null};type Patient=Record<string,any>;type Audit=Record<string,any>

const CSS=`
.aq{display:grid;gap:14px}.aq .glass{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.54),rgba(255,255,255,.22));border:1px solid rgba(255,255,255,.72);border-radius:26px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.78);backdrop-filter:blur(24px) saturate(165%);-webkit-backdrop-filter:blur(24px) saturate(165%)}.aqHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px}.aqHead h3{margin:5px 0;font-size:29px;letter-spacing:-.055em}.aqHead p{margin:0;max-width:760px;color:var(--muted);font-size:12px;line-height:1.55}.aqActions{display:flex;gap:8px;flex-wrap:wrap}.aqBtn{min-height:42px;border:1px solid rgba(255,255,255,.78);background:rgba(255,255,255,.44);color:#264237;border-radius:13px;padding:10px 13px;font-size:11px;font-weight:900}.aqBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}.aqTabs{padding:6px;display:flex;gap:7px;flex-wrap:wrap}.aqTab{border:1px solid rgba(255,255,255,.68);background:rgba(255,255,255,.28);color:#52625b;padding:10px 14px;border-radius:14px;font-size:11px;font-weight:850;min-height:42px}.aqTab.active{background:linear-gradient(135deg,rgba(255,255,255,.76),rgba(var(--accent-rgb),.13));color:var(--accent2)}.aqFilters{padding:17px 18px}.aqGrid{display:grid;grid-template-columns:1fr .55fr .75fr 1.8fr;gap:10px}.aqField span,.aqLabel{display:block;font-size:10px;color:#6f7d75;font-weight:900;text-transform:uppercase;letter-spacing:.055em;margin:0 0 6px 2px}.aqField input,.aqField select,.aqField textarea,.aqCat input,.aqCat select{width:100%;border:1px solid rgba(35,63,50,.12);border-radius:14px;background:rgba(255,255,255,.56);padding:11px 13px;font-size:13px;color:var(--ink);outline:none;min-height:46px}.aqField textarea{min-height:88px;resize:vertical}.aqMonths{display:grid;grid-template-columns:repeat(13,minmax(70px,1fr));gap:7px;overflow:auto;margin-top:6px}.aqMonths button{border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.34);border-radius:13px;padding:10px 8px;color:#506059;font-weight:850;font-size:11px;white-space:nowrap}.aqMonths .active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}.aqKpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.aqKpi .glass{padding:16px 17px}.aqKpi span{font-size:10px;color:#6c7a73;font-weight:900;text-transform:uppercase}.aqKpi strong{display:block;font-size:27px;margin-top:5px}.aqKpi small{color:var(--muted);font-size:10px}.aqTable{overflow:hidden}.aqTableHead{display:flex;justify-content:space-between;align-items:flex-end;gap:15px;padding:16px 18px;border-bottom:1px solid var(--line)}.aqTableHead h4{margin:0;font-size:18px}.aqTableHead p{margin:4px 0 0;color:var(--muted);font-size:11px}.aqMeta{display:flex;gap:7px;flex-wrap:wrap}.aqPill{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.66);font-size:10px;font-weight:850}.aqPill.green{background:var(--accent-soft);color:var(--accent2);border:0}.aqNotice{padding:10px 17px;background:#fff8e7;color:#7b5d25;font-size:11px}.aqWrap{overflow:auto;max-height:calc(100vh - 455px)}table.aqData{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0;font-size:12px}table.aqData th,table.aqData td{padding:12px 11px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}table.aqData th{position:sticky;top:0;background:rgba(249,252,250,.94);font-size:9px;color:#748078;text-transform:uppercase;z-index:3}table.aqData tbody tr{cursor:pointer}.aqName{font-weight:900;color:var(--accent2)}.aqSub{font-size:10px;color:var(--muted)}.aqStatus{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:900;background:#eef1ef}.aqStatus.aktif{background:#e8f7ef;color:#216b49}.aqStatus.ready-for-review{background:#edf2ff;color:#4c5f98}.aqStatus.validated{background:var(--accent-soft);color:var(--accent2)}.aqLos,.aqFilled{font-weight:900;color:var(--accent2)}.aqEmpty{min-height:120px;display:grid;place-items:center;color:var(--muted);font-size:11px}.aqBack{position:fixed;inset:0;z-index:100;background:rgba(11,22,17,.24);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}.aqDrawer{height:100%;width:min(950px,96vw);background:rgba(248,251,249,.98);box-shadow:-24px 0 65px rgba(0,0,0,.18);display:flex;flex-direction:column}.aqWide{width:min(1180px,97vw)}.aqDHead{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:20px}.aqDHead h4{font-size:24px;margin:4px 0}.aqDHead p{margin:0;color:var(--muted);font-size:11px}.aqClose{width:38px;height:38px;border:0;background:#eceeed;border-radius:12px;font-size:22px}.aqBody{padding:18px 22px;overflow:auto;min-height:0;flex:1}.aqEpisode{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.aqDerived{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:13px 0}.aqDerived div{padding:11px 13px;background:#fff;border:1px solid var(--line);border-radius:14px}.aqDerived span{font-size:9px;color:var(--muted)}.aqDerived strong{display:block;margin-top:4px;font-size:13px}.aqGuard{padding:11px 13px;border-radius:14px;background:#e9f7ef;color:#1e6c43;font-size:11px;line-height:1.5}.aqSection{display:flex;justify-content:space-between;align-items:end;margin:15px 0 8px}.aqSection h5{margin:0;font-size:17px}.aqSection span{font-size:10px;color:var(--muted)}.aqInd{background:#fff;border:1px solid var(--line);border-radius:17px;margin:11px 0;overflow:hidden}.aqInd.hit{border-color:rgba(var(--accent-rgb),.3)}.aqIHead{padding:14px 15px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px}.aqIHead strong{font-size:13px;line-height:1.42}.aqMetaText{font-size:9px;color:var(--muted);margin-top:4px}.aqMatch{font-size:9px;background:var(--accent-soft);color:var(--accent2);padding:5px 7px;border-radius:999px;font-weight:900;white-space:nowrap}.aqIBody{padding:15px}.aqQ{font-size:16px;font-weight:900;line-height:1.42;margin-bottom:9px}.aqTwo{display:grid;grid-template-columns:1fr 1fr;gap:10px}.aqAuto{padding:11px 13px;background:#eef8f4;border:1px solid #dcefe7;border-radius:13px}.aqAuto span,.aqAuto small{display:block;font-size:9px;color:var(--muted)}.aqAuto strong{display:block;font-size:18px;color:var(--accent2)}.aqRadio{display:flex;gap:8px;flex-wrap:wrap}.aqRadio label{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dadc;background:#fff;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:800}.aqEvidence{border-top:1px dashed #d9dcda;margin-top:12px;padding-top:11px}.aqFoot{padding:13px 22px;border-top:1px solid var(--line);background:rgba(255,255,255,.82);display:flex;justify-content:space-between;align-items:center;gap:10px}.aqCat{padding:18px 22px;overflow:auto}.aqCatFilters{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;gap:9px;margin-bottom:12px}.aqCatWrap{overflow:auto;max-height:calc(100vh - 220px)}table.aqCatalog{width:100%;min-width:1100px;border-collapse:separate;border-spacing:0}table.aqCatalog th,table.aqCatalog td{font-size:10px;padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}table.aqCatalog th{font-size:8px;color:#748078;position:sticky;top:0;background:#f8fbf9}table.aqCatalog td:nth-child(4){white-space:normal;min-width:390px}.aqCatalog td:nth-child(8),.aqCatalog td:nth-child(9){white-space:normal;min-width:320px;max-width:520px}@media(max-width:1180px){.aqGrid{grid-template-columns:1fr 1fr 1fr}.aqGrid label:last-child{grid-column:1/-1}.aqEpisode{grid-template-columns:1fr 1fr}.aqCatFilters{grid-template-columns:1fr 1fr}.aqMonths{grid-template-columns:repeat(13,86px)}}@media(max-width:850px){.aqHead{display:block}.aqActions{margin-top:12px}.aqGrid{grid-template-columns:1fr 1fr}.aqKpi{grid-template-columns:1fr}.aqWrap{max-height:calc(100vh - 520px)}.aqDrawer,.aqWide{width:100%}.aqDerived{grid-template-columns:1fr}.aqTwo{grid-template-columns:1fr}.aqEpisode{grid-template-columns:1fr 1fr}.aqFoot{display:block}.aqCatFilters{grid-template-columns:1fr 1fr}}@media(max-width:560px){.aqGrid{grid-template-columns:1fr}.aqGrid label:last-child{grid-column:auto}.aqEpisode{grid-template-columns:1fr}.aqIHead{display:block}.aqMatch{display:inline-flex;margin-top:7px}.aqCatFilters{grid-template-columns:1fr}.aqMeta{margin-top:8px}}
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
function kind(p:Profile){const h=String(p.title??'').toLowerCase();if(['daily_metric','provider_day'].includes(String(p.measurement_grain)))return'ratio';if(h.includes('jam visite dokter spesialis'))return'visit';if(h.includes('door-to-decision'))return'door';if(h.includes('response time')||h.includes('waktu tanggap'))return'minutes';if(h.includes('kt/v'))return'numeric';if(/kejadian |angka kematian|overcrowding|unplanned|kekosongan |dead stock|limfedema/.test(h))return'occurrence';return'compliance'}
function optionsFor(p:Profile){return Array.isArray(p.options_json)?p.options_json.filter((x:any)=>x&&x.label):[]}
function responseComplete(p:Profile,r:Resp|undefined){
 if(!r)return false
 const k=kind(p),opts=optionsFor(p)
 if(k==='ratio')return r.numerator!=null&&r.denominator!=null&&Number.isFinite(Number(r.numerator))&&Number.isFinite(Number(r.denominator))&&Number(r.numerator)>=0&&Number(r.denominator)>0&&Number(r.numerator)<=Number(r.denominator)
 if(k==='visit')return !!r.answer&&!!r.time
 if(k==='door')return !!r.start&&!!r.end&&diff(r.start,r.end)!=null
 if(k==='minutes')return r.minutes!=null&&Number(r.minutes)>=0
 if(k==='numeric')return r.value!=null&&Number.isFinite(Number(r.value))
 if(opts.length>0){
   if(!r.answer)return false
   const o=opts.find((x:any)=>String(x.label)===String(r.answer))
   return o?.code!=null||!!r.notes||!!r.evidence
 }
 if(k==='occurrence')return !!r.occurrence
 return !!r.answer
}
function filled(r:Resp|undefined){return!!r&&(!!r.answer||!!r.occurrence||!!r.time||!!r.start||!!r.end||r.minutes!=null||r.value!=null||(r.numerator!=null&&r.denominator!=null&&Number(r.denominator)>0))}
function empty(p:Profile):Resp{const k=kind(p);return k==='ratio'?{numerator:null,denominator:null}:k==='occurrence'?{occurrence:''}:k==='numeric'?{value:null}:k==='minutes'?{minutes:null}:k==='door'?{start:'',end:'',minutes:null}:k==='visit'?{time:'',answer:''}:{answer:''}}
function targetMet(p:Profile,r:Resp|undefined){
 if(!r||r.numerator==null||r.denominator==null||Number(r.denominator)<=0)return null
 const rate=Number(r.numerator)/Number(r.denominator)*100,target=Number(p.target_value)
 if(!Number.isFinite(rate)||!Number.isFinite(target))return null
 const op=String(p.target_operator||'=')
 if(op==='<='||op==='≤')return rate<=target+1e-9
 if(op==='>='||op==='≥')return rate>=target-1e-9
 if(op==='<')return rate<target
 if(op==='>')return rate>target
 return Math.abs(rate-target)<1e-9
}
function displayTitle(p:Profile){return String(p.schema_json?.header_label??'').trim()||String(p.title??'').trim()||`Indikator ${p.code}`}
const QUALITY_AUDIT_LAYOUTS=qualityAuditLayout2026 as AuditLayout[]
function getLayout(roomId:number|null|undefined){return roomId==null?undefined:QUALITY_AUDIT_LAYOUTS.find(x=>Number(x.roomId)===Number(roomId))}
function normHeader(v:unknown){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function profileMatchesHeader(header:string,p:Profile){
 const label=String(p.schema_json?.header_label??'').trim()||String(p.title??'').trim()
 const h=normHeader(header),l=normHeader(label)
 if(!h||!l)return false
 if(h===l)return true
 const stripDomain=(s:string)=>s.replace(/^(stemi|snh)\s*/,'').trim()
 if(stripDomain(h)===stripDomain(l))return true
 if(/kekosongan.*bhp.*linen|kekosongan.*linen.*bhp/.test(h)&&/kekosongan (linen|obat)/.test(l))return true
 return false
}
function unmatchedHeaders(all:Profile[],layout:AuditLayout|undefined){
 if(!layout)return []
 return layout.indicators.filter(header=>!all.some(p=>Number(p.room_id)===Number(layout.roomId)&&profileMatchesHeader(header,p)))
}
function layoutProfiles(all:Profile[],layout:AuditLayout|undefined){
 if(!layout)return all
 if(!layout.indicators.length)return []
 return all.filter(p=>layout.indicators.some(h=>profileMatchesHeader(h,p)))
}
function isComputedField(field:string,layout:AuditLayout|undefined){
 const n=normHeader(field)
 if(/^(length of stay|lenght of stay|los|lamanya tindak lanjut|kecepatan respon menit)$/.test(n))return true
 return (n==='umur'||n==='usia')&&!!layout?.fields.some(x=>normHeader(x)==='tanggal lahir')
}
function inputKind(field:string,layout:AuditLayout|undefined){
 if(isComputedField(field,layout))return'computed'
 const n=normHeader(field)
 if(layout?.providerGroups?.length&&['klinik','dokter'].includes(n))return'select'
 if(n.startsWith('tanggal ')||n.includes('jatuh tempo')||n.includes('deadline'))return'date'
 if(n.startsWith('waktu ')||n.startsWith('jam '))return'time'
 if(/kronologi|kronologis|rencana|uraian|rekomendasi|kendala|catatan|keterangan|tindakan yang segera|evaluasi tindak lanjut|penyelesaian aduan|instruksi|masalah/.test(n))return'textarea'
 if(/^(umur|usia|berat badan|tinggi badan|biaya akhir|estimasi ina cbgs)$/.test(n)&&!(n==='umur'&&layout?.fields.some(x=>normHeader(x)==='tanggal lahir')))return'number'
 return'text'
}
function recordDateFrom(formData:Record<string,any>,layout:AuditLayout|undefined,fallback=''){
 const priorities=['Tanggal Masuk','Tanggal Aduan','Tanggal Permintaan','Tanggal Keluhan','Tanggal Dilayani','Tanggal Audit','Tanggal Lapor','Tanggal Kunjungan','Tanggal Berkunjung','Tanggal Visite','Tanggal Pertemuan','Tanggal Mulai Praktek','Tanggal Pelaporan','Tanggal Insiden','Tanggal']
 for(const label of priorities)if(layout?.fields.includes(label)&&formData?.[label])return String(formData[label])
 const alternative=layout?.fields.find(label=>/tanggal|date/i.test(label)&&formData?.[label]&&!isComputedField(label,layout))
 return alternative?String(formData[alternative]):fallback
}
function dateDiffDays(a:unknown,b:unknown){
 if(!a||!b)return null
 const x=new Date(String(a)).getTime(),y=new Date(String(b)).getTime()
 return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.floor((y-x)/86400000)):null
}
function ageFromDob(dob:unknown,at:unknown){
 if(!dob)return null
 const d=new Date(String(dob)),end=at?new Date(String(at)):new Date()
 if(Number.isNaN(d.getTime())||Number.isNaN(end.getTime()))return null
 let age=end.getFullYear()-d.getFullYear()
 if(end.getMonth()<d.getMonth()||(end.getMonth()===d.getMonth()&&end.getDate()<d.getDate()))age--
 return Math.max(0,age)
}
function computedField(field:string,formData:Record<string,any>,layout:AuditLayout|undefined){
 const n=normHeader(field)
 if(/^(length of stay|lenght of stay|los)$/.test(n)){
  const start=formData?.['Tanggal Masuk']??formData?.['Tanggal Masuk Rumah Sakit']
  const end=formData?.['Tanggal Keluar']??''
  return start?los(String(start),String(end)):null
 }
 if(n==='lamanya tindak lanjut')return dateDiffDays(formData?.['Tanggal Aduan'],formData?.['Tanggal Tindak Lanjut'])
 if(n==='kecepatan respon menit'){
  const start=String(formData?.['Waktu Permintaan']??''),end=String(formData?.['Waktu Diantar']??'')
  return start&&end?diff(start,end):null
 }
 if((n==='umur'||n==='usia')&&layout?.fields.some(x=>normHeader(x)==='tanggal lahir')){
  return ageFromDob(formData?.['Tanggal Lahir'],formData?.['Tanggal Masuk']??formData?.['Tanggal Lapor'])
 }
 return null
}
function fieldValue(p:Patient,field:string,layout:AuditLayout|undefined){
 const f=p.formData&&typeof p.formData==='object'?p.formData:{}
 if(isComputedField(field,layout)){
  const v=computedField(field,f,layout)
  if(v==null)return'—'
  if(normHeader(field)==='lamanya tindak lanjut')return `${v} hari`
  if(normHeader(field)==='kecepatan respon menit')return `${v} menit`
  if(/length of stay|lenght of stay|los/i.test(field))return `${v} hari`
  return v
 }
 if(f[field]!==undefined&&f[field]!==null&&f[field]!==''){if(inputKind(field,layout)==='date')return fmt(String(f[field]));return f[field]}
 const n=normHeader(field)
 if(n==='nama pasien')return p.name??''
 if(n==='nama mahasiswa')return p.name??''
 if(n==='nama mpp')return p.name??''
 if(n==='no rm'||n==='no rekam medis')return p.rm??''
 if(n==='tanggal masuk')return p.admit??''
 if(n==='tanggal keluar')return p.discharge??''
 if(/diagnos/.test(n))return p.diagnosis??''
 if(n==='dpjp'||n==='dpjp')return p.dpjp??''
 if(n==='umur'||n==='usia')return p.age??''
 return''
}
function inputFieldValue(p:Patient,field:string,layout:AuditLayout|undefined){
 const form=p.formData&&typeof p.formData==='object'?p.formData:{}
 if(isComputedField(field,layout))return computedField(field,form,layout)??''
 if(Object.prototype.hasOwnProperty.call(form,field)&&form[field]!==null&&form[field]!==undefined)return form[field]
 const n=normHeader(field)
 if(n==='nama pasien'||n==='nama mahasiswa'||n==='nama mpp')return p.name??''
 if(n==='no rm'||n==='no rekam medis')return p.rm??''
 if(n==='tanggal masuk'||n==='tanggal masuk rumah sakit')return String(p.admit??'').slice(0,10)
 if(n==='tanggal keluar')return String(p.discharge??'').slice(0,10)
 if(/diagnos/.test(n))return p.diagnosis??''
 if(n==='dpjp'||n==='dpjp')return p.dpjp??''
 if(n==='jenis kelamin')return p.sex??''
 if(n==='umur'||n==='usia')return p.age??''
 if(inputKind(field,layout)==='date'){
  const raw=fieldValue(p,field,layout)
  const d=new Date(String(raw))
  return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)
 }
 return fieldValue(p,field,layout)??''
}
function recordTitle(p:Patient){
 return String(p.name??'').trim()||String(p.formData?.['Gangguan IT']??'').trim()||String(p.formData?.['Insiden yang Terjadi']??'').trim()||String(p.formData?.['Nama Pertemuan Ilmiah']??'').trim()||String(p.formData?.['Nama Mahasiswa']??'').trim()||String(p.formData?.['Nama MPP']??'').trim()||'Catatan Logbook'
}
function primaryDateField(layout:AuditLayout|undefined){
 return layout?.fields.find(f=>/tanggal masuk|tanggal aduan|tanggal permintaan|tanggal keluhan|tanggal dilayani|tanggal audit|tanggal lapor|tanggal kunjungan|tanggal berkunjung|tanggal visite|tanggal pertemuan|tanggal mulai praktek|tanggal pelaporan/i.test(f))
}
function dominantGrain(profiles:Profile[],layout:AuditLayout|undefined){
 if(layout?.measurementGrain)return layout.measurementGrain
 const matched=layoutProfiles(profiles,layout)
 const counts=new Map<string,number>()
 matched.forEach(p=>counts.set(String(p.measurement_grain||'event'),(counts.get(String(p.measurement_grain||'event'))||0)+1))
 const winner=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]
 if(winner)return winner
 return layout?.fields.some(f=>normHeader(f)==='tanggal masuk')?'patient_episode':'event'
}

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
 const [catGrain,setCatGrain]=useState('')
 const [auditRows,setAuditRows]=useState<Audit[]>([])

 const roomMap=useMemo(()=>new Map(rooms.map(r=>[Number(r.id),r.name])),[rooms])
 const activeLayout=useMemo(()=>getLayout(roomId),[roomId])
 const selectedLayout=useMemo(()=>selected?getLayout(Number(selected.roomId)):activeLayout,[selected,activeLayout])
 const hasHeaderMetadata=useMemo(()=>profiles.some(p=>String(p.schema_json?.header_label??'').trim()),[profiles])
 const patientProfiles=useMemo(()=>layoutProfiles(profiles,activeLayout),[profiles,activeLayout])

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
       let rq=q().from('quality_records').select('*').eq('profile_year',year).order('created_at',{ascending:false}).range(from,from+499)
       if(roomId!=null) rq=rq.eq('room_id',roomId)
       const {data,error}=await rq
       if(error) throw error
       rows.push(...(data??[]))
       if((data??[]).length<500) break
       from+=500
     }
     const db=rows.filter(r=>r.status!=='archived').map((r:any)=>{
       const c=r.core_data??r.subject_json??{}
       const formData=(c.form_fields??c.form_data??{}) as Record<string,any>
       const rowRoom=Number(r.room_id??c.room_id??0)||null
       const rowLayout=getLayout(rowRoom)
       const unit=String(c.unit_name??roomMap.get(Number(rowRoom))??'')
       const admit=String(c.admission_at??c.admit??recordDateFrom(formData,rowLayout,String(r.record_date??''))??'')
       const discharge=String(c.discharge_at??c.discharge??formData['Tanggal Keluar']??'')
       const name=String(c.patient_name??formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??c.subject??'')
       const rm=String(c.medical_record_no??c.rm??formData['No. Rekam Medis']??formData['No. RM']??'')
       const diagnosis=String(c.diagnosis??formData['Diagnosa Tegak']??formData['Diagnosa']??formData['Diagnosa IGD']??formData['Diagnosa Pasien']??formData['Diagnosis Medis']??formData['Diagnosa Operasi']??c.dx??'')
       const dpjp=String(c.dpjp??formData['DPJP']??formData['Dpjp']??'')
       return {id:String(r.id),recordId:String(r.id),roomId:rowRoom,unit,name,rm,sex:String(c.sex??formData['Jenis Kelamin']??''),age:c.age==null||c.age===''?null:Number(c.age),admit,discharge,diagnosis,dpjp,status:String(c.workflow_status??c.status??(discharge?'Ready for Review':'Aktif')),indicatorValues:(c.indicator_values??{}),formData,measurementGrain:String(r.measurement_grain??c.measurement_grain??'event'),source:'database',updatedAt:String(r.updated_at??r.created_at??'')}
     })
     const merged=[...db,...local.filter(l=>!db.some(d=>d.id===l.id||(!!d.rm&&!!l.rm&&d.rm===l.rm)))]
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
   const hasStay=!!activeLayout?.fields.some(f=>normHeader(f)==='tanggal masuk')&&!!activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')
   const statusOk=status==='Semua'||(status==='Aktif'?(hasStay?!p.discharge:!['Ready for Review','Validated'].includes(String(p.status))):p.status===status)
   const hay=`${p.name} ${p.rm} ${p.diagnosis} ${p.dpjp} ${p.unit} ${JSON.stringify(p.formData??{})}`.toLowerCase()
   return ymd(p.admit)===year&&roomOk&&monthOk&&statusOk&&hay.includes(search.toLowerCase().trim())
 }),[patients,year,roomId,roomMap,monthFilter,status,search,activeLayout])
 const yearPatients=useMemo(()=>patients.filter(p=>ymd(p.admit)===year&&(roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId)))),[patients,year,roomId,roomMap])
 const unmatchedIndicatorHeaders=useMemo(()=>unmatchedHeaders(profiles,activeLayout),[profiles,activeLayout])
 const selectedUnmatchedHeaders=useMemo(()=>unmatchedHeaders(profiles,selectedLayout),[profiles,selectedLayout])
 const applicable=useMemo(()=>selected?layoutProfiles(profiles,selectedLayout).sort((a,b)=>(hit(a,selected.diagnosis)?0:1)-(hit(b,selected.diagnosis)?0:1)||String(a.code).localeCompare(String(b.code),undefined,{numeric:true})):[],[selected,profiles,selectedLayout])
 const catalog=useMemo(()=>profiles.filter(p=>(!hasHeaderMetadata||String(p.schema_json?.header_label??'').trim())&&(catUnit==='Semua unit'||p.unit_name===catUnit)&&(!catGrain||p.measurement_grain===catGrain)&&`${p.code} ${displayTitle(p)} ${p.title??''} ${p.unit_name}`.toLowerCase().includes(catSearch.toLowerCase().trim())),[profiles,hasHeaderMetadata,catUnit,catGrain,catSearch])
 const filledN=useMemo(()=>applicable.filter(p=>responseComplete(p,draft[p.id??p.code])).length,[applicable,draft])

 const openPatient=(p:Patient)=>{
   const r:any={}
   layoutProfiles(profiles,getLayout(Number(p.roomId))).forEach(x=>{r[x.id??x.code]=p.indicatorValues?.[x.code]??empty(x)})
   setSelected({...p})
   setDraft(r)
   setPatientOpen(true)
   setMessage('')
 }
 const newPatient=()=>{
   if(roomId==null){setMessage('Pilih unit terlebih dahulu sebelum membuat catatan logbook.');return}
   const u=rooms.find(r=>Number(r.id)===Number(roomId))
   const layout=getLayout(roomId)
   const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()
   const formData:Record<string,any>={}
   ;(layout?.fields??[]).forEach(field=>{formData[field]=inputKind(field,layout)==='computed'?'':''})
   const dateField=primaryDateField(layout)
   if(dateField)formData[dateField]=today
   const grain=dominantGrain(profiles,layout)
   const admit=recordDateFrom(formData,layout,today)
   const selectedRecord={id:`LOCAL-${Date.now()}`,recordId:null,roomId,unit:u?.name??'',name:String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??''),rm:String(formData['No. Rekam Medis']??formData['No. RM']??''),sex:String(formData['Jenis Kelamin']??''),age:null,admit,discharge:String(formData['Tanggal Keluar']??''),diagnosis:String(formData['Diagnosa Tegak']??formData['Diagnosa']??''),dpjp:String(formData['DPJP']??formData['Dpjp']??''),status:'Draft',indicatorValues:{},formData,measurementGrain:grain,source:'local',updatedAt:null}
   setSelected(selectedRecord)
   const r:any={}
   layoutProfiles(profiles,layout).forEach(p=>{r[p.id??p.code]=empty(p)})
   setDraft(r);setPatientOpen(true);setMessage('')
 }
 const setField=(field:string,value:any)=>{
   setSelected(p=>{
     if(!p)return p
     const layout=getLayout(Number(p.roomId))
     const formData={...(p.formData??{}),[field]:value}
     const name=String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??formData['Nama MPP']??p.name??'')
     const rm=String(formData['No. Rekam Medis']??formData['No. RM']??p.rm??'')
     const admit=recordDateFrom(formData,layout,String(p.admit??''))
     const discharge=String(formData['Tanggal Keluar']??p.discharge??'')
     const diagnosis=String(formData['Diagnosa Tegak']??formData['Diagnosa']??formData['Diagnosa IGD']??formData['Diagnosa Pasien']??formData['Diagnosis Medis']??formData['Diagnosa Operasi']??p.diagnosis??'')
     const dpjp=String(formData['DPJP']??formData['Dpjp']??p.dpjp??'')
     const ageField=layout?.fields.find(x=>normHeader(x)==='umur'||normHeader(x)==='usia')
     const ageValue=ageField&&isComputedField(ageField,layout)?computedField(ageField,formData,layout):formData['Umur']??formData['Usia']??p.age
     return {...p,formData,name,rm,admit,discharge,diagnosis,dpjp,age:ageValue===''||ageValue==null?null:Number(ageValue)}
   })
 }
 const setResp=(p:Profile,patch:Resp)=>{const k=String(p.id??p.code);setDraft(x=>({...x,[k]:{...(x[k]??empty(p)),...patch}}))}
 const audit=(x:Audit)=>{const a=[x,...localRead<Audit[]>(AUDIT_KEY,[])].slice(0,500);localWrite(AUDIT_KEY,a);setAuditRows(a)}

 const save=async()=>{
   if(!selected)return
   const layout=getLayout(Number(selected.roomId))??activeLayout
   const formData:Record<string,any>={...(selected.formData??{})}
   const identityCandidates=['Nama Pasien','Nama Mahasiswa','Nama MPP','Gangguan IT','Insiden yang Terjadi','Nama Pertemuan Ilmiah','Uraian Temuan Audit','Nama Pertemuan Ilmiah']
   const identityField=layout?.fields.find(f=>identityCandidates.includes(f))??layout?.fields[0]
   if(identityField&&!String(formData[identityField]??'').trim()){
     setMessage(`Kolom "${identityField}" wajib diisi agar catatan mudah dikenali.`);return
   }
   const dateField=primaryDateField(layout)
   if(dateField&&!String(formData[dateField]??'').trim()){
     setMessage(`Kolom tanggal "${dateField}" wajib diisi untuk filter periode dan pelaporan.`);return
   }
   const calc:any={}
   ;(layout?.fields??[]).filter(field=>isComputedField(field,layout)).forEach(field=>{
     const v=computedField(field,formData,layout)
     if(v!=null)calc[field]=v
   })
   const recordDate=recordDateFrom(formData,layout,String(selected.admit??''))
   const normalizedName=String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??selected.name??'').trim()
   const normalizedRm=String(formData['No. Rekam Medis']??formData['No. RM']??selected.rm??'').trim()
   const normalizedDiagnosis=String(formData['Diagnosa Tegak']??formData['Diagnosa']??formData['Diagnosa IGD']??formData['Diagnosa Pasien']??formData['Diagnosis Medis']??formData['Diagnosa Operasi']??selected.diagnosis??'').trim()
   const normalizedDpjp=String(formData['DPJP']??formData['Dpjp']??selected.dpjp??'').trim()
   const discharge=String(formData['Tanggal Keluar']??selected.discharge??'')
   const values:any={}
   applicable.forEach(p=>{const r=draft[p.id??p.code];if(r)values[p.code]=r})
   const complete=applicable.length>0&&applicable.every(p=>responseComplete(p,draft[p.id??p.code]))
   const stayLayout=!!layout?.fields.some(f=>normHeader(f)==='tanggal masuk')&&!!layout?.fields.some(f=>normHeader(f)==='tanggal keluar')
   const finalStatus=complete?'Ready for Review':(stayLayout&&!discharge?'Aktif':'Draft')
   const now=new Date().toISOString()
   const grain=String(selected.measurementGrain??dominantGrain(profiles,layout))
   const core={patient_name:normalizedName,medical_record_no:normalizedRm,sex:String(formData['Jenis Kelamin']??selected.sex??''),age:formData['Umur']??formData['Usia']??selected.age,admission_at:formData['Tanggal Masuk']??recordDate,discharge_at:discharge,diagnosis:normalizedDiagnosis,dpjp:normalizedDpjp,unit_name:selected.unit,room_id:selected.roomId,status:finalStatus,workflow_status:finalStatus,form_fields:formData,calculated_fields:calc,indicator_values:values,measurement_grain:grain,los_days:calc['Lenght of Stay']??calc['Length of Stay']??(stayLayout?los(String(formData['Tanggal Masuk']??''),discharge):null)}
   setBusy(true)
   let recordId=selected.recordId,backend=false,warning=''
   try{
     const {data:{user}}=await sb.auth.getUser()
     if(!user) throw new Error('Sesi login tidak ditemukan.')
     const payload={room_id:selected.roomId,profile_year:year,measurement_grain:grain,record_date:recordDate?String(recordDate).slice(0,10):null,subject_key:normalizedRm||`${selected.roomId}:${recordDate||now}:${selected.id}`,subject_json:core,core_data:core,status:'ready',review_required:!complete,entered_by:user.id}
     if(recordId){const {error}=await q().from('quality_records').update(payload).eq('id',recordId);if(error)throw error}
     else{const {data,error}=await q().from('quality_records').insert(payload).select('*').single();if(error)throw error;recordId=String(data.id)}
     await q().from('quality_record_responses').delete().eq('record_id',recordId)
     const obs=applicable.map(p=>{const r=values[p.code];if(!r||!p.id)return null;return{record_id:recordId,indicator_id:p.id,response_label:r.answer??r.occurrence??null,response_code:r.code??null,raw_value:r,other_text:r.evidence??r.notes??null,review_status:r.answer==='Exception'?'pending':'not_required'}}).filter(Boolean)
     if(obs.length){const {error}=await q().from('quality_record_responses').insert(obs);if(error)warning=`Episode tersimpan, tetapi detail respons belum tersalin ke ledger respons: ${error.message}`}
     backend=true
   }catch(e){
     const cached:Patient={...selected,recordId:recordId??null,status:finalStatus,updatedAt:now,indicatorValues:values,source:'local'}
     localWrite(LOCAL_KEY,[cached,...localRead<Patient[]>(LOCAL_KEY,[]).filter(x=>x.id!==selected.id&&(!x.rm||!cached.rm||x.rm!==cached.rm))].slice(0,5000))
     setSource('Cache lokal')
     warning=`Episode tersimpan di cache lokal karena backend belum menerima perubahan. ${e instanceof Error?e.message:''}`.trim()
   }
   const saved:Patient={...selected,name:normalizedName,rm:normalizedRm,admit:String(recordDate??selected.admit??''),discharge,diagnosis:normalizedDiagnosis,dpjp:normalizedDpjp,formData,measurementGrain:grain,recordId:recordId??null,status:finalStatus,updatedAt:now,indicatorValues:values,source:backend?'database':'local'}
   setPatients(p=>[saved,...p.filter(x=>x.id!==selected.id&&(!(x.rm&&saved.rm)||x.rm!==saved.rm))])
   audit({at:now,actor:'PIC / Pengguna Aktif',unit:selected.unit,patient:recordTitle(saved),indicator:`${Object.keys(values).length}/${applicable.length} indikator`,action:selected.recordId?'Ubah':'Isi',change:`Catatan logbook ${finalStatus}`})
   setSelected(saved);setPatientOpen(false);setMessage(warning||'Episode pasien tersimpan dan siap dilanjutkan.');setBusy(false)
 }

 const indicatorEditor=(p:Profile)=>{
   const k=String(p.id??p.code),r=draft[k]??empty(p),kindNow=kind(p),isHit=hit(p,selected?.diagnosis??''),opts=optionsFor(p),title=displayTitle(p)
   const option=opts.find((x:any)=>String(x.label)===String(r.answer))
   const resultCode=r.code??option?.code??null
   const resultLabel=resultCode===1?'Memenuhi / Sesuai':resultCode===2?'Pengecualian / Perlu review':resultCode===3?'Tidak memenuhi / Tidak sesuai':(option?.code==null&&r.answer)?'Perlu review':'Belum tervalidasi'
   const commonEvidence=<details className="aqEvidence"><summary>Bukti & catatan audit</summary><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Sumber bukti</span><input value={r.evidence??''} onChange={(e:any)=>setResp(p,{evidence:e.target.value})} placeholder="RME / RM / hasil observasi…"/></label><label className="aqField"><span>Referensi / lokasi data</span><input value={r.reference??''} onChange={(e:any)=>setResp(p,{reference:e.target.value})} placeholder="No. dokumen / waktu / lokasi…"/></label></div><label className="aqField" style={{marginTop:10}}><span>Catatan</span><textarea value={r.notes??''} onChange={(e:any)=>setResp(p,{notes:e.target.value})} placeholder="Catatan audit bila diperlukan…"/></label></details>
   const genericOptions=opts.length>0&&!['visit','door','minutes','numeric'].includes(kindNow)
   return <article className={`aqInd ${isHit?'hit':''}`} key={k}><div className="aqIHead"><div><strong>{p.code} · {title}</strong><div className="aqMetaText">{p.unit_name} · {p.indicator_type||'Indikator Mutu'} · Target {p.target_text||'—'} · {p.measurement_grain}</div>{String(p.title??'').trim()&&String(p.title??'').trim()!==title&&<div className="aqMetaText">Nama master: {p.title}</div>}</div>{isHit&&<span className="aqMatch">Relevan dengan diagnosis</span>}</div><div className="aqIBody"><div className="aqQ">{kindNow==='visit'?'Apakah pasien ini divisite dokter spesialis pada pukul 06.00–14.00?':kindNow==='door'?'Apakah keputusan medis definitif diperoleh dalam ≤ 2 jam sejak pasien tiba?':kindNow==='minutes'?'Berapa waktu tanggap aktual pada episode pasien ini?':kindNow==='numeric'?'Berapa nilai numerik indikator pada episode pasien ini?':`Bagaimana hasil validasi ${title} pada pasien ini?`}</div>{(String(p.numerator_definition??'').trim()||String(p.denominator_definition??'').trim())&&<details className="aqEvidence"><summary>Definisi operasional & rumus indikator</summary><div className="aqMetaText" style={{marginTop:8,whiteSpace:'normal'}}><b>Pembilang (N):</b> {p.numerator_definition||'Belum tersedia pada master sumber.'}</div><div className="aqMetaText" style={{marginTop:8,whiteSpace:'normal'}}><b>Penyebut (D):</b> {p.denominator_definition||'Belum tersedia pada master sumber.'}</div></details>}{(!String(p.numerator_definition??'').trim()||!String(p.denominator_definition??'').trim())&&<div className="aqNotice" style={{marginTop:10}}>Detail pembilang/penyebut pada master belum lengkap; jangan mengisi definisi berdasarkan perkiraan.</div>}
     {kindNow==='visit'&&<><div className="aqRadio"><label><input type="radio" checked={r.answer==='Ya'} onChange={()=>setResp(p,{answer:'Ya',code:1})}/> Ya, divisite 06.00–14.00</label><label><input type="radio" checked={r.answer==='Tidak'} onChange={()=>setResp(p,{answer:'Tidak',code:3})}/> Tidak</label></div><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Waktu visite aktual</span><input type="time" value={r.time??''} onChange={(e:any)=>{const m=tm(e.target.value);setResp(p,{time:e.target.value,code:m!=null&&m>=360&&m<=840?1:3})}}/></label><div className="aqAuto"><span>Hasil otomatis</span><strong>{r.time?(()=>{const m=tm(r.time);return m!=null&&m>=360&&m<=840?'Memenuhi':'Tidak memenuhi'})():'Belum dihitung'}</strong><small>Target waktu 06.00–14.00</small></div></div></>}
     {kindNow==='door'&&<><div className="aqTwo"><label className="aqField"><span>Waktu pasien tiba</span><input type="time" value={r.start??''} onChange={(e:any)=>setResp(p,{start:e.target.value})}/></label><label className="aqField"><span>Waktu keputusan medis</span><input type="time" value={r.end??''} onChange={(e:any)=>setResp(p,{end:e.target.value})}/></label></div><div className="aqAuto" style={{marginTop:10}}><span>Durasi otomatis</span><strong>{r.start&&r.end&&diff(r.start,r.end)!=null?`${diff(r.start,r.end)} menit`:'Belum dihitung'}</strong><small>Target ≤ 120 menit</small></div></>}
     {kindNow==='minutes'&&<div className="aqTwo"><label className="aqField"><span>Waktu aktual (menit)</span><input type="number" min="0" value={r.minutes??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value);setResp(p,{minutes:v,code:v==null?null:(v<=30?1:3)})}}/></label><div className="aqAuto"><span>Interpretasi</span><strong>{r.minutes==null?'Belum diisi':r.minutes<=30?'Memenuhi':'Tidak memenuhi'}</strong></div></div>}
     {kindNow==='numeric'&&<label className="aqField"><span>Nilai indikator</span><input type="number" step="0.01" value={r.value??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value);setResp(p,{value:v,code:v==null?null:1})}}/></label>}
     {kindNow==='occurrence'&&!genericOptions&&<div className="aqRadio"><label><input type="radio" checked={r.occurrence==='Tidak terjadi'} onChange={()=>setResp(p,{occurrence:'Tidak terjadi',code:1})}/> Tidak terjadi</label><label><input type="radio" checked={r.occurrence==='Terjadi'} onChange={()=>setResp(p,{occurrence:'Terjadi',code:3})}/> Terjadi</label></div>}
     {genericOptions&&<div className="aqRadio">{opts.map((o:any,i:number)=><label key={`${k}-opt-${i}`}><input type="radio" name={`ind-${k}`} checked={r.answer===o.label} onChange={()=>setResp(p,{answer:o.label,code:o.code??null})}/><span>{o.label}</span></label>)}</div>}
     {!genericOptions&&kindNow==='compliance'&&<div className="aqRadio"><label><input type="radio" checked={r.answer==='Sesuai'} onChange={()=>setResp(p,{answer:'Sesuai',code:1})}/> Sesuai</label><label><input type="radio" checked={r.answer==='Exception'} onChange={()=>setResp(p,{answer:'Exception',code:2})}/> Justified Exception</label><label><input type="radio" checked={r.answer==='Tidak sesuai'} onChange={()=>setResp(p,{answer:'Tidak sesuai',code:3})}/> Tidak sesuai</label></div>}
     {r.answer==='Lainnya — tuliskan alasan/temuan'&&<label className="aqField" style={{marginTop:10}}><span>Alasan / temuan wajib</span><textarea value={r.notes??''} onChange={(e:any)=>setResp(p,{notes:e.target.value})} placeholder="Tuliskan alasan/temuan untuk review superadmin…"/></label>}
     <div className="aqAuto" style={{marginTop:10}}><span>Hasil validasi indikator</span><strong>{resultLabel}</strong><small>{responseComplete(p,r)?'Respons lengkap':'Belum lengkap'}</small></div>
     {commonEvidence}
   </div></article>
 }

 return <div className="aq">
   <style dangerouslySetInnerHTML={{__html:CSS}}/>
   <section className="glass aqHead"><div><div className="eyebrow">AUREKA · INDIKATOR MUTU</div><h3>Audit Indikator Mutu</h3><p>Logbook master–detail. PIC mengisi fakta pasien; AUREKA menghitung agregat indikator dari episode pasien.</p></div><div className="aqActions"><button className="aqBtn" onClick={()=>setCatalogOpen(true)}>Master {hasHeaderMetadata?profiles.filter(p=>String(p.schema_json?.header_label??'').trim()).length:profiles.length} Header</button><button className="aqBtn" onClick={()=>{setAuditRows(localRead<Audit[]>(AUDIT_KEY,[]));setAuditOpen(true)}}>Audit Trail</button><button className="aqBtn primary" onClick={newPatient}>＋ Catatan</button></div></section>
   <nav className="glass aqTabs">{CONTAINERS.map(x=><button key={x} className={`aqTab ${container===x?'active':''}`} onClick={()=>setContainer(x)}>{x}</button>)}</nav>
   {container!=='Audit Indikator Mutu'?<section className="glass aqBody" style={{minHeight:320,display:'grid',placeItems:'center',textAlign:'center'}}><div><div className="eyebrow">AUREKA · CONTAINER</div><h4 style={{fontSize:24,margin:'6px 0'}}>{container}</h4><p style={{maxWidth:720,color:'var(--muted)',fontSize:12,lineHeight:1.6}}>Container menggunakan shell AUREKA yang sama. Workspace pengumpulan data lanjutan mengikuti master indikator dan audit trail yang sama.</p></div></section>:<>
     <section className="glass aqFilters"><div className="aqGrid"><label className="aqField"><span>Unit</span><select value={roomId??''} disabled={!isAdmin} onChange={(e:any)=>setRoomId(e.target.value?Number(e.target.value):null)}>{isAdmin&&<option value="">Semua Unit</option>}{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="aqField"><span>Tahun</span><select value={year} onChange={(e:any)=>setYear(Number(e.target.value))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></label><label className="aqField"><span>Status</span><select value={status} onChange={(e:any)=>setStatus(e.target.value)}>{STATUS.map(s=><option key={s}>{s==='Aktif'?(activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Aktif (Belum Pulang)':'Aktif / Belum Selesai'):s}</option>)}</select></label><label className="aqField"><span>Pencarian</span><input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Nama / No. RM / diagnosis / DPJP…"/></label></div><div style={{marginTop:12}}><div className="aqLabel">Bulan Pengamatan</div><div className="aqMonths"><button className={!monthFilter?'active':''} onClick={()=>setMonthFilter(0)}>Semua Bulan</button>{MONTHS.map((m,i)=><button key={m} className={monthFilter===i+1?'active':''} onClick={()=>setMonthFilter(i+1)}>{m}</button>)}</div></div></section>
     <section className="aqKpi"><div className="glass"><span>{activeLayout?.fields.some(f=>normHeader(f)==='tanggal masuk')?'Total Pasien / Episode':roomId===1?'Total Aduan':'Total Catatan Logbook'}</span><strong>{yearPatients.length}</strong><small>Catatan pada tahun {year}</small></div><div className="glass"><span>{activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Pasien Masih Dirawat':activeLayout?.fields.some(f=>normHeader(f)==='status aduan')?'Aduan Belum Selesai':'Catatan dengan Data Input'}</span><strong>{activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?yearPatients.filter(p=>!p.discharge).length:activeLayout?.fields.some(f=>normHeader(f)==='status aduan')?yearPatients.filter(p=>!/(selesai|ditutup|closed)/i.test(String(p.formData?.['Status Aduan']??''))).length:yearPatients.filter(p=>Object.values(p.formData??{}).some(v=>v!==''&&v!=null)).length}</strong><small>{activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Belum memiliki tanggal keluar':activeLayout?.fields.some(f=>normHeader(f)==='status aduan')?'Status belum selesai/ditutup':'Memiliki setidaknya satu field logbook terisi'}</small></div><div className="glass"><span>Catatan dengan Indikator Terisi</span><strong>{yearPatients.filter(p=>(Object.values(p.indicatorValues??{}) as Resp[]).some(filled)).length}</strong><small>Memiliki minimal satu respons indikator mutu</small></div></section>
     <section className="glass aqTable"><div className="aqTableHead"><div><h4>Logbook {roomId===1?'Aduan':activeLayout?.fields.some(f=>normHeader(f)==='tanggal masuk')?'Pasien':'Unit'}</h4><p>Kolom tabel mengikuti seluruh header Excel yang tidak berwarna hijau. Indikator berwarna hijau tampil di dalam detail catatan.</p></div><div className="aqMeta"><span className="aqPill green">{filtered.length} catatan</span><span className="aqPill">{patientProfiles.length} indikator mutu</span><span className="aqPill green">{source}</span></div></div>{message&&<div className="aqNotice">{message}</div>}{activeLayout&&!activeLayout.indicators.length&&<div className="aqNotice">Pada layout unit ini tidak ditemukan header indikator berwarna hijau. Data logbook tetap dapat dicatat menggunakan header data yang tersedia.</div>}{unmatchedIndicatorHeaders.length>0&&<div className="aqNotice">{unmatchedIndicatorHeaders.length} header hijau belum mempunyai profil indikator aktif di master: {unmatchedIndicatorHeaders.join(' · ')}. Header tetap ditampilkan saat catatan dibuka, tetapi belum dapat dihitung sebagai indikator sampai master dilengkapi.</div>}<div className="aqWrap"><table className="aqData"><thead><tr><th>No.</th>{(activeLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Length of Stay','Diagnosa Tegak','DPJP']).map((field,i)=><th key={field+'-'+i}>{field}</th>)}<th>Indikator Terisi</th><th>Status</th></tr></thead><tbody>{filtered.map((p:any,i:number)=>{const rowProfiles=layoutProfiles(profiles,getLayout(Number(p.roomId))),total=rowProfiles.length,count=rowProfiles.filter(x=>filled(p.indicatorValues?.[x.code])).length;return <tr key={`${p.id}-${p.rm||i}`} tabIndex={0} onClick={()=>openPatient(p)} onKeyDown={(e:any)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPatient(p)}}}><td>{i+1}</td>{(activeLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Length of Stay','Diagnosa Tegak','DPJP']).map((field,j)=><td key={field+'-'+j}>{String(fieldValue(p,field,getLayout(Number(p.roomId)))??'')||'—'}</td>)}<td><span className="aqFilled">{count}/{total}</span></td><td><span className={`aqStatus ${String(p.status).toLowerCase().replaceAll(' ','-')}`}>{p.status||'Draft'}</span></td></tr>})}{!filtered.length&&<tr><td colSpan={(activeLayout?.fields.length??7)+3}><div className="aqEmpty">{busy?'Memuat data logbook…':'Belum ada catatan pada unit/periode ini. Tekan ＋ Catatan untuk mulai mengisi header putih dan indikator hijau.'}</div></td></tr>}</tbody></table></div></section></>}

   {patientOpen&&selected&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget&&!busy)setPatientOpen(false)}}><section className="aqDrawer" role="dialog" aria-modal="true" aria-label={`Logbook ${recordTitle(selected)}`}><div className="aqDHead"><div><div className="eyebrow">LOGBOOK · {selected.unit}</div><h4>{recordTitle(selected)}</h4><p>{selected.rm? `No. RM ${selected.rm} · `:''}{selected.admit?fmt(selected.admit):'Tanggal pencatatan belum diisi'}{selected.diagnosis? ` · ${selected.diagnosis}`:''}</p></div><button className="aqClose" onClick={()=>!busy&&setPatientOpen(false)}>×</button></div><div className="aqBody">
      <div className="aqNotice" style={{marginBottom:12}}>Kolom data berikut berasal dari header Excel yang <b>tidak berwarna hijau</b>. Nilai turunan seperti LOS, umur dari tanggal lahir, lamanya tindak lanjut, dan kecepatan respons dihitung otomatis dan tidak perlu diketik.</div>
      <div className="aqEpisode">{(selectedLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Length of Stay','Diagnosa Tegak','DPJP']).map((field,i)=>{const kindNow=inputKind(field,selectedLayout);const raw=inputFieldValue(selected,field,selectedLayout);const fullWidth=kindNow==='textarea'||field.length>66;return <label key={field+'-'+i} className="aqField" style={fullWidth?{gridColumn:'1/-1'}:undefined}><span>{field}{kindNow==='computed'?' · Otomatis':''}</span>{kindNow==='computed'?<div className="aqAuto"><strong>{raw==null||raw===''?'Menunggu data':typeof raw==='number'&&/length of stay|lenght of stay|los/i.test(field)?`${raw} hari`:normHeader(field)==='lamanya tindak lanjut'?`${raw} hari`:normHeader(field)==='kecepatan respon menit'?`${raw} menit`:String(raw)}</strong><small>Dihitung dari tanggal/waktu terkait bila tersedia</small></div>:kindNow==='textarea'?<textarea value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)} placeholder={`Isi ${field.toLowerCase()}…`}/>:<input type={kindNow==='date'?'date':kindNow==='time'?'time':kindNow==='number'?'number':'text'} step={kindNow==='number'?'any':undefined} readOnly={false} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)} placeholder={`Isi ${field.toLowerCase()}…`}/>}</label>})}</div>
      <div className="aqDerived"><div><span>Unit logbook</span><strong>{selected.unit}</strong></div><div><span>Tanggal pencatatan</span><strong>{recordDateFrom(selected.formData??{},selectedLayout,String(selected.admit??''))?fmt(String(recordDateFrom(selected.formData??{},selectedLayout,String(selected.admit??'')) )):'—'}</strong></div><div><span>Kelengkapan indikator hijau</span><strong>{filledN}/{applicable.length} terisi</strong></div></div>
      <div className="aqSection"><h5>Indikator Mutu (Header Hijau)</h5><span>{filledN} dari {applicable.length} terisi</span></div>
      {selectedLayout&&!selectedLayout.indicators.length&&<div className="aqNotice">Layout Excel untuk unit ini belum mencantumkan header indikator berwarna hijau.</div>}
      {applicable.map(indicatorEditor)}{selectedUnmatchedHeaders.map((header,i)=><article className="aqInd" key={`unmapped-${selected.roomId}-${i}-${header}`}><div className="aqIHead"><div><strong>{header}</strong><div className="aqMetaText">Header hijau dari Header Aureka.xlsx · indikator belum terpetakan ke master aktif</div></div></div><div className="aqIBody"><div className="aqNotice">Profil ini belum memiliki pasangan aktif dengan target dan definisi operasional yang tervalidasi. Isian angka/hasil indikator belum diaktifkan agar tidak menghasilkan perhitungan mutu yang keliru.</div></div></article>)}{!applicable.length&&!selectedUnmatchedHeaders.length&&<div className="aqEmpty">Belum ada indikator hijau pada layout unit ini.</div>}
    </div><div className="aqFoot"><span style={{fontSize:11,color:'var(--muted)'}}>{source} · seluruh field putih dan indikator hijau disimpan sebagai satu catatan logbook.</span><div style={{display:'flex',gap:8}}><button className="aqBtn" onClick={()=>!busy&&setPatientOpen(false)}>Batal</button><button className="aqBtn primary" onClick={save} disabled={busy}>{busy?'Menyimpan…':'Simpan Logbook'}</button></div></div></section></div>}

   {catalogOpen&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget)setCatalogOpen(false)}}><section className="aqDrawer aqWide" role="dialog" aria-modal="true" aria-label="Master indikator mutu"><div className="aqDHead"><div><div className="eyebrow">MASTER AUREKA</div><h4>Seluruh Indikator Mutu</h4><p>Header hijau dari master Excel, dipasangkan dengan nama indikator dan detail definisi operasional di master AUREKA.</p></div><button className="aqClose" onClick={()=>setCatalogOpen(false)}>×</button></div><div className="aqCat"><div className="aqCatFilters"><select value={catUnit} onChange={(e:any)=>setCatUnit(e.target.value)}><option>Semua unit</option>{rooms.map(r=><option key={r.id}>{r.name}</option>)}</select><select value={catGrain} onChange={(e:any)=>setCatGrain(e.target.value)}><option value="">Semua measurement grain</option><option value="patient_episode">patient_episode</option><option value="provider_day">provider_day</option><option value="daily_metric">daily_metric</option><option value="event">event</option><option value="activity">activity</option><option value="aggregate">aggregate</option></select><input value={catSearch} onChange={(e:any)=>setCatSearch(e.target.value)} placeholder="Cari kode / indikator / unit…"/><button className="aqBtn" onClick={()=>{setCatSearch('');setCatUnit('Semua unit');setCatGrain('')}}>Reset</button></div><div className="aqCatWrap"><table className="aqCatalog"><thead><tr><th>Kode</th><th>Unit</th><th>Header audit</th><th>Nama master lengkap</th><th>Jenis</th><th>Grain</th><th>Target</th><th>Definisi pembilang (N)</th><th>Definisi penyebut (D)</th><th>Kelengkapan detail</th></tr></thead><tbody>{catalog.map(p=><tr key={p.id??p.code}><td>{p.code}</td><td>{p.unit_name}</td><td>{p.schema_json?.header_label||'—'}</td><td>{p.title||'Judul master perlu dilengkapi'}</td><td>{p.indicator_type||'—'}</td><td>{p.measurement_grain}</td><td>{p.target_text||'—'}</td><td>{p.numerator_definition||'Belum tersedia di master'}</td><td>{p.denominator_definition||'Belum tersedia di master'}</td><td>{p.target_text&&p.numerator_definition&&p.denominator_definition?'Lengkap':'Perlu verifikasi'}</td></tr>)}{!catalog.length&&<tr><td colSpan={10}><div className="aqEmpty">Tidak ada indikator yang cocok.</div></td></tr>}</tbody></table></div></div></section></div>}

   {auditOpen&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget)setAuditOpen(false)}}><section className="aqDrawer aqWide" role="dialog" aria-modal="true" aria-label="Audit trail indikator mutu"><div className="aqDHead"><div><div className="eyebrow">AUDIT TRAIL</div><h4>Jejak Perubahan Data Mutu</h4><p>Riwayat perubahan yang dicatat oleh workspace ini.</p></div><button className="aqClose" onClick={()=>setAuditOpen(false)}>×</button></div><div className="aqCat"><div className="aqCatWrap"><table className="aqCatalog"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Unit</th><th>Pasien</th><th>Indikator</th><th>Aksi</th><th>Perubahan</th></tr></thead><tbody>{auditRows.map((a:any,i:number)=><tr key={`${a.at}-${i}`}><td>{a.at?new Date(a.at).toLocaleString('id-ID'):'—'}</td><td>{a.actor||'—'}</td><td>{a.unit||'—'}</td><td>{a.patient||'—'}</td><td>{a.indicator||'—'}</td><td>{a.action||'—'}</td><td>{a.change||'—'}</td></tr>)}{!auditRows.length&&<tr><td colSpan={7}><div className="aqEmpty">Belum ada catatan audit trail lokal.</div></td></tr>}</tbody></table></div></div></section></div>}
 </div>
}
