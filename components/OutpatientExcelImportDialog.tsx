'use client'

import { useCallback, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { normalizeProviderName, type OutpatientProviderGroup } from '@/lib/aureka/outpatient-logbook'
import { makeOutpatientProviderDaySubjectKey, normalizeOutpatientImportDate, parseOutpatientWaitingMinutes } from '@/lib/aureka/outpatient-excel-import'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = 25
type Layout = { roomId: number; fields: string[]; providerGroups?: OutpatientProviderGroup[] }
type PreparedRow = { sourceRow:number; sourceSheet:string; date:string; clinic:string; doctor:string; waitingMinutes:number }
type Props = { open:boolean; roomId:number|null; year:number; authorized:boolean; layout?:Layout; onClose:()=>void; onImported:(summary:{imported:number;skipped:number;received:number})=>void|Promise<void> }

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
function cellText(cell:any):string {
  const value=readCell(cell)
  return value instanceof Date?normalizeOutpatientImportDate(value)??'':String(value??'').trim()
}
function headerMap(row:any):Map<string,number[]>{
  const columns=new Map<string,number[]>()
  const count=Math.min(Number(row.cellCount??row.actualCellCount??100),100)
  for(let c=1;c<=count;c++){
    const name=cellText(row.getCell(c));if(!name)continue
    const key=normalizeExactHeader(name)
    const matches=columns.get(key)??[]
    matches.push(c);columns.set(key,matches)
  }
  return columns
}
const ALIASES:Record<string,string[]> = {
 date:['Tanggal pengamatan','Tanggal Pengamatan','Tanggal','Tanggal Kunjungan','Tanggal Pelayanan','Tanggal Periksa','Tgl Pengamatan','Tanggal Observasi'],
 clinic:['Klinik','Nama Klinik','Poliklinik','Poli','Nama Poliklinik','Unit Pelayanan'],
 doctor:['Dokter','Nama Dokter','DPJP','Dokter Pemeriksa','Dokter Pelaksana'],
 minutes:['Waktu Tunggu Rawat Jalan (Menit)','Waktu Tunggu (Menit)','Waktu Tunggu','Waktu Tunggu Rawat Jalan','Rata-Rata Waktu Tunggu Rawat Jalan','Rata-rata Waktu Tunggu','Rata-rata Waktu Tunggu Rawat Jalan (Menit)','Waiting Time (Minutes)','Waiting Time (Min)'],
}
function findHeader(columns:Map<string,number[]>,aliases:string[]):number|null{
  for(const alias of aliases){
    const matches=columns.get(normalizeExactHeader(alias))
    if(matches?.length){
      if(matches.length>1)throw new Error('Header wajib "'+alias+'" muncul lebih dari satu kali pada sheet.')
      return matches[0]
    }
  }
  return null
}
function findHeaderRow(sheet:any):{rowNumber:number;columns:Map<string,number[]>;indexes:Record<string,number>}|null{
  for(let rowNumber=1;rowNumber<=Math.min(15,sheet.rowCount);rowNumber++){
    try{
      const columns=headerMap(sheet.getRow(rowNumber))
      const indexes:Record<string,number>={}
      let matched=true
      for(const [name,aliases] of Object.entries(ALIASES)){
        const index=findHeader(columns,aliases)
        if(index==null){matched=false;break}
        indexes[name]=index
      }
      if(matched)return {rowNumber,columns,indexes}
    }catch{
      // Keep scanning because title/header decorations above the actual table may repeat labels.
    }
  }
  return null
}
function payloadFor(row:PreparedRow,fileName:string,year:number){
  const formFields={'Tanggal pengamatan':row.date,'Klinik':row.clinic,'Dokter':row.doctor,'Waktu Tunggu Rawat Jalan (Menit)':row.waitingMinutes}
  const sourceImport={source_workbook:fileName,source_sheet:row.sourceSheet,source_excel_row:row.sourceRow,import_scope:'outpatient_provider_day_waiting_time',idempotency_basis:'date_clinic_doctor'}
  const core={patient_name:row.doctor+' · '+row.clinic,admission_at:row.date,unit_name:'Instalasi Rawat Jalan',room_id:11,status:'Ready for Review',workflow_status:'Ready for Review',form_fields:formFields,calculated_fields:{'Waktu Tunggu Rawat Jalan (Menit)':row.waitingMinutes},measurement_grain:'provider_day',source_import:sourceImport}
  return {room_id:11,profile_year:year,measurement_grain:'provider_day',record_date:row.date,subject_key:makeOutpatientProviderDaySubjectKey(row.date,row.clinic,row.doctor),subject_json:core,core_data:core,status:'ready',review_required:false,entered_by:null}
}
export default function OutpatientExcelImportDialog({open,roomId,year,authorized,layout,onClose,onImported}:Props){
 const [file,setFile]=useState<File|null>(null),[rows,setRows]=useState<PreparedRow[]>([]),[errors,setErrors]=useState<string[]>([]),[parsing,setParsing]=useState(false),[importing,setImporting]=useState(false),[result,setResult]=useState<{imported:number;skipped:number;received:number}|null>(null),[errorMessage,setErrorMessage]=useState(''),[fileKey,setFileKey]=useState(0)
 const eligible=open&&authorized&&roomId===11&&year>=2026&&year<=2100
 const preview=useMemo(()=>rows.slice(0,100),[rows])
 const reset=useCallback(()=>{setFile(null);setRows([]);setErrors([]);setResult(null);setErrorMessage('');setFileKey(v=>v+1)},[])
 const close=()=>{if(parsing||importing)return;reset();onClose()}
 const parseWorkbook=async(selected:File)=>{
  setFile(selected);setRows([]);setErrors([]);setResult(null);setErrorMessage('')
  if(!eligible){setErrorMessage('Pilih Instalasi Rawat Jalan dan tahun profil 2026–2100 sebelum mengimpor.');return}
  if(!/\\.xlsx$/i.test(selected.name)){setErrorMessage('Hanya workbook .xlsx yang didukung.');return}
  if(selected.size<=0||selected.size>MAX_FILE_BYTES){setErrorMessage('Ukuran file harus lebih dari 0 dan maksimal 15 MB.');return}
  setParsing(true)
  try{
   const module=await import('exceljs-hardened')
   const ExcelJS:any=(module as any).default??module
   const workbook=new ExcelJS.Workbook()
   await workbook.xlsx.load(await selected.arrayBuffer())
   if(!workbook.worksheets?.length||workbook.worksheets.length>50)throw new Error('Workbook kosong atau memiliki jumlah sheet tidak wajar.')
   const groups=layout?.providerGroups??[]
   const candidateSheets=[...workbook.worksheets].sort((a:any,b:any)=>{
    const rank=(name:string)=>/^(logbook|rawat jalan|outpatient|data rawat jalan)$/i.test(name.trim())?0:1
    return rank(String(a.name??''))-rank(String(b.name??''))
   })
   const prepared:PreparedRow[]=[],rowErrors:string[]=[],seen=new Set<string>()
   let matchedSheets=0
   for(const sheet of candidateSheets){
    const header=findHeaderRow(sheet)
    if(!header)continue
    matchedSheets++
    if(sheet.rowCount>MAX_DATA_ROWS+15)throw new Error('Sheet "'+sheet.name+'" melebihi batas '+MAX_DATA_ROWS+' baris data.')
    for(let excelRow=header.rowNumber+1;excelRow<=sheet.rowCount;excelRow++){
     const source=sheet.getRow(excelRow)
     const raw=[header.indexes.date,header.indexes.clinic,header.indexes.doctor,header.indexes.minutes].map((column:number)=>readCell(source.getCell(column)))
     if(raw.every(value=>String(value??'').trim()===''))continue
     const dateText=String(raw[0]??'').trim(),clinicText=String(raw[1]??'').trim(),doctorText=String(raw[2]??'').trim()
     // Ignore summary/footer lines that have no date or provider identity.
     if(!dateText&&!clinicText&&!doctorText)continue
     if(prepared.length>=MAX_DATA_ROWS){rowErrors.push('Batas total '+MAX_DATA_ROWS+' baris data terlampaui.');break}
     try{
      const date=normalizeOutpatientImportDate(raw[0])
      if(!date)throw new Error('Tanggal pengamatan tidak valid.')
      if(Number(date.slice(0,4))!==year)throw new Error('Tanggal tidak sesuai tahun profil '+year+'.')
      if(!clinicText||!doctorText)throw new Error('Klinik dan dokter wajib diisi.')
      const waitingMinutes=parseOutpatientWaitingMinutes(raw[3])
      if(waitingMinutes==null)throw new Error('Waktu tunggu harus berupa angka 0–1.440 menit.')
      const group=groups.find(item=>normalizeProviderName(item.clinic)===normalizeProviderName(clinicText))
      if(groups.length&&!group)throw new Error('Klinik tidak ditemukan pada roster operasional: '+clinicText+'.')
      const rosterDoctor=group?.doctors.find(name=>normalizeProviderName(name)===normalizeProviderName(doctorText))
      if(group?.doctors?.length&&!rosterDoctor)throw new Error('Dokter tidak terdaftar pada '+group.clinic+': '+doctorText+'.')
      const row:PreparedRow={sourceRow:excelRow,sourceSheet:String(sheet.name??'Sheet'),date,clinic:group?.clinic??clinicText,doctor:rosterDoctor??doctorText,waitingMinutes}
      const key=makeOutpatientProviderDaySubjectKey(row.date,row.clinic,row.doctor)
      if(seen.has(key))throw new Error('Duplikasi catatan tanggal, klinik, dan dokter dalam workbook (termasuk antar-sheet).')
      seen.add(key);prepared.push(row)
     }catch(error){
      rowErrors.push('Sheet "'+String(sheet.name??'Sheet')+'" · baris '+excelRow+': '+(error instanceof Error?error.message:'Data tidak valid.'))
     }
    }
   }
   if(!matchedSheets)throw new Error('Sheet sumber tidak ditemukan. Workbook harus memuat kolom tanggal pengamatan, klinik, dokter, dan waktu tunggu pada salah satu dari 15 baris pertama.')
   if(!prepared.length&&!rowErrors.length)throw new Error('Tidak ditemukan baris pengukuran waktu tunggu yang dapat diimpor.')
   setRows(prepared);setErrors(rowErrors)
   if(!prepared.length)setErrorMessage(rowErrors.slice(0,40).join('\\n'))
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
    const pRows=batch.map(row=>({payload:payloadFor(row,file?.name??'workbook.xlsx',year)}))
    // Reuse the production RPC already installed in Supabase. It enforces role,
    // room access, minute range, exact provider-day key, and duplicate handling.
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
    <div className="oiBox">Format minimum: Tanggal pengamatan, Klinik, Dokter, Waktu Tunggu Rawat Jalan (Menit). Sistem mencari header pada 15 baris pertama setiap sheet dan membaca semua sheet yang cocok. Klinik dan dokter dicocokkan ke roster operasional. File diproses di browser; hanya baris pengukuran yang dikirim ke Supabase.</div>
    <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span><input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible||!authorized||parsing||importing} onChange={e=>{const f=e.target.files?.[0];if(f)void parseWorkbook(f);e.currentTarget.value=''}}/></label>
    {file&&<div className="oiMuted">Berkas: {file.name} · {(file.size/1024/1024).toFixed(2)} MB</div>}
    {parsing&&<div className="oiBox">Membaca workbook dan memeriksa data…</div>}
    {errorMessage&&<div className="oiBox oiError" role="alert">{errorMessage}</div>}
    {rows.length>0&&<div className="oiStats"><div className="oiStat"><span>Baris valid</span><strong>{rows.length}</strong></div><div className="oiStat"><span>Baris bermasalah</span><strong>{errors.length}</strong></div><div className="oiStat"><span>Siap diimpor</span><strong>{rows.length-errors.length}</strong></div></div>}
    {errors.length>0&&<div className="oiBox oiWarn"><b>Impor diblokir sampai baris bermasalah dikoreksi.</b>{'\n'+errors.slice(0,40).join('\n')}{errors.length>40?'\n… dan '+(errors.length-40)+' baris lainnya.':''}</div>}
    {rows.length>0&&<div className="oiTable"><table><thead><tr><th>Sheet</th><th>Baris</th><th>Tanggal</th><th>Klinik</th><th>Dokter</th><th>Waktu tunggu</th></tr></thead><tbody>{preview.map(row=><tr key={row.sourceSheet+'-'+row.sourceRow}><td>{row.sourceSheet}</td><td>{row.sourceRow}</td><td>{row.date}</td><td>{row.clinic}</td><td>{row.doctor}</td><td>{row.waitingMinutes.toLocaleString('id-ID')} menit</td></tr>)}</tbody></table></div>}
    {rows.length>100&&<div className="oiMuted">Pratinjau menampilkan 100 dari {rows.length} baris.</div>}
    <div className="oiMuted">Kunci idempotensi mengikuti logbook manual AUREKA: room 11 + tanggal + nama klinik roster + nama dokter roster. Unggah ulang tidak membuat catatan duplikat. Catatan impor masuk berstatus Siap Ditinjau; validasi tetap menjadi kewenangan validator.</div>
    {result&&<div className="oiBox oiSuccess" role="status">Impor selesai: {result.imported} catatan baru tersimpan dan {result.skipped} dilewati karena catatan dokter/klinik/tanggal sudah ada (dari {result.received} baris valid).</div>}
   </div>
   <div className="aqFoot"><span className="oiMuted">Periksa pratinjau sebelum memulai impor.</span><div style={{display:'flex',gap:8}}><button className="aqBtn" type="button" disabled={parsing||importing} onClick={close}>Tutup</button><button className="aqBtn primary" type="button" disabled={!eligible||!authorized||!rows.length||errors.length>0||parsing||importing||!!result} onClick={()=>void importRows()}>{importing?'Mengimpor…':'Impor '+rows.length+' catatan'}</button></div></div>
  </section>
 </div>
}
