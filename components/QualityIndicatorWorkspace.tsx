'use client'
import {Fragment,useCallback,useEffect,useMemo,useState} from 'react'
import QualityExcelPastePanel from '@/components/QualityExcelPastePanel'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { compareToTarget, isWithinVisitWindow, resolveMeasurementKind } from '@/lib/aureka/indicator-engine'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {LiquidGlass,LiquidGlassButton} from '@/components/LiquidGlass'
import ClinicalDeathAuditWorkspace from '@/components/ClinicalDeathAuditWorkspace'
import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'

const sb=aurekaSupabase
const q=()=>sb.schema('aureka_quality')
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const CONTAINERS=['Audit Indikator Mutu','Audit Clinical Pathway','Audit Klinis dan Kematian'] as const
const STATUS=['Semua','Aktif','Draft','Ready for Review','Validated','Reopened']
const YEARS=[2025,2026,2027,2028,2029]

type Room={id:number;name:string};type Profile=Record<string,any>;type TeamStaffOption={id:string;employee_code:string;display_name:string;profession_group:string;position_title:string;directory_status:'available';room_id:number};type AuditLayout={roomId:number;fields:string[];indicators:string[];measurementGrain?:string;providerGroups?:{clinic:string;doctors:string[]}[]};type Resp={answer?:string;occurrence?:string;time?:string;start?:string;end?:string;minutes?:number|null;value?:number|null;numerator?:number|null;denominator?:number|null;evidence?:string;reference?:string;notes?:string;code?:number|null};type Patient=Record<string,any>

