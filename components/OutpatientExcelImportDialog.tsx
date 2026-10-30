'use client'

import { useCallback, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import type { OutpatientProviderGroup } from '@/lib/aureka/outpatient-logbook'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = 25
const SOURCE_PREFIX = 'excel-pmkp-rawat-jalan-2026:'

type Layout = { roomId: number; fields: string[]; providerGroups?: OutpatientProviderGroup[] }
type PreparedRow = { sourceRow:number; date:string; clinic:string; doctor:string; waitingMinutes:number }
type Props = { open:boolean; roomId:number|null; year:number; authorized:boolean; layout?:Layout; onClose:()=>void; onImported:(summary:{imported:number;skipped:number;received:number})=>void|Promise<void> }

function validDate(y:number,m:number,d:number):string|null {
  const date=new Date(Date.UTC(y,m-1,d))
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null
}
function normalizeDate(value:unknown):string|null {
  if(value instanceof Date)return validDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate())
  const raw=String(value??'').trim()
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if(iso)return validDate(Number(iso[1]),Number(iso[2]),Number(iso[3]))
  const dmy=raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/)
  if(dmy)return validDate(Number(dmy[3]),Number(dmy[2]),Number(dmy[1]))
  if(/^\d+(?:[.,]\d+)?$/.test(raw)){
    const serial=Number(raw.replace(',','.'))
    if(serial<20000||serial>80000)return null
    return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10)
  }
  return null
}
function readCell(cell:any):unknown {
  const value=cell?.value
  if(value==null)return ''
  if(value instanceof Date)return value
  if(typeof value==='object'){
    if('result' in value&&value.result!=null)return value.result
    if(Array.isArray(value.richText))return value.richText.map((part:any)=>String(part?.text??'')).join('')
    if(typeof value.text==='string')return value.text
    if(typeof value.hyperlink==='string')return value.text??value.hyperlink
    return ''
  }
  return value
}
function cellText(cell:any):string { const value=readCell(cell);return value instanceof Date?normalizeDate(value)??'':String(value??'').trim() }
function canonical(value:unknown):string{return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID')}
function headerMap(row:any):Map<string,number>{
  const columns=new Map<string,number>()
  const count=Math.min(Number(row.cellCount??row.actualCellCount??100),100)
  for(let c=1;c<=count;c++){
    const name=cellText(row.getCell(c));if(!name)continue
    const key=normalizeExactHeader(name)
    if(columns.has(key))throw new Error('Header Excel ganda setelah normalisasi: '+name+'.')
    columns.set(key,c)
  }
  return columns
}
const ALIASES:Record<string,string[]> = {
 date:['Tanggal pengamatan','Tanggal Pengamatan','Tanggal','Tanggal Kunjungan','Tanggal Pelayanan','Tanggal Periksa','Tgl Pengamatan'],
 clinic:['Klinik','Nama Klinik','Poliklinik','Poli','Nama Poliklinik','Unit Pelayanan'],
 doctor:['Dokter','Nama Dokter','DPJP','Dokter Pemeriksa'],
 minutes:['Waktu Tunggu Rawat Jalan (Menit)','Waktu Tunggu (Menit)','Waktu Tunggu','Rata-Rata Waktu Tunggu Rawat Jalan','Rata-rata Waktu Tunggu','Waiting Time (Minutes)','Waiting Time (Min)'],
}
function findHeader(columns:Map<string,number>,aliases:string[]):number|null{for(const a of aliases){const n=columns.get(normalizeExactHeader(a));if(n!=null)return n}return null}
function parseNumber(value:unknown):number|null{
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null
 const raw=String(value??'').trim().replace(/\s/g,'');if(!raw)return null
 const normalized=raw.includes(',')&&!raw.includes('.')?raw.replace(',','.'):raw.replace(/,/g,'')
 const n=Number(normalized);return Number.isFinite(n)&&n>=0&&n<=1440?n:null
}
function keyFor(row:PreparedRow):string{return SOURCE_PREFIX+row.date+':'+canonical(row.clinic)+':'+canonical(row.doctor)}
function payloadFor(row:PreparedRow,fileName:string){
 const formFields={'Tanggal pengamatan':row.date,'Klinik':row.clinic,'Dokter':row.doctor,'Waktu Tunggu Rawat Jalan (Menit)':row.waitingMinutes}
 const core={patient_name:row.doctor+' · '+row.clinic,admission_at:row.date,unit_name:'Instalasi Rawat Jalan',room_id:11,status:'Ready for Review',workflow_status:'Ready for Review',form_fields:formFields,calculated_fields:{'Waktu Tunggu Rawat Jalan (Menit)':row.waitingMinutes},measurement_grain:'provider_day',source_import:{source_workbook:fileName,source_sheet:'Data Rawat Jalan',source_excel_row:row.sourceRow,import_scope:'outpatient_provider_day_waiting_time',idempotency_basis:'date_clinic_doctor'}}
 return {room_id:11,profile_year:2026,measurement_grain:'provider_day',record_date:row.date,subject_key:keyFor(row),subject_json:core,core_data:core,status:'ready',review_required:true}
}
export default function OutpatientExcelImportDialog({open,roomId,year,authorized,layout,onClose,onImported}:Props){
 const [file,setFile]=useState<File|null>(null),[rows,setRows]=useState<PreparedRow[]>([]),[errors,setErrors]=useState<string[]>([]),[parsing,setParsing]=useState(false),[importing,setImporting]=useState(false),[result,setResult]=useState<{imported:number;skipped:number;received:number}|null>(null),[errorMessage,setErrorMessage]=useState(''),[fileKey,setFileKey]=useState(0)
 const eligible=open&&authorized&&roomId===11&&year>=2026
 const preview=useMemo(()=>rows.slice(0,100),[rows])
 const reset=useCallback(()=>{setFile(null);setRows([]);setErrors([]);setResult(null);setErrorMessage('');setFileKey(v=>v+1)},[])
 const close=()=>{if(parsing||importing)return;reset();onClose()}
 const parseWorkbook=async(selected:File)=>{
  setFile(selected);setRows([]);setErrors([]);setResult(null);setErrorMessage('')
  if(!eligible){setErrorMessage('Pilih Instalasi Rawat Jalan dan tahun profil 2026 sebelum mengimpor.');return}
  if(!/\.xlsx$/i.test(selected.name)){setErrorMessage('Hanya workbook .xlsx yang didukung.');return}
  if(selected.size<=0||selected.size>MAX_FILE_BYTES){setErrorMessage('Ukuran file harus lebih dari 0 dan maksimal 15 MB.');return}
  setParsing(true)
  try{
   const module=await import('exceljs-hardened')
   const ExcelJS:any=(module as any).default??module
   const workbook=new ExcelJS.Workbook()
   await workbook.xlsx.load(await selected.arrayBuffer())
   if(!workbook.worksheets?.length||workbook.worksheets.length>50)throw new Error('Workbook kosong atau memiliki jumlah sheet tidak wajar.')
   const preferred=workbook.getWorksheet('Logbook')??workbook.getWorksheet('Rawat Jalan')??workbook.worksheets[0]
   if(preferred.rowCount>MAX_DATA_ROWS+15)throw new Error('Sheet sumber melebihi batas '+MAX_DATA_ROWS+' baris data.')
   let headerRow=0,columns:Map<string,number>|null=null
   for(let r=1;r<=Math.min(15,preferred.rowCount);r++){
    const candidate=headerMap(preferred.getRow(r))
    if(Object.keys(ALIASES).every(name=>findHeader(candidate,ALIASES[name])!=null)){headerRow=r;columns=candidate;break}
   }
   if(!columns)throw new Error('Header wajib tidak ditemukan. Workbook harus memiliki tanggal pengamatan, klinik, dokter, dan waktu tunggu (menit) pada salah satu dari 15 baris pertama.')
   const indexes:Record<string,number>={}
   for(const [name,aliases] of Object.entries(ALIASES)){const col=findHeader(columns,aliases);if(col==null)throw new Error('Kolom '+aliases[0]+' tidak ditemukan.');indexes[name]=col}
   const groups=layout?.providerGroups??[]
   const prepared:PreparedRow[]=[],rowErrors:string[]=[],seen=new Set<string>()
   for(let n=headerRow+1;n<=preferred.rowCount;n++){
    const source=preferred.getRow(n)
    const raw=[indexes.date,indexes.clinic,indexes.doctor,indexes.minutes].map(c=>readCell(source.getCell(c)))
    if(raw.every(v=>String(v??'').trim()===''))continue
    if(prepared.length>=MAX_DATA_ROWS){rowErrors.push('Jumlah data melebihi '+MAX_DATA_ROWS+' baris.');break}
    try{
     const date=normalizeDate(raw[0]);if(!date)throw new Error('Tanggal tidak valid.')
     if(Number(date.slice(0,4))!==year)throw new Error('Tanggal tidak sesuai tahun profil '+year+'.')
     const clinic=String(raw[1]??'').trim(),doctor=String(raw[2]??'').trim()
     if(!clinic||!doctor)throw new Error('Klinik dan dokter wajib diisi.')
     const minutes=parseNumber(raw[3]);if(minutes==null)throw new Error('Waktu tunggu harus angka 0–1440 menit.')
     const group=groups.find(g=>canonical(g.clinic)===canonical(clinic))
     if(groups.length&&!group)throw new Error('Klinik tidak ditemukan pada daftar klinik aktif.')
     if(group?.doctors?.length&&!group.doctors.some(name=>canonical(name)===canonical(doctor)))throw new Error('Dokter tidak terdaftar pada '+group.clinic+'.')
     const row={sourceRow:n,date,clinic:group?.clinic??clinic,doctor,waitingMinutes:minutes}
     const key=keyFor(row);if(seen.has(key))throw new Error('Duplikasi tanggal, klinik, dan dokter di dalam workbook.')
     seen.add(key);prepared.push(row)
    }catch(error){rowErrors.push('Baris '+n+': '+(error instanceof Error?error.message:'Data tidak valid.'))}
   }
   if(!prepared.length&&!rowErrors.length)throw new Error('Workbook tidak memuat baris data yang dapat diimpor.')
   setRows(prepared);setErrors(rowErrors)
   if(!prepared.length)setErrorMessage(rowErrors.slice(0,40).join('\n'))
  }catch(error){setRows([]);setErrors([]);setErrorMessage(error instanceof Error?error.message:'Workbook tidak dapat dibaca.')}
  finally{setParsing(false)}
 }
 const importRows=async()=>{
  if(!eligible||!rows.length||errors.length||importing||result)return
  setImporting(true);setErrorMessage('')
  try{
   const {data:{user},error:userError}=await sb.auth.getUser()
   if(userError||!user)throw new Error('Sesi login tidak tersedia.')
   let imported=0,skipped=0
   for(let offset=0;offset<rows.length;offset+=BATCH_SIZE){
    const batch=rows.slice(offset,offset+BATCH_SIZE)
    const pRows=batch.map(row=>({payload:payloadFor(row,file?.name??'workbook.xlsx')}))
    const {data,error}=await quality().rpc('import_outpatient_logbook_batch',{p_rows:pRows})
    if(error)throw error
    imported+=Number(data?.imported_count??0);skipped+=Number(data?.skipped_existing_count??0)
   }
   const summary={imported,skipped,received:rows.length};setResult(summary);await onImported(summary)
  }catch(error){setErrorMessage('Impor belum tuntas. '+(error instanceof Error?error.message:'Periksa koneksi atau hak akses.'))}
  finally{setImporting(false)}
 }
 if(!open)return null
 return <div className="aqBack" onClick={e=>{if(e.target===e.currentTarget)close()}}>
  <section className="aqDrawer aqWide aqOutpatientImport" role="dialog" aria-modal="true" aria-labelledby="aqOutpatientTitle">
   <style>{'.aqOutpatientImport .aqBody{display:grid;gap:12px}.aqOutpatientImport .oiBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.5}.aqOutpatientImport .oiError{background:#fff1f0;color:#8b2822}.aqOutpatientImport .oiWarn{background:#fff8e8;color:#795c26}.aqOutpatientImport .oiSuccess{background:#ebf8ef;color:#1e6544}.aqOutpatientImport .oiTable{max-height:300px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqOutpatientImport table{width:100%;border-collapse:collapse;font-size:10px}.aqOutpatientImport th,.aqOutpatientImport td{padding:8px;border-bottom:1px solid #e2e8e4;text-align:left}.aqOutpatientImport th{position:sticky;top:0;background:#f5f8f6}.aqOutpatientImport .oiStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.aqOutpatientImport .oiStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px}.aqOutpatientImport .oiStat span{display:block;color:#65736b;font-size:9px}.aqOutpatientImport .oiStat strong{display:block;font-size:17px;margin-top:4px}.aqOutpatientImport .oiMuted{font-size:10px;color:#65736b;line-height:1.5}@media(max-width:560px){.aqOutpatientImport .oiStats{grid-template-columns:1fr 1fr}}'}</style>
   <div className="aqDHead"><div><div className="eyebrow">Audit Indikator Mutu · Instalasi Rawat Jalan</div><h4 id="aqOutpatientTitle">Unggah workbook Rawat Jalan</h4><p>Impor data harian dokter–klinik untuk penghitungan waktu tunggu.</p></div><button type="button" className="aqClose" disabled={parsing||importing} onClick={close}>×</button></div>
   <div className="aqBody">
    {!authorized&&<div className="oiBox oiError">Impor workbook hanya tersedia bagi Admin/Komite PMKP.</div>}
    {!eligible&&<div className="oiBox oiError">Pilih Instalasi Rawat Jalan dan tahun profil yang sesuai.</div>}
    <div className="oiBox">Format minimum: Tanggal pengamatan, Klinik, Dokter, Waktu Tunggu Rawat Jalan (Menit). Header dicari otomatis pada 15 baris pertama sheet Logbook/Rawat Jalan atau sheet pertama. File dibaca di browser; tidak dikirim ke layanan pihak ketiga.</div>
    <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span><input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible||!authorized||parsing||importing} onChange={e=>{const f=e.target.files?.[0];if(f)void parseWorkbook(f);e.currentTarget.value=''}}/></label>
    {file&&<div className="oiMuted">Berkas: {file.name} · {(file.size/1024/1024).toFixed(2)} MB</div>}
    {parsing&&<div className="oiBox">Membaca workbook dan memeriksa data…</div>}
    {errorMessage&&<div className="oiBox oiError" role="alert">{errorMessage}</div>}
    {rows.length>0&&<div className="oiStats"><div className="oiStat"><span>Baris valid</span><strong>{rows.length}</strong></div><div className="oiStat"><span>Baris bermasalah</span><strong>{errors.length}</strong></div><div className="oiStat"><span>Siap diimpor</span><strong>{rows.length-errors.length}</strong></div></div>}
    {errors.length>0&&<div className="oiBox oiWarn"><b>Impor diblokir sampai baris bermasalah dikoreksi.</b>{'\n'+errors.slice(0,40).join('\n')}{errors.length>40?'\n… dan '+(errors.length-40)+' baris lainnya.':''}</div>}
    {rows.length>0&&<div className="oiTable"><table><thead><tr><th>Baris</th><th>Tanggal</th><th>Klinik</th><th>Dokter</th><th>Waktu tunggu</th></tr></thead><tbody>{preview.map(row=><tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.date}</td><td>{row.clinic}</td><td>{row.doctor}</td><td>{row.waitingMinutes.toLocaleString('id-ID')} menit</td></tr>)}</tbody></table></div>}
    {rows.length>100&&<div className="oiMuted">Pratinjau menampilkan 100 dari {rows.length} baris.</div>}
    <div className="oiMuted">Kunci idempotensi: tanggal + klinik + dokter. Mengunggah workbook yang sama tidak membuat duplikasi. Semua catatan impor berstatus Ready for Review; tidak divalidasi otomatis.</div>
    {result&&<div className="oiBox oiSuccess" role="status">Impor selesai: {result.imported} catatan baru tersimpan dan {result.skipped} dilewati karena sudah ada (dari {result.received} baris valid).</div>}
   </div>
   <div className="aqFoot"><span className="oiMuted">Periksa pratinjau sebelum memulai impor.</span><div style={{display:'flex',gap:8}}><button className="aqBtn" type="button" disabled={parsing||importing} onClick={close}>Tutup</button><button className="aqBtn primary" type="button" disabled={!eligible||!authorized||!rows.length||errors.length>0||parsing||importing||!!result} onClick={()=>void importRows()}>{importing?'Mengimpor…':'Impor '+rows.length+' catatan'}</button></div></div>
  </section>
 </div>
}