const CSS=`
.aq{display:grid;gap:14px}.aqInlineEditor{display:grid;gap:0;overflow:visible;border-radius:18px;box-shadow:0 8px 28px rgba(19,48,36,.08);background:rgba(255,255,255,.82)}.aqInlineEditor .aqDHead{padding:17px 19px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.aqInlineEditor .aqDHead h4{font-size:22px;margin:4px 0;letter-spacing:-.04em}.aqInlineEditor .aqBody{padding:16px 19px;max-height:none;overflow:visible}.aqInlineEditor .aqFoot{position:sticky;bottom:0;z-index:4;padding:12px 19px;border-top:1px solid var(--line);background:rgba(248,251,249,.96);backdrop-filter:blur(10px);display:flex;justify-content:space-between;align-items:center;gap:10px;border-radius:0 0 18px 18px}.aqInlineEditorRow td{padding:12px!important;background:rgba(var(--accent-rgb),.045)!important;white-space:normal!important}.aqInlineEditorRow:hover td{background:rgba(var(--accent-rgb),.045)!important}.aq .glass{position:relative;min-width:0;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 3px rgba(19,48,36,.045)}.aqHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px}.aqHead h3{margin:5px 0;font-size:29px;letter-spacing:-.055em}.aqHead p{margin:0;max-width:760px;color:var(--muted);font-size:12px;line-height:1.55}.aqActions{display:flex;gap:8px;flex-wrap:wrap}.aqBtn{min-height:42px;border:1px solid rgba(255,255,255,.78);background:rgba(255,255,255,.44);color:#264237;border-radius:13px;padding:10px 13px;font-size:11px;font-weight:900}.aqBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}.aqTabs{padding:6px;display:flex;gap:7px;flex-wrap:wrap}.aqTab{border:1px solid var(--line);background:#fff;color:#52625b;padding:9px 13px;border-radius:10px;font-size:12px;font-weight:750;min-height:40px}.aqTab.active{background:var(--accent-soft);border-color:rgba(var(--accent-rgb),.24);color:var(--accent2)}.aqFilters{padding:17px 18px}.aqGrid{display:grid;grid-template-columns:1fr .55fr .75fr 1.8fr;gap:10px}.aqField span,.aqLabel{display:block;font-size:10px;color:#6f7d75;font-weight:900;text-transform:none;letter-spacing:.055em;margin:0 0 6px 2px}.aqField input,.aqField select,.aqField textarea,.aqCat input,.aqCat select{width:100%;border:1px solid rgba(35,63,50,.12);border-radius:14px;background:rgba(255,255,255,.56);padding:11px 13px;font-size:13px;color:var(--ink);outline:none;min-height:46px}.aqField textarea{min-height:88px;resize:vertical}.aqMonths{display:grid;grid-template-columns:repeat(13,minmax(70px,1fr));gap:7px;overflow:auto;margin-top:6px}.aqMonths button{border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.34);border-radius:13px;padding:10px 8px;color:#506059;font-weight:850;font-size:11px;white-space:nowrap}.aqMonths .active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}.aqKpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.aqKpi .glass{padding:16px 17px}.aqKpi span{font-size:10px;color:#6c7a73;font-weight:900;text-transform:none}.aqKpi strong{display:block;font-size:27px;margin-top:5px}.aqKpi small{color:var(--muted);font-size:10px}.aqTable{overflow:hidden}.aqTableHead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)}.aqTableHead h4{margin:0;font-size:18px}.aqTableHead p{margin:4px 0 0;color:var(--muted);font-size:11px}.aqMeta{display:flex;gap:7px;flex-wrap:wrap}.aqPill{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.66);font-size:10px;font-weight:850}.aqPill.green{background:var(--accent-soft);color:var(--accent2);border:0}.aqNotice{padding:10px 17px;background:#fff8e7;color:#7b5d25;font-size:11px}.aqWrap{overflow:auto;max-height:calc(100vh - 330px);max-width:100%;width:100%;min-width:0;overscroll-behavior:contain}table.aqData{width:100%;max-width:100%;min-width:0;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:12px}table.aqData th,table.aqData td{padding:10px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:normal;overflow-wrap:anywhere;word-break:normal;vertical-align:top}table.aqData th{position:sticky;top:0;background:rgba(249,252,250,.94);font-size:9px;color:#748078;text-transform:none;z-index:3}table.aqData tbody tr{cursor:pointer}.aqName{font-weight:900;color:var(--accent2)}.aqSub{font-size:10px;color:var(--muted)}.aqStatus{padding:6px 9px;border-radius:999px;font-size:9px;font-weight:900;background:#eef1ef}.aqStatus.aktif{background:#e8f7ef;color:#216b49}.aqStatus.ready-for-review{background:#edf2ff;color:#4c5f98}.aqStatus.validated{background:var(--accent-soft);color:var(--accent2)}.aqLos,.aqFilled{font-weight:900;color:var(--accent2)}.aqEmpty{min-height:120px;display:grid;place-items:center;color:var(--muted);font-size:11px}.aqBack{position:fixed;inset:0;z-index:100;background:rgba(11,22,17,.24);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}.aqDrawer{height:100%;width:min(950px,96vw);background:rgba(248,251,249,.98);box-shadow:-24px 0 65px rgba(0,0,0,.18);display:flex;flex-direction:column}.aqWide{width:min(1180px,97vw)}.aqDHead{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:20px}.aqDHead h4{font-size:24px;margin:4px 0}.aqDHead p{margin:0;color:var(--muted);font-size:11px}.aqClose{width:38px;height:38px;border:0;background:#eceeed;border-radius:12px;font-size:22px}.aqBody{padding:18px 22px;overflow:auto;min-height:0;flex:1}.aqEpisode{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.aqDerived{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:13px 0}.aqDerived div{padding:11px 13px;background:#fff;border:1px solid var(--line);border-radius:14px}.aqDerived span{font-size:9px;color:var(--muted)}.aqDerived strong{display:block;margin-top:4px;font-size:13px}.aqGuard{padding:11px 13px;border-radius:14px;background:#e9f7ef;color:#1e6c43;font-size:11px;line-height:1.5}.aqSection{display:flex;justify-content:space-between;align-items:end;margin:15px 0 8px}.aqSection h5{margin:0;font-size:17px}.aqSection span{font-size:10px;color:var(--muted)}.aqInd{background:#fff;border:1px solid var(--line);border-radius:17px;margin:11px 0;overflow:hidden}.aqInd.hit{border-color:rgba(var(--accent-rgb),.3)}.aqIHead{padding:14px 15px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px}.aqIHead strong{font-size:13px;line-height:1.42}.aqMetaText{font-size:9px;color:var(--muted);margin-top:4px}.aqMatch{font-size:9px;background:var(--accent-soft);color:var(--accent2);padding:5px 7px;border-radius:999px;font-weight:900;white-space:nowrap}.aqIBody{padding:15px}.aqQ{font-size:16px;font-weight:900;line-height:1.42;margin-bottom:9px}.aqTwo{display:grid;grid-template-columns:1fr 1fr;gap:10px}.aqAuto{padding:11px 13px;background:#eef8f4;border:1px solid #dcefe7;border-radius:13px}.aqAuto span,.aqAuto small{display:block;font-size:9px;color:var(--muted)}.aqAuto strong{display:block;font-size:18px;color:var(--accent2)}.aqRadio{display:flex;gap:8px;flex-wrap:wrap}.aqRadio label{display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dadc;background:#fff;border-radius:12px;padding:10px 12px;font-size:12px;font-weight:800}.aqEvidence{border-top:1px dashed #d9dcda;margin-top:12px;padding-top:11px}.aqFoot{padding:13px 22px;border-top:1px solid var(--line);background:rgba(255,255,255,.82);display:flex;justify-content:space-between;align-items:center;gap:10px}.aqCat{padding:18px 22px;overflow:auto}.aqCatFilters{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;gap:9px;margin-bottom:12px}.aqCatWrap{overflow:auto;max-height:calc(100vh - 220px)}table.aqCatalog{width:100%;min-width:1100px;border-collapse:separate;border-spacing:0}table.aqCatalog th,table.aqCatalog td{font-size:10px;padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}table.aqCatalog th{font-size:8px;color:#748078;position:sticky;top:0;background:#f8fbf9}table.aqCatalog td:nth-child(4){white-space:normal;min-width:390px}.aqCatalog td:nth-child(8),.aqCatalog td:nth-child(9){white-space:normal;min-width:320px;max-width:520px}@media(max-width:1180px){.aqGrid{grid-template-columns:1fr 1fr 1fr}.aqGrid label:last-child{grid-column:1/-1}.aqEpisode{grid-template-columns:1fr 1fr}.aqCatFilters{grid-template-columns:1fr 1fr}.aqMonths{grid-template-columns:repeat(13,86px)}}@media(max-width:850px){.aqHead{display:block}.aqActions{margin-top:12px}.aqGrid{grid-template-columns:1fr 1fr}.aqKpi{grid-template-columns:1fr}.aqWrap{max-height:calc(100vh - 350px)}.aqDrawer,.aqWide{width:100%}.aqDerived{grid-template-columns:1fr}.aqTwo{grid-template-columns:1fr}.aqEpisode{grid-template-columns:1fr 1fr}.aqFoot{display:block}.aqCatFilters{grid-template-columns:1fr 1fr}}@media(max-width:560px){.aqGrid{grid-template-columns:1fr}.aqGrid label:last-child{grid-column:auto}.aqEpisode{grid-template-columns:1fr}.aqIHead{display:block}.aqMatch{display:inline-flex;margin-top:7px}.aqCatFilters{grid-template-columns:1fr}.aqMeta{margin-top:8px}}
`
function ymd(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getFullYear()}
function mon(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getMonth()+1}
function fmt(v:string){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
function los(a:string,b:string){if(!a)return 0;const x=new Date(a).getTime(),y=(b?new Date(b):new Date()).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.max(1,Math.ceil((y-x)/86400000)):0}
function tm(v:string){if(!/^\d\d:\d\d$/.test(v))return null;const[a,b]=v.split(':').map(Number);return a<24&&b<60?a*60+b:null}
function diff(a:string,b:string){const x=tm(a),y=tm(b);return x==null||y==null?null:y>=x?y-x:y+1440-x}
function hit(p:Profile,dx:string){const h=`${p.indicator_type} ${p.title}`.toLowerCase(),d=dx.toLowerCase();if(!h.includes('audit medis'))return false;const rules=[[/stroke|iskemik/,/stroke/],[/stemi|infark/,/stemi|killip|ekg/],[/tuberkulosis|tbc/,/tuberkulosis|sitb|oat/],[/sirosis/,/sirosis|varises/],[/ginjal|ckd|gagal ginjal/,/ginjal|dialisis|kt\/v/],[/diabetes|dm /,/diabetes|pedis|ankle|kaki/],[/carcinoma|kanker|mammae/,/mammae|mastektomi|imunohistokimia|tnm/],[/asfiksia|neonatus/,/asfiksia|apgar|vtp/],[/sectio|seksio|persalinan/,/sectio|menyusui|hemostasis/]];return rules.some(([a,b])=>(a as RegExp).test(d)&&(b as RegExp).test(h))}
function kind(p:Profile){return resolveMeasurementKind(p)}
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
 if(!r)return null
 const measurement=kind(p)
 if(measurement==='visit')return isWithinVisitWindow(p,String(r.time??''))
 if(measurement==='ratio'){
   if(r.numerator==null||r.denominator==null||Number(r.denominator)<=0||Number(r.numerator)<0||Number(r.numerator)>Number(r.denominator))return null
   const rate=Number(r.numerator)/Number(r.denominator)*100
   return compareToTarget(p,rate)
 }
 if(measurement==='door'){
   const duration=diff(String(r.start??''),String(r.end??''))
   return compareToTarget(p,duration,'<=')
 }
 if(measurement==='minutes')return compareToTarget(p,r.minutes,'<=')
 if(measurement==='numeric')return compareToTarget(p,r.value)
 return null
}
function displayTitle(p:Profile){return String(p.schema_json?.header_label??'').trim()||String(p.title??'').trim()||`Indikator ${p.code}`}
function normalizePastedDate(value:string):string|null{
 const v=String(value??'').trim()
 if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
  const d=new Date(v+'T00:00:00Z')
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v?v:null
 }
 const dmy=v.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/)
 if(dmy){
  const d=Number(dmy[1]),m=Number(dmy[2]),y=Number(dmy[3]),date=new Date(Date.UTC(y,m-1,d))
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null
 }
 if(/^\d{5}$/.test(v)){
  const serial=Number(v)
  if(serial>=20000&&serial<=80000)return new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10)
 }
 return null
}
function parsePastedNumber(value:string):number|null{
 let v=String(value??'').trim().replace(/\s/g,'')
 if(!v)return null
 if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v))v=v.replace(/\./g,'').replace(',','.')
 else v=v.replace(',','.')
 const n=Number(v)
 return Number.isFinite(n)?n:null
}
function parsePastedIndicator(p:Profile,raw:string):{response:Resp;matched:boolean}{
 const base=empty(p),norm=normalizeExactHeader(raw),opts=optionsFor(p)
 const exact=opts.find((o:any)=>normalizeExactHeader(o.label)===norm)
 if(exact)return {response:{...base,answer:String(exact.label),code:validResponseCode(exact.code)},matched:true}
 const coded=opts.filter((o:any)=>o.code!=null&&String(o.code)===raw.trim())
 if(coded.length===1)return {response:{...base,answer:String(coded[0].label),code:validResponseCode(coded[0].code)},matched:true}
 const k=kind(p)
 if(k==='ratio'){
  const m=raw.trim().match(/^([\d.,]+)\s*\/\s*([\d.,]+)$/)
  if(m){const numerator=parsePastedNumber(m[1]),denominator=parsePastedNumber(m[2]);if(numerator!=null&&denominator!=null&&denominator>0&&numerator>=0&&numerator<=denominator)return {response:{...base,numerator,denominator},matched:true}}
 }else if(k==='door'){
  const m=raw.trim().match(/(\d{1,2}:\d{2})\s*(?:-|–|—|→|to)\s*(\d{1,2}:\d{2})/i)
  if(m&&tm(m[1])!=null&&tm(m[2])!=null)return {response:{...base,start:m[1].padStart(5,'0'),end:m[2].padStart(5,'0')},matched:true}
 }else if(k==='visit'){
  if(/^\d{1,2}:\d{2}$/.test(raw.trim())&&tm(raw.trim())!=null)return {response:{...base,time:raw.trim().padStart(5,'0'),answer:'Ya',code:1},matched:true}
 }else if(k==='minutes'){
  const n=parsePastedNumber(raw);if(n!=null&&n>=0)return {response:{...base,minutes:n},matched:true}
 }else if(k==='numeric'){
  const n=parsePastedNumber(raw);if(n!=null)return {response:{...base,value:n},matched:true}
 }else if(k==='occurrence'){
  if(/^(terjadi|ya|ada|ditemukan)$/.test(norm))return {response:{...base,occurrence:'Terjadi',code:3},matched:true}
  if(/^(tidak terjadi|tidak|nihil|tidak ada|tidak ditemukan)$/.test(norm))return {response:{...base,occurrence:'Tidak terjadi',code:1},matched:true}
 }else{
  if(/^(sesuai|memenuhi|patuh|ya)$/.test(norm))return {response:{...base,answer:'Sesuai',code:1},matched:true}
  if(/^(tidak sesuai|tidak memenuhi|tidak patuh|tidak)$/.test(norm))return {response:{...base,answer:'Tidak sesuai',code:3},matched:true}
  if(/^(pengecualian|exception|alasan sah)$/.test(norm))return {response:{...base,answer:'Exception',code:2},matched:true}
 }
 return {response:{...base,notes:'Nilai sumber Excel perlu diverifikasi manual: '+raw},matched:false}
}
function validResponseCode(value:unknown):number|null{
 const n=Number(value)
 return Number.isInteger(n)&&n>=1&&n<=3?n:null
}
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
 const mapped=layout
  ? all.filter(p=>(layout.indicators??[]).some(h=>profileMatchesHeader(h,p)))
  : all
 const dynamic=all.filter(p=>p.is_active===true&&p.status==='published'&&p.schema_json?.oppe_dynamic===true)
 const result=[...mapped]
 const seen=new Set(result.map(p=>String(p.id??p.code)))
 dynamic.forEach(p=>{const id=String(p.id??p.code);if(!seen.has(id)){result.push(p);seen.add(id)}})
 return result
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
 const f=p.formData&&typeof p.formData==='object'?p.formData:{}
 const provider=String(f['Dokter']??'').trim(),clinic=String(f['Klinik']??'').trim()
 return String(p.name??'').trim()||String(f['Nama Mahasiswa']??'').trim()||String(f['Nama MPP']??'').trim()||String(f['Gangguan IT']??'').trim()||String(f['Insiden yang Terjadi']??'').trim()||String(f['Nama Pertemuan Ilmiah']??'').trim()||(provider&&clinic?`${provider} · ${clinic}`:'')||String(f['Alur layanan']??'').trim()||'Catatan logbook'
}
function primaryDateField(layout:AuditLayout|undefined){
 return layout?.fields.find(f=>/tanggal masuk|tanggal aduan|tanggal permintaan|tanggal keluhan|tanggal dilayani|tanggal audit|tanggal lapor|tanggal kunjungan|tanggal berkunjung|tanggal visite|tanggal pertemuan|tanggal mulai praktek|tanggal pelaporan/i.test(f))??layout?.fields.find(f=>/tanggal|date/i.test(f))
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

function grainLabel(grain:string){
 if(grain==='patient_episode')return'Per episode pasien'
 if(grain==='provider_day')return'Per dokter per hari'
 if(grain==='daily_metric')return'Angka harian'
 if(grain==='event')return'Per kejadian'
 if(grain==='activity')return'Per aktivitas'
 if(grain==='aggregate')return'Agregat'
 return'Catatan logbook'
}
function statusLabel(status:unknown){
 const s=String(status??'')
 if(s==='ready'||s==='Ready for Review')return'Siap ditinjau'
 if(s==='validated'||s==='Validated')return'Tervalidasi'
 if(s==='reopened'||s==='Reopened')return'Perlu perbaikan'
 if(s==='draft'||s==='Draft')return'Draf'
 if(s==='Aktif')return'Aktif'
 return s||'Draf'
}
export default function QualityIndicatorWorkspace({initialRoomId,rooms,isAdmin,isValidator=false,canViewAllRooms=false,initialContainer,showContainerTabs=true}:{initialRoomId:number|null;rooms:Room[];isAdmin:boolean;isValidator?:boolean;canViewAllRooms?:boolean;initialContainer?:(typeof CONTAINERS)[number];showContainerTabs?:boolean}){
 const [container,setContainer]=useState<(typeof CONTAINERS)[number]>(initialContainer&&CONTAINERS.includes(initialContainer)?initialContainer:CONTAINERS[0])
 const [year,setYear]=useState(2026)
 const [roomId,setRoomId]=useState<number|null>(initialRoomId??(isAdmin?null:rooms[0]?.id??null))
 const [monthFilter,setMonthFilter]=useState(0)
 const [status,setStatus]=useState('Semua')
 const [search,setSearch]=useState('')
 useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<{query?:string}>).detail;setSearch(String(detail?.query??''))};window.addEventListener('aureka:workspace-search',receive);return()=>window.removeEventListener('aureka:workspace-search',receive)},[])
 const [profiles,setProfiles]=useState<Profile[]>([])
 const [staffOptions,setStaffOptions]=useState<TeamStaffOption[]>([])
 const [patients,setPatients]=useState<Patient[]>([])
 const [selected,setSelected]=useState<Patient|null>(null)
 const [draft,setDraft]=useState<Record<string,Resp>>({})
 const [message,setMessage]=useState('')
 const [busy,setBusy]=useState(false)
 const [source,setSource]=useState('Memuat…')
 const [patientOpen,setPatientOpen]=useState(false)
 const [excelPasteOpen,setExcelPasteOpen]=useState(false)
 const [unitPickerOpen,setUnitPickerOpen]=useState(false)
 const [unitPickerRoomId,setUnitPickerRoomId]=useState('')

 const roomMap=useMemo(()=>new Map(rooms.map(r=>[Number(r.id),r.name])),[rooms])
 const activeLayout=useMemo(()=>getLayout(roomId),[roomId])
 const activeGrain=useMemo(()=>dominantGrain(profiles,activeLayout),[profiles,activeLayout])
 const selectedLayout=useMemo(()=>selected?getLayout(Number(selected.roomId)):activeLayout,[selected,activeLayout])
 const patientProfiles=useMemo(()=>layoutProfiles(profiles,activeLayout),[profiles,activeLayout])
 const summaryFields=useMemo(()=>{
   const fields=activeLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Diagnosa Tegak','DPJP']
   const patterns=[/nama pasien|nama mahasiswa|nama mpp|nama pelapor|nama tenaga|uraian temuan|insiden yang terjadi/i,/no\.? rekam medis|no\.? rm|kode laporan|kode insiden/i,/tanggal masuk|tanggal audit|tanggal aduan|tanggal kunjungan|tanggal permintaan|tanggal kejadian|tanggal laporan/i,/tanggal keluar|tanggal selesai/i,/diagnosa|diagnosis|jenis kejadian|jenis layanan|klinik|unit kerja|ruangan/i,/dpjp|dokter|petugas|penanggung jawab/i]
   const picked:string[]=[]
   for(const pattern of patterns){const match=fields.find(field=>pattern.test(field)&&!picked.includes(field));if(match&&picked.length<5)picked.push(match)}
   for(const field of fields){if(picked.length>=5)break;if(!picked.includes(field))picked.push(field)}
   return picked.slice(0,5)
 },[activeLayout])

 const load=useCallback(async()=>{
   setBusy(true)
   setMessage('')
   // Remove legacy PHI caches without reading or restoring their contents.
   if(typeof window!=='undefined'){try{window.localStorage.removeItem('aureka-quality-episode-cache-v3');window.localStorage.removeItem('aureka-quality-audit-v3')}catch{}}
   try{
     let pq=q().from('indicator_profiles').select('*').eq('profile_year',year).eq('status','published').eq('is_active',true).order('code')
     if(roomId!=null) pq=pq.eq('room_id',roomId)
     const {data:pd,error:pe}=await pq
     if(pe) throw pe
     setProfiles(pd??[])
     // Personnel fields are linked only to the locked roster for the current unit.
     const {data:assignmentRows,error:assignmentError}=await q().from('staff_team_assignments')
       .select('staff_id,room_id')
       .eq('assignment_status','active')
     if(assignmentError) throw assignmentError
     const assignedPairs=(assignmentRows??[]).filter((a:any)=>roomId==null||Number(a.room_id)===Number(roomId))
     const roomByStaff=new Map<string,number>(assignedPairs.map((a:any)=>[String(a.staff_id),Number(a.room_id)]))
     const assignedStaffIds=Array.from(roomByStaff.keys())
     const staffRows:TeamStaffOption[]=[]
     for(let offset=0;offset<assignedStaffIds.length;offset+=100){
       const batch=assignedStaffIds.slice(offset,offset+100)
       const {data:sd,error:staffError}=await q().from('staff_directory')
         .select('id,employee_code,display_name,profession_group,position_title,directory_status')
         .eq('directory_status','available')
         .in('id',batch)
         .order('display_name')
       if(staffError) throw staffError
       staffRows.push(...(sd??[]).map((s:any)=>({...s,id:String(s.id),room_id:Number(roomByStaff.get(String(s.id)))})))
     }
     setStaffOptions(staffRows)
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
     const attributionByRecord=new Map<string,Record<string,string>>()
     const databaseRecordIds=rows.map((r:any)=>String(r.id)).filter(Boolean)
     for(let offset=0;offset<databaseRecordIds.length;offset+=100){
       const batch=databaseRecordIds.slice(offset,offset+100)
       let attrFrom=0
       while(true){
         const {data:attributions,error:attributionError}=await q().from('quality_record_staff_attributions')
           .select('record_id,staff_id,field_key')
           .in('record_id',batch)
           .range(attrFrom,attrFrom+499)
         if(attributionError) throw attributionError
         ;(attributions??[]).forEach((a:any)=>{
           const key=String(a.record_id)
           if(!attributionByRecord.has(key)) attributionByRecord.set(key,{})
           attributionByRecord.get(key)![String(a.field_key)]=String(a.staff_id)
         })
         if(!attributions||attributions.length<500) break
         attrFrom+=500
       }
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
       return {id:String(r.id),recordId:String(r.id),roomId:rowRoom,unit,name,rm,sex:String(c.sex??formData['Jenis Kelamin']??''),age:c.age==null||c.age===''?null:Number(c.age),admit,discharge,diagnosis,dpjp,status:r.status==='ready'?'Ready for Review':r.status==='validated'?'Validated':r.status==='reopened'?'Reopened':r.status==='draft'?'Draft':String(c.workflow_status??c.status??(discharge?'Ready for Review':'Aktif')),databaseStatus:String(r.status??'draft'),reviewRequired:!!r.review_required,validationNote:String(r.validation_note??''),validatedBy:r.validated_by??null,validatedAt:r.validated_at??null,indicatorValues:(c.indicator_values??{}),formData,staffIdByField:attributionByRecord.get(String(r.id))??{},measurementGrain:String(r.measurement_grain??c.measurement_grain??'event'),source:'database',updatedAt:String(r.updated_at??r.created_at??'')}
     })
     setPatients(db)
     setSource('Supabase')
   }catch(e){
     setPatients([])
     setProfiles([])
     setSource('Supabase tidak tersedia')
     setMessage(`Data tidak dapat dimuat dari server. Tidak ada draf pasien yang dipulihkan dari browser. ${e instanceof Error?e.message:''}`.trim())
   }finally{setBusy(false)}
 },[roomId,roomMap,year])

 useEffect(()=>{void load()},[load])

 const filtered=useMemo(()=>patients.filter(p=>{
   const roomOk=roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId))
   const monthOk=!monthFilter||mon(p.admit)===monthFilter
   const hasStay=!!activeLayout?.fields.some(f=>normHeader(f)==='tanggal masuk')&&!!activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')
   const statusOk=status==='Semua'||(status==='Aktif'?(hasStay?!p.discharge:!['Ready for Review','Validated','Reopened'].includes(String(p.status))):p.status===status)
   const hay=`${p.name} ${p.rm} ${p.diagnosis} ${p.dpjp} ${p.unit} ${JSON.stringify(p.formData??{})}`.toLowerCase()
   return (ymd(p.admit)===year||(!p.admit&&p.source==='memory'&&!p.recordId))&&roomOk&&monthOk&&statusOk&&hay.includes(search.toLowerCase().trim())
 }),[patients,year,roomId,roomMap,monthFilter,status,search,activeLayout])
 const yearPatients=useMemo(()=>patients.filter(p=>(ymd(p.admit)===year||(!p.admit&&p.source==='memory'&&!p.recordId))&&(roomId==null||Number(p.roomId)===Number(roomId)||p.unit===roomMap.get(Number(roomId)))),[patients,year,roomId,roomMap])
 const unmatchedIndicatorHeaders=useMemo(()=>unmatchedHeaders(profiles,activeLayout),[profiles,activeLayout])
 const selectedUnmatchedHeaders=useMemo(()=>unmatchedHeaders(profiles,selectedLayout),[profiles,selectedLayout])
 const applicable=useMemo(()=>selected?layoutProfiles(profiles,selectedLayout).filter(p=>Number(p.room_id)===Number(selected.roomId)).sort((a,b)=>(hit(a,selected.diagnosis)?0:1)-(hit(b,selected.diagnosis)?0:1)||String(a.code).localeCompare(String(b.code),undefined,{numeric:true})):[],[selected,profiles,selectedLayout])
 const filledN=useMemo(()=>applicable.filter(p=>responseComplete(p,draft[p.id??p.code])).length,[applicable,draft])

 const openPatient=(p:Patient)=>{
   const r:any={}
   layoutProfiles(profiles,getLayout(Number(p.roomId))).forEach(x=>{r[x.id??x.code]=p.indicatorValues?.[x.code]??empty(x)})
   setSelected({...p})
   setDraft(r)
   setPatientOpen(true)
   setMessage('')
 }
 const newPatient=(requestedRoomId?:number)=>{
   if(isValidator){setMessage('Akun validator hanya dapat meninjau dan memvalidasi catatan yang dikirim unit.');return}
   const targetRoomId=requestedRoomId??roomId
   if(targetRoomId==null){setUnitPickerRoomId(rooms[0]?String(rooms[0].id):'');setUnitPickerOpen(true);return}
   const u=rooms.find(r=>Number(r.id)===Number(targetRoomId))
   const layout=getLayout(targetRoomId)
   const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()
   const formData:Record<string,any>={}
   ;(layout?.fields??[]).forEach(field=>{formData[field]=inputKind(field,layout)==='computed'?'':''})
   const dateField=primaryDateField(layout)
   if(dateField)formData[dateField]=today
   const grain=dominantGrain(profiles,layout)
   const admit=recordDateFrom(formData,layout,today)
   const selectedRecord={id:`LOCAL-${Date.now()}`,recordId:null,roomId:targetRoomId,unit:u?.name??'',name:String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??''),rm:String(formData['No. Rekam Medis']??formData['No. RM']??''),sex:String(formData['Jenis Kelamin']??''),age:null,admit,discharge:String(formData['Tanggal Keluar']??''),diagnosis:String(formData['Diagnosa Tegak']??formData['Diagnosa']??''),dpjp:String(formData['DPJP']??formData['Dpjp']??''),status:'Draft',indicatorValues:{},formData,staffIdByField:{},measurementGrain:grain,source:'local',updatedAt:null}
   setPatients(p=>[selectedRecord,...p.filter(x=>x.id!==selectedRecord.id)])
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
     if(normHeader(field)==='klinik'&&layout?.providerGroups?.length){const selectedClinic=layout.providerGroups.find(g=>g.clinic===String(value));if(!selectedClinic?.doctors.includes(String(formData['Dokter']??'')))formData['Dokter']=''}
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
 const setStaffField=(field:string,staffId:string)=>{
   const staff=staffOptions.find((item)=>item.id===staffId&&Number(item.room_id)===Number(selected?.roomId))
   setSelected((p:any)=>{
     if(!p)return p
     const formData={...(p.formData??{}),[field]:staff?.display_name??''}
     const staffIdByField={...(p.staffIdByField??{})}
     if(staff)staffIdByField[field]=staff.id
     else delete staffIdByField[field]
     return {...p,formData,staffIdByField,dpjp:/dpjp|dokter/i.test(field)?(staff?.display_name??''):p.dpjp}
   })
 }
 const setResp=(p:Profile,patch:Resp)=>{const k=String(p.id??p.code);setDraft(x=>({...x,[k]:{...(x[k]??empty(p)),...patch}}))}

  const importExcelRow=(values:Record<string,string>,sourceRow:number)=>{
   if(isValidator){setMessage('Akun validator hanya dapat meninjau dan memvalidasi catatan.');return}
   if(roomId==null||!activeLayout){setMessage('Pilih satu unit kerja sebelum menempelkan data Excel.');return}
   const unit=rooms.find(r=>Number(r.id)===Number(roomId))
   const formData:Record<string,any>={}
   const importWarnings:string[]=[]
   ;(activeLayout.fields??[]).forEach(field=>{
    const raw=String(values[field]??'').trim()
    if(!raw||isComputedField(field,activeLayout))return
    if(inputKind(field,activeLayout)==='date'){
     const normalized=normalizePastedDate(raw)
     if(!normalized){importWarnings.push('Tanggal pada kolom "'+field+'" di baris Excel '+sourceRow+' tidak dikenali dan dikosongkan.');return}
     formData[field]=normalized
    }else formData[field]=raw
   })
   const staffIdByField:Record<string,string>={}
   ;(activeLayout.fields??[]).filter(field=>isStaffNameField(field)).forEach(field=>{
    const raw=String(formData[field]??'').trim()
    if(!raw)return
    const matches=staffOptionsForField(field,roomId).filter(staff=>normalizeExactHeader(staff.display_name)===normalizeExactHeader(raw))
    if(matches.length===1)staffIdByField[field]=matches[0].id
    else importWarnings.push(matches.length?'Nama tenaga pada kolom "'+field+'" cocok dengan lebih dari satu tenaga; pilih ulang dari direktori.':'Nama tenaga pada kolom "'+field+'" belum terhubung ke direktori terkunci; verifikasi identitas sebelum menyimpan.')
   })
   const indicatorValues:Record<string,Resp>={}
   const rowProfiles=layoutProfiles(profiles,activeLayout).filter(p=>Number(p.room_id)===Number(roomId))
   for(const header of activeLayout.indicators??[]){
    const raw=String(values[header]??'').trim()
    if(!raw)continue
    const profile=rowProfiles.find(p=>profileMatchesHeader(header,p))
    if(!profile){importWarnings.push('Header indikator "'+header+'" belum terpetakan ke master aktif; nilai sumber tidak dihitung.');continue}
    const parsed=parsePastedIndicator(profile,raw)
    indicatorValues[String(profile.code)]=parsed.response
    if(!parsed.matched)importWarnings.push('Nilai "'+raw+'" pada indikator "'+header+'" tidak dapat dipetakan dengan aman; nilai dicatat untuk pemeriksaan manual.')
   }
   const dateField=primaryDateField(activeLayout)
   const dateValue=dateField?String(formData[dateField]??''):''
   const name=String(formData['Nama Pasien']??formData['Nama Mahasiswa']??formData['Nama MPP']??formData['Gangguan IT']??formData['Insiden yang Terjadi']??formData['Nama Pertemuan Ilmiah']??'').trim()
   const rm=String(formData['No. Rekam Medis']??formData['No. RM']??'').trim()
   if(!Object.values(formData).some(value=>String(value??'').trim())&&!Object.values(indicatorValues).some(filled)){
    setMessage('Baris Excel tidak memiliki nilai yang dapat digunakan. Periksa header dan isi baris sumber.');return
   }
   const draftPatient:Patient={id:'LOCAL-EXCEL-'+Date.now()+'-'+sourceRow,recordId:null,roomId,unit:unit?.name??'',name,rm,sex:String(formData['Jenis Kelamin']??''),age:null,admit:dateValue,discharge:String(formData['Tanggal Keluar']??''),diagnosis:String(formData['Diagnosa Tegak']??formData['Diagnosa']??''),dpjp:String(formData['DPJP']??formData['Dpjp']??''),status:'Draft',indicatorValues,formData,staffIdByField,measurementGrain:dominantGrain(profiles,activeLayout),source:'memory',updatedAt:null}
   setPatients(p=>[draftPatient,...p.filter(x=>x.id!==draftPatient.id)])
   const responseDraft:Record<string,Resp>={}
   rowProfiles.forEach(profile=>{responseDraft[String(profile.id??profile.code)]=indicatorValues[String(profile.code)]??empty(profile)})
   setSelected(draftPatient);setDraft(responseDraft);setPatientOpen(true);setExcelPasteOpen(false)
   setMessage('Baris Excel '+sourceRow+' dimuat ke formulir. Periksa seluruh header dan indikator sebelum menyimpan.'+(importWarnings.length?' '+importWarnings.join(' '):''))
 }

 const importExcelRows=(rows:{values:Record<string,string>;sourceRow:number}[])=>{
   if(!rows.length)return
   rows.slice().reverse().forEach(row=>importExcelRow(row.values,row.sourceRow))
   setExcelPasteOpen(false)
   setMessage(rows.length+' baris Excel dimuat sebagai draf sementara. Periksa tanggal, identitas tenaga, nilai indikator, serta setiap catatan yang perlu diverifikasi; simpan tiap baris ke server sebelum meninggalkan halaman.')
 }
 const save=async()=>{
   if(isValidator){setMessage('Akun validator tidak dapat mengubah data sumber. Gunakan tindakan validasi pada daftar logbook.');return}
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
   if(grain==='provider_day'&&(!String(formData['Klinik']??'').trim()||!String(formData['Dokter']??'').trim())){setMessage('Pilih klinik dan dokter untuk catatan harian rawat jalan.');return}
   if(grain==='provider_day'&&!recordDate){setMessage('Tanggal pengamatan wajib diisi.');return}
   const core={patient_name:normalizedName,medical_record_no:normalizedRm,sex:String(formData['Jenis Kelamin']??selected.sex??''),age:formData['Umur']??formData['Usia']??selected.age,admission_at:formData['Tanggal Masuk']??recordDate,discharge_at:discharge,diagnosis:normalizedDiagnosis,dpjp:normalizedDpjp,unit_name:selected.unit,room_id:selected.roomId,status:finalStatus,workflow_status:finalStatus,form_fields:formData,calculated_fields:calc,indicator_values:values,measurement_grain:grain,los_days:calc['Lenght of Stay']??calc['Length of Stay']??(stayLayout?los(String(formData['Tanggal Masuk']??''),discharge):null)}
   setBusy(true)
   let recordId=selected.recordId,backend=false
   try{
     const {data:{user}}=await sb.auth.getUser()
     if(!user) throw new Error('Sesi login tidak ditemukan.')
     const serviceStream=String(formData['Alur layanan']??'').trim()
     const subjectKey=grain==='provider_day'?`${selected.roomId}:${String(recordDate??'').slice(0,10)}:${String(formData['Klinik']??'').trim()}:${String(formData['Dokter']??'').trim()}`:grain==='daily_metric'?`${selected.roomId}:${String(recordDate??'').slice(0,10)}:${serviceStream||'semua-alur'}`:normalizedRm||`${selected.roomId}:${recordDate||now}:${selected.id}`
     const payload={room_id:selected.roomId,profile_year:year,measurement_grain:grain,record_date:recordDate?String(recordDate).slice(0,10):null,subject_key:subjectKey,subject_json:core,core_data:core,status:complete?'ready':'draft',review_required:complete,entered_by:user.id}
     if(!recordId&&['daily_metric','provider_day'].includes(grain)){
       const {data:existing,error:lookupError}=await q().from('quality_records').select('id').eq('room_id',selected.roomId).eq('profile_year',year).eq('measurement_grain',grain).eq('subject_key',subjectKey).neq('status','archived').limit(1).maybeSingle()
       if(lookupError)throw lookupError
       if(existing?.id){setBusy(false);setMessage(grain==='provider_day'?'Catatan untuk dokter, klinik, dan tanggal tersebut sudah ada. Buka catatan yang ada untuk memperbaruinya.':'Catatan harian untuk tanggal dan alur layanan tersebut sudah ada. Buka catatan yang ada untuk memperbaruinya.');return}
     }
     const obs=applicable.map(p=>{const r=values[p.code];if(!r||!p.id)return null;const code=Number(r.code);return{indicator_id:p.id,response_label:r.answer??r.occurrence??null,response_code:Number.isInteger(code)&&code>=1&&code<=3?code:null,raw_value:r,other_text:r.evidence??r.notes??null,review_status:r.answer==='Exception'?'pending':'not_required'}}).filter(Boolean)
     const attributionRows=Object.entries(selected.staffIdByField??{})
       .filter(([field,staffId])=>!!field&&!!staffId&&staffOptions.some((staff)=>staff.id===staffId&&Number(staff.room_id)===Number(selected.roomId)))
       .map(([field,staffId])=>({staff_id:staffId,field_key:field,attribution_type:/dpjp|dokter/i.test(field)?'responsible_provider':'related_provider'}))
     const {data:savedId,error:saveError}=await q().rpc('save_quality_logbook',{p_record_id:recordId&&/^[0-9a-f-]{36}$/i.test(String(recordId))?recordId:null,p_payload:payload,p_responses:obs,p_attributions:attributionRows})
     if(saveError)throw saveError
     if(!savedId)throw new Error('Server tidak mengembalikan identitas catatan yang tersimpan.')
     recordId=String(savedId)
     backend=true
   }catch(e){
     setSource('Supabase')
     setMessage(`Belum tersimpan ke server. Periksa koneksi dan isi formulir; draf tetap terbuka dan hanya berada di memori sampai penyimpanan berhasil. ${e instanceof Error?e.message:''}`.trim())
     setBusy(false)
     return
   }
    const saved:Patient={...selected,id:recordId??selected.id,name:normalizedName,rm:normalizedRm,admit:String(recordDate??selected.admit??''),discharge,diagnosis:normalizedDiagnosis,dpjp:normalizedDpjp,formData,staffIdByField:selected.staffIdByField??{},measurementGrain:grain,recordId:recordId??null,status:finalStatus,updatedAt:now,indicatorValues:values,source:backend?'database':'local'}
   setPatients(p=>[saved,...p.filter(x=>x.id!==selected.id&&(!(x.rm&&saved.rm)||x.rm!==saved.rm))])
   setSelected(saved);setPatientOpen(false);setMessage('Logbook berhasil disimpan ke server.');setBusy(false)
 }

 const indicatorEditor=(p:Profile)=>{
   const k=String(p.id??p.code),r=draft[k]??empty(p),kindNow=kind(p),isHit=hit(p,selected?.diagnosis??''),opts=optionsFor(p),title=displayTitle(p)
   const option=opts.find((x:any)=>String(x.label)===String(r.answer))
   const resultCode=r.code??option?.code??null
   const rateNow=r.denominator!=null&&Number(r.denominator)>0&&r.numerator!=null?Number(r.numerator)/Number(r.denominator)*100:null
   const metricMet=targetMet(p,r)
   const targetKinds=['ratio','visit','door','minutes','numeric'].includes(kindNow)
   const actualForTarget=kindNow==='ratio'?rateNow:kindNow==='door'?diff(String(r.start??''),String(r.end??'')):kindNow==='minutes'?r.minutes:kindNow==='numeric'?r.value:kindNow==='visit'?r.time:null
   const resultLabel=targetKinds?(actualForTarget==null||actualForTarget===''?'Belum dihitung':metricMet==null?'Target belum dapat dinilai':metricMet?'Memenuhi target':'Belum memenuhi target'):resultCode===1?'Memenuhi / Sesuai':resultCode===2?'Pengecualian / Perlu review':resultCode===3?'Tidak memenuhi / Tidak sesuai':(option?.code==null&&r.answer)?'Perlu review':'Belum tervalidasi'
   const commonEvidence=<details className="aqEvidence"><summary>Bukti & catatan audit</summary><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Sumber bukti</span><input disabled={isValidator} value={r.evidence??''} onChange={(e:any)=>setResp(p,{evidence:e.target.value})} placeholder="RME / RM / hasil observasi…"/></label><label className="aqField"><span>Referensi / lokasi data</span><input disabled={isValidator} value={r.reference??''} onChange={(e:any)=>setResp(p,{reference:e.target.value})} placeholder="No. dokumen / waktu / lokasi…"/></label></div><label className="aqField" style={{marginTop:10}}><span>Catatan</span><textarea disabled={isValidator} value={r.notes??''} onChange={(e:any)=>setResp(p,{notes:e.target.value})} placeholder="Catatan audit bila diperlukan…"/></label></details>
   const genericOptions=opts.length>0&&!['ratio','visit','door','minutes','numeric'].includes(kindNow)
   return <article className={`aqInd ${isHit?'hit':''}`} key={k}><div className="aqIHead"><div><strong>{p.code} · {title}</strong><div className="aqMetaText">{p.unit_name} · {p.indicator_type||'Indikator Mutu'} · Target {p.target_text||'—'} · {grainLabel(String(p.measurement_grain))}</div>{String(p.title??'').trim()&&String(p.title??'').trim()!==title&&<div className="aqMetaText">Nama master: {p.title}</div>}</div>{isHit&&<span className="aqMatch">Relevan dengan diagnosis</span>}</div><div className="aqIBody"><div className="aqQ">{kindNow==='visit'?'Apakah waktu visite memenuhi jendela waktu yang ditetapkan pada master indikator?':kindNow==='door'?'Berapa durasi dari pasien tiba sampai keputusan medis definitif?':kindNow==='minutes'?'Berapa waktu aktual yang diukur untuk indikator ini (menit)?':kindNow==='numeric'?'Berapa nilai numerik indikator pada episode pasien ini?':kindNow==='ratio'?'Masukkan jumlah pembilang dan penyebut dari pengukuran pada periode ini.':`Bagaimana hasil validasi ${title} pada pasien ini?`}</div>{(String(p.numerator_definition??'').trim()||String(p.denominator_definition??'').trim())&&<details className="aqEvidence"><summary>Definisi operasional & rumus indikator</summary><div className="aqMetaText" style={{marginTop:8,whiteSpace:'normal'}}><b>Pembilang (N):</b> {p.numerator_definition||'Belum tersedia pada master sumber.'}</div><div className="aqMetaText" style={{marginTop:8,whiteSpace:'normal'}}><b>Penyebut (D):</b> {p.denominator_definition||'Belum tersedia pada master sumber.'}</div></details>}{(!String(p.numerator_definition??'').trim()||!String(p.denominator_definition??'').trim())&&<div className="aqNotice" style={{marginTop:10}}>Detail pembilang/penyebut pada master belum lengkap; jangan mengisi definisi berdasarkan perkiraan.</div>}
     {kindNow==='ratio'&&<><div className="aqTwo"><label className="aqField"><span>Pembilang (N)</span><input disabled={isValidator} type="number" min="0" step="1" value={r.numerator??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value);setResp(p,{numerator:v})}} placeholder="Jumlah yang memenuhi definisi"/></label><label className="aqField"><span>Penyebut (D)</span><input disabled={isValidator} type="number" min="0" step="1" value={r.denominator??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value);setResp(p,{denominator:v})}} placeholder="Jumlah seluruh yang diamati"/></label></div><div className="aqAuto" style={{marginTop:10}}><span>Hasil perhitungan otomatis</span><strong>{rateNow==null?'Menunggu pembilang dan penyebut':`${rateNow.toFixed(2)}%`}</strong><small>{rateNow==null?'Penyebut harus lebih besar dari nol.':`Target ${p.target_text||'—'} · ${metricMet==null?'Periksa target pada master':metricMet?'Memenuhi target':'Belum memenuhi target'}`}</small></div></>}
     {kindNow==='visit'&&<><div className="aqTwo" style={{marginTop:10}}><label className="aqField"><span>Waktu visite aktual</span><input disabled={isValidator} type="time" value={r.time??''} onChange={(e:any)=>{const value=e.target.value,met=isWithinVisitWindow(p,value);setResp(p,{time:value,answer:met==null?'':met?'Ya':'Tidak',code:met==null?null:met?1:3})}}/></label><div className="aqAuto"><span>Hasil otomatis</span><strong>{r.time?(metricMet==null?'Target belum ditentukan':metricMet?'Memenuhi target':'Tidak memenuhi target'):'Belum dihitung'}</strong><small>Target {p.target_text||'belum ditetapkan pada master'}</small></div></div></>}
     {kindNow==='door'&&<><div className="aqTwo"><label className="aqField"><span>Waktu pasien tiba</span><input disabled={isValidator} type="time" value={r.start??''} onChange={(e:any)=>{const value=e.target.value,met=targetMet(p,{...r,start:value});setResp(p,{start:value,code:met==null?null:met?1:3})}}/></label><label className="aqField"><span>Waktu keputusan medis</span><input disabled={isValidator} type="time" value={r.end??''} onChange={(e:any)=>{const value=e.target.value,met=targetMet(p,{...r,end:value});setResp(p,{end:value,code:met==null?null:met?1:3})}}/></label></div><div className="aqAuto" style={{marginTop:10}}><span>Durasi otomatis</span><strong>{r.start&&r.end&&diff(r.start,r.end)!=null?`${diff(r.start,r.end)} menit`:'Belum dihitung'}</strong><small>Target {p.target_text||'belum ditetapkan pada master'}</small></div></>}
     {kindNow==='minutes'&&<div className="aqTwo"><label className="aqField"><span>Waktu aktual (menit)</span><input disabled={isValidator} type="number" min="0" value={r.minutes??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value),met=targetMet(p,{...r,minutes:v});setResp(p,{minutes:v,code:met==null?null:met?1:3})}}/></label><div className="aqAuto"><span>Interpretasi</span><strong>{r.minutes==null?'Belum diisi':metricMet==null?'Target perlu dilengkapi':metricMet?'Memenuhi target':'Tidak memenuhi target'}</strong></div></div>}
     {kindNow==='numeric'&&<label className="aqField"><span>Nilai indikator</span><input disabled={isValidator} type="number" step="0.01" value={r.value??''} onChange={(e:any)=>{const v=e.target.value===''?null:Number(e.target.value),met=targetMet(p,{...r,value:v});setResp(p,{value:v,code:met==null?null:met?1:3})}}/></label>}
     {kindNow==='occurrence'&&!genericOptions&&<div className="aqRadio"><label><input disabled={isValidator} type="radio" checked={r.occurrence==='Tidak terjadi'} onChange={()=>setResp(p,{occurrence:'Tidak terjadi',code:1})}/> Tidak terjadi</label><label><input disabled={isValidator} type="radio" checked={r.occurrence==='Terjadi'} onChange={()=>setResp(p,{occurrence:'Terjadi',code:3})}/> Terjadi</label></div>}
     {genericOptions&&<div className="aqRadio">{opts.map((o:any,i:number)=><label key={`${k}-opt-${i}`}><input disabled={isValidator} type="radio" name={`ind-${k}`} checked={r.answer===o.label} onChange={()=>setResp(p,{answer:o.label,code:o.code??null})}/><span>{o.label}</span></label>)}</div>}
     {!genericOptions&&kindNow==='compliance'&&<div className="aqRadio"><label><input disabled={isValidator} type="radio" checked={r.answer==='Sesuai'} onChange={()=>setResp(p,{answer:'Sesuai',code:1})}/> Sesuai</label><label><input disabled={isValidator} type="radio" checked={r.answer==='Exception'} onChange={()=>setResp(p,{answer:'Exception',code:2})}/> Justified Exception</label><label><input disabled={isValidator} type="radio" checked={r.answer==='Tidak sesuai'} onChange={()=>setResp(p,{answer:'Tidak sesuai',code:3})}/> Tidak sesuai</label></div>}
     {r.answer==='Lainnya — tuliskan alasan/temuan'&&<label className="aqField" style={{marginTop:10}}><span>Alasan / temuan wajib</span><textarea disabled={isValidator} value={r.notes??''} onChange={(e:any)=>setResp(p,{notes:e.target.value})} placeholder="Tuliskan alasan/temuan untuk review superadmin…"/></label>}
     <div className="aqAuto" style={{marginTop:10}}><span>Hasil validasi indikator</span><strong>{resultLabel}</strong><small>{responseComplete(p,r)?'Respons lengkap':'Belum lengkap'}</small></div>
     {commonEvidence}
   </div></article>
 }

 const reviewRecord=async(p:Patient,decision:'validated'|'reopened')=>{
   if(!isValidator){setMessage('Hanya akun validator yang dapat melakukan validasi unit.');return}
   const id=String(p.recordId??p.id??'')
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){setMessage('Catatan ini belum tersimpan di server sehingga tidak dapat divalidasi.');return}
   if(!['Ready for Review','Reopened'].includes(String(p.status))){setMessage('Hanya catatan siap ditinjau atau yang dikembalikan yang dapat diproses.');return}
   setBusy(true);setMessage('')
   const {error}=await q().rpc('aureka_validator_review_quality_record',{p_record_id:id,p_decision:decision,p_note:decision==='reopened'?'Dikembalikan oleh validator untuk perbaikan.':null})
   if(error){setBusy(false);setMessage(/FORBIDDEN/i.test(error.message)?'Akses validasi ditolak. Pastikan akun memiliki role Validator dan unit yang sesuai.':`Gagal memproses validasi: ${error.message}`);return}
   await load()
   setMessage(decision==='validated'?'Catatan mutu berhasil divalidasi.':'Catatan dikembalikan untuk perbaikan oleh PIC.')
 }
 const isStaffNameField=(field:string)=>/(dpjp|dokter|perawat|bidan|petugas|penanggung jawab|radiografer|analis|atlm|terapis|apoteker|nutrisionis|dietisien|pemeriksa|pelaksana)/i.test(field)
 const staffOptionsForField=(field:string,targetRoomId:number|null|undefined=selected?.roomId)=>{
   const options=staffOptions.filter((staff)=>Number(staff.room_id)===Number(targetRoomId))
   const n=normHeader(field)
   if(/dokter|dpjp/.test(n))return options.filter((staff)=>/dokter/.test(staff.profession_group.toLowerCase())||/dokter|sp\./i.test(staff.position_title))
   if(/perawat/.test(n))return options.filter((staff)=>staff.profession_group==='Perawat')
   if(/bidan/.test(n))return options.filter((staff)=>staff.profession_group==='Bidan')
   if(/apoteker|farmasi/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga kefarmasian')
   if(/radiografer|radiologi/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga radiologi')
   if(/analis|atlm|laboratorium/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga laboratorium')
   if(/terapis|fisioterapi/.test(n))return options.filter((staff)=>staff.profession_group==='Fisioterapi/terapi okupasi')
   if(/nutrisionis|dietisien|gizi/.test(n))return options.filter((staff)=>staff.profession_group==='Tenaga gizi')
   return options
 }
 const renderLogbookField=(field:string,i:number)=>{
   const kindNow=inputKind(field,selectedLayout),raw=inputFieldValue(selected??{},field,selectedLayout),wide=kindNow==='textarea'||field.length>66
   const groups=selectedLayout?.providerGroups??[]
   const currentClinic=String(selected?.formData?.['Klinik']??'')
   const staffField=isStaffNameField(field)&&kindNow!=='computed'
   const staffCandidates=staffField?staffOptionsForField(field):[]
   const selectedStaffId=String(selected?.staffIdByField?.[field]??'')
   return <label key={field+'-'+i} className="aqField" style={wide?{gridColumn:'1/-1'}:undefined}>
     <span>{field}{kindNow==='computed'?' · otomatis':''}{staffField?' · direktori AUREKA':''}</span>
     {kindNow==='computed'
       ? <div className="aqAuto"><strong>{raw==null||raw===''?'Menunggu data':typeof raw==='number'&&/length of stay|lenght of stay|los/i.test(field)?String(raw)+' hari':normHeader(field)==='lamanya tindak lanjut'?String(raw)+' hari':normHeader(field)==='kecepatan respon menit'?String(raw)+' menit':String(raw)}</strong><small>Dihitung otomatis dari tanggal atau waktu terkait</small></div>
       : staffField
         ? <><select disabled={isValidator} value={selectedStaffId} onChange={(e:any)=>setStaffField(field,e.target.value)}>
             <option value="">{selectedStaffId?'Identitas belum tersedia di roster unit':'Pilih tenaga yang terkunci pada tim ini…'}</option>
             {staffCandidates.map((staff)=><option key={staff.id} value={staff.id}>{staff.display_name} — {staff.employee_code} · {staff.profession_group}</option>)}
           </select>
           <small className="aqMetaText">{selectedStaffId?'Identitas terhubung ke staff_id AUREKA.':raw?'Catatan lama: '+String(raw)+'. Pilih identitas kanonik untuk mengikat nama ke direktori.':staffCandidates.length?'Nama hanya dapat dipilih dari roster unit yang terkunci.':'Belum ada anggota roster yang cocok pada unit ini; tetapkan tenaga melalui area Tenaga Klinis.'}</small></>
         : kindNow==='textarea'
           ? <textarea disabled={isValidator} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)} placeholder={'Isi '+field.toLowerCase()+'…'}/>
           : kindNow==='select'&&normHeader(field)==='klinik'
             ? <select disabled={isValidator} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)}><option value="">Pilih klinik</option>{groups.map(g=><option key={g.clinic} value={g.clinic}>{g.clinic}</option>)}</select>
             : <input disabled={isValidator} type={kindNow==='date'?'date':kindNow==='time'?'time':kindNow==='number'?'number':'text'} step={kindNow==='number'?'any':undefined} value={String(raw??'')} onChange={(e:any)=>setField(field,e.target.value)} placeholder={'Isi '+field.toLowerCase()+'…'}/>
     }
   </label>
 }

   const renderPatientEditor=()=>selected&&patientOpen?<section className="glass aqInlineEditor" role="region" aria-label={`Logbook ${recordTitle(selected)}`}><div className="aqDHead"><div><div className="eyebrow">LOGBOOK · {selected.unit}</div><h4>{recordTitle(selected)}</h4><p>{selected.rm? `No. RM ${selected.rm} · `:''}{selected.admit?fmt(selected.admit):'Tanggal pencatatan belum diisi'}{selected.diagnosis? ` · ${selected.diagnosis}`:''}</p></div><button className="aqClose" onClick={()=>!busy&&setPatientOpen(false)}>×</button></div><div className="aqBody">
      <div className="aqNotice" style={{marginBottom:12}}>Kolom data mengikuti header Excel yang tidak berwarna hijau. Indikator berwarna hijau diisi pada bagian terpisah. Nilai turunan seperti lama rawat, umur, durasi tindak lanjut, dan kecepatan respons dihitung otomatis jika data pendukung tersedia.</div>
      <div className="aqEpisode">{(selectedLayout?.fields??['Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Length of Stay','Diagnosa Tegak','DPJP']).map(renderLogbookField)}</div>
      <div className="aqDerived"><div><span>Metode pencatatan</span><strong>{grainLabel(String(selected.measurementGrain??dominantGrain(profiles,selectedLayout)))}</strong></div><div><span>Tanggal pencatatan</span><strong>{recordDateFrom(selected.formData??{},selectedLayout,String(selected.admit??''))?fmt(String(recordDateFrom(selected.formData??{},selectedLayout,String(selected.admit??'')) )):'—'}</strong></div><div><span>Kelengkapan indikator hijau</span><strong>{filledN}/{applicable.length} terisi</strong></div></div>
      <div className="aqSection"><h5>Indikator mutu (header hijau)</h5><span>{filledN} dari {applicable.length} terisi</span></div>
      {selectedLayout&&!selectedLayout.indicators.length&&<div className="aqNotice">Layout Excel untuk unit ini belum mencantumkan header indikator berwarna hijau.</div>}
      {applicable.map(indicatorEditor)}{selectedUnmatchedHeaders.map((header,i)=><article className="aqInd" key={`unmapped-${selected.roomId}-${i}-${header}`}><div className="aqIHead"><div><strong>{header}</strong><div className="aqMetaText">Header hijau dari Header Aureka.xlsx · indikator belum terpetakan ke master aktif</div></div></div><div className="aqIBody"><div className="aqNotice">Profil ini belum memiliki pasangan aktif dengan target dan definisi operasional yang tervalidasi. Isian angka/hasil indikator belum diaktifkan agar tidak menghasilkan perhitungan mutu yang keliru.</div></div></article>)}{!applicable.length&&!selectedUnmatchedHeaders.length&&<div className="aqEmpty">Belum ada indikator hijau pada layout unit ini.</div>}
    </div><div className="aqFoot"><span style={{fontSize:11,color:'var(--muted)'}}>{isValidator?'Mode baca saja. Validasi dilakukan dari daftar logbook setelah memeriksa data.':`${source} · seluruh field logbook dan respons indikator disimpan sebagai satu catatan.`}</span><div style={{display:'flex',gap:8}}><button className="aqBtn" onClick={()=>!busy&&setPatientOpen(false)}>Tutup</button>{!isValidator&&<button className="aqBtn primary" onClick={save} disabled={busy}>{busy?'Menyimpan…':'Simpan logbook'}</button>}</div></div></section>:null

  return <div className="aq">
   <style dangerouslySetInnerHTML={{__html:CSS}}/>
   {showContainerTabs&&<nav className="glass aqTabs">{CONTAINERS.map(x=><button key={x} className={`aqTab ${container===x?'active':''}`} onClick={()=>setContainer(x)}>{x}</button>)}</nav>}
   {container==='Audit Klinis dan Kematian'?<ClinicalDeathAuditWorkspace initialRoomId={initialRoomId} rooms={rooms} isAdmin={isAdmin||canViewAllRooms} isValidator={isValidator}/>:<>
     <section className="glass aqFilters"><div className="aqGrid"><label className="aqField"><span>Unit</span><select value={roomId??''} disabled={!isAdmin} onChange={(e:any)=>setRoomId(e.target.value?Number(e.target.value):null)}>{isAdmin&&<option value="">Semua Unit</option>}{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="aqField"><span>Tahun</span><select value={year} onChange={(e:any)=>setYear(Number(e.target.value))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></label><label className="aqField"><span>Status</span><select value={status} onChange={(e:any)=>setStatus(e.target.value)}>{STATUS.map(s=><option key={s} value={s}>{s==='Aktif'?(activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Aktif (belum pulang)':'Aktif / belum selesai'):s==='Draft'?'Draf':s==='Ready for Review'?'Siap ditinjau':s==='Validated'?'Tervalidasi':s}</option>)}</select></label><label className="aqField aqLocalSearch"><span>Pencarian</span><input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Nama / No. RM / diagnosis / DPJP…"/></label></div><div style={{marginTop:12}}><div className="aqLabel">Bulan Pengamatan</div><div className="aqMonths"><button className={!monthFilter?'active':''} onClick={()=>setMonthFilter(0)}>Semua Bulan</button>{MONTHS.map((m,i)=><button key={m} className={monthFilter===i+1?'active':''} onClick={()=>setMonthFilter(i+1)}>{m}</button>)}</div></div></section>
      {!isValidator&&<div className="aqActions" style={{justifyContent:'flex-end'}}><button className="aqBtn" onClick={()=>setExcelPasteOpen(v=>!v)} aria-expanded={excelPasteOpen}>{excelPasteOpen?'Tutup impor Excel':'Tempel dari Excel'}</button></div>}
      {!isValidator&&excelPasteOpen&&<QualityExcelPastePanel key={roomId??'all'} headers={[...(activeLayout?.fields??[]),...(activeLayout?.indicators??[])]} disabledReason={roomId==null?'Pilih satu unit pada filter sebelum mengimpor.':!activeLayout?'Layout header aktif untuk unit ini belum tersedia.':''} onUseRow={importExcelRow} onUseRows={importExcelRows} onClose={()=>setExcelPasteOpen(false)}/>}
      <section className="aqKpi"><div className="glass"><span>{activeGrain==='patient_episode'?'Total episode pasien':activeGrain==='daily_metric'?'Catatan harian':activeGrain==='provider_day'?'Catatan dokter per hari':activeGrain==='event'?'Total kejadian':activeGrain==='activity'?'Total aktivitas':'Total catatan logbook'}</span><strong>{yearPatients.length}</strong><small>Catatan pada tahun {year}</small></div><div className="glass"><span>{activeGrain==='patient_episode'&&activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Pasien masih dirawat':activeGrain==='provider_day'?'Catatan dengan dokter':activeGrain==='daily_metric'?'Catatan harian dengan data':activeGrain==='event'?'Kejadian belum selesai':'Catatan dengan data'}</span><strong>{activeGrain==='patient_episode'&&activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?yearPatients.filter(p=>!p.discharge).length:activeGrain==='provider_day'?yearPatients.filter(p=>String(p.formData?.['Dokter']??'').trim()).length:activeGrain==='daily_metric'?yearPatients.filter(p=>Object.values(p.formData??{}).some(v=>v!==''&&v!=null)||(Object.values(p.indicatorValues??{}) as Resp[]).some(filled)).length:activeGrain==='event'?yearPatients.filter(p=>!/(selesai|ditutup|closed|ready for review|validated)/i.test(String(p.status??''))).length:yearPatients.filter(p=>Object.values(p.formData??{}).some(v=>v!==''&&v!=null)).length}</strong><small>{activeGrain==='patient_episode'&&activeLayout?.fields.some(f=>normHeader(f)==='tanggal keluar')?'Belum memiliki tanggal keluar':activeGrain==='provider_day'?'Setiap catatan mewakili satu dokter pada satu tanggal':activeGrain==='daily_metric'?'Data numerik harian dari indikator yang dipilih':'Berdasarkan data logbook unit'}</small></div><div className="glass"><span>Catatan dengan indikator terisi</span><strong>{yearPatients.filter(p=>(Object.values(p.indicatorValues??{}) as Resp[]).some(filled)).length}</strong><small>Memiliki minimal satu respons indikator mutu</small></div></section>
     <section className="glass aqTable"><div className="aqTableHead"><div><h4>Logbook {roomId===1?'aduan':activeGrain==='patient_episode'?'pasien':activeGrain==='provider_day'?'dokter per hari':activeGrain==='daily_metric'?'harian':activeGrain==='event'?'kejadian':activeGrain==='activity'?'aktivitas':'unit'}</h4><p>Daftar ringkas untuk menjaga tabel tetap terbaca. Buka satu baris untuk melihat dan mengubah seluruh detail.</p></div><div className="aqMeta"><span className="aqPill green">{filtered.length} catatan</span><span className="aqPill">{patientProfiles.length} indikator</span><span className="aqPill green">{source}</span>{!isValidator&&<button className="aqBtn primary" disabled={busy} onClick={()=>newPatient()}>＋ Tambah catatan</button>}</div></div>{message&&<div className="aqNotice">{message}</div>}{activeLayout&&!activeLayout.indicators.length&&<div className="aqNotice">Pada layout unit ini tidak ditemukan header indikator berwarna hijau. Data logbook tetap dapat dicatat menggunakan header data yang tersedia.</div>}{unmatchedIndicatorHeaders.length>0&&<div className="aqNotice">{unmatchedIndicatorHeaders.length} header hijau belum mempunyai profil indikator aktif di master: {unmatchedIndicatorHeaders.join(' · ')}. Header tetap ditampilkan saat catatan dibuka, tetapi belum dapat dihitung sebagai indikator sampai master dilengkapi.</div>}<div className="aqWrap"><table className="aqData"><thead><tr><th>No.</th>{summaryFields.map((field,i)=><th key={field+'-'+i}>{field}</th>)}<th>Indikator terisi</th><th>Status</th>{isValidator&&<th>Tindakan validasi</th>}</tr></thead><tbody>{filtered.map((p:any,i:number)=>{const rowProfiles=layoutProfiles(profiles,getLayout(Number(p.roomId))).filter(x=>Number(x.room_id)===Number(p.roomId)),total=rowProfiles.length,count=rowProfiles.filter(x=>responseComplete(x,p.indicatorValues?.[x.code])).length;return <Fragment key={`${p.id}-${p.rm||i}`}><tr tabIndex={0} aria-expanded={patientOpen&&String(selected?.id)===String(p.id)} onClick={()=>{if(patientOpen&&String(selected?.id)===String(p.id)){setPatientOpen(false)}else{openPatient(p)}}} onKeyDown={(e:any)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(patientOpen&&String(selected?.id)===String(p.id)){setPatientOpen(false)}else{openPatient(p)}}}}><td>{i+1}</td>{summaryFields.map((field,j)=><td key={field+'-'+j}>{String(fieldValue(p,field,getLayout(Number(p.roomId)))??'')||'—'}</td>)}<td><span className="aqFilled">{count}/{total}</span></td><td><span className={`aqStatus ${String(p.status).toLowerCase().replaceAll(' ','-')}`}>{statusLabel(p.status)}</span></td>{isValidator&&<td><div style={{display:'flex',gap:6}}>{['Ready for Review','Reopened'].includes(String(p.status))&&p.source==='database'?<><button className="aqBtn primary" disabled={busy} onClick={(e:any)=>{e.stopPropagation();void reviewRecord(p,'validated')}}>Validasi</button><button className="aqBtn" disabled={busy} onClick={(e:any)=>{e.stopPropagation();void reviewRecord(p,'reopened')}}>Kembalikan</button></>:<span className="aqMetaText">{p.status==='Validated'?'Sudah divalidasi':p.status==='Draft'?'Menunggu kelengkapan':'Tidak ada tindakan'}</span>}</div></td>}</tr>{patientOpen&&selected&&String(selected.id)===String(p.id)&&<tr className="aqInlineEditorRow" onClick={(event:any)=>event.stopPropagation()}><td colSpan={summaryFields.length+3+(isValidator?1:0)}>{renderPatientEditor()}</td></tr>}</Fragment>})}{!filtered.length&&<tr><td colSpan={summaryFields.length+3+(isValidator?1:0)}><div className="aqEmpty">{busy?'Memuat data logbook…':'Belum ada catatan pada unit/periode ini. Gunakan Tambah catatan atau Tempel dari Excel.'}</div></td></tr>}</tbody></table></div></section></>}

   {unitPickerOpen&&<div className="aqBack" onClick={(e:any)=>{if(e.target===e.currentTarget)setUnitPickerOpen(false)}}><section className="aqDrawer" role="dialog" aria-modal="true" aria-label="Pilih unit untuk catatan baru"><div className="aqDHead"><div><div className="eyebrow">Logbook mutu</div><h4>Pilih unit kerja</h4><p>Catatan baru harus terikat pada satu unit agar master indikator dan kewenangan tersaring dengan benar.</p></div><button className="aqClose" onClick={()=>setUnitPickerOpen(false)} aria-label="Tutup">×</button></div><div className="aqBody"><label className="aqField"><span>Unit kerja</span><select value={unitPickerRoomId} onChange={(e:any)=>setUnitPickerRoomId(e.target.value)}><option value="">Pilih unit…</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><div className="aqFoot" style={{margin:'18px -22px -18px'}}><span className="aqMetaText">Pilih unit terlebih dahulu untuk membuka formulir catatan.</span><button className="aqBtn primary" disabled={!unitPickerRoomId||busy} onClick={()=>{const id=Number(unitPickerRoomId);setUnitPickerOpen(false);if(Number.isFinite(id)&&id>0)newPatient(id)}}>Buat catatan</button></div></div></section></div>}

 </div>
}
