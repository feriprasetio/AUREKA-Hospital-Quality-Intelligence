'use client'
import QualityWorkbookImportSidebar from '@/components/quality/QualityWorkbookImportSidebar'
import QualityWorkbookInlineColumnMapping, { type InlineWorkbookField } from '@/components/quality/QualityWorkbookInlineColumnMapping'
import QualityWorkbookPreviewControls, { useQualityWorkbookPreview } from '@/components/quality/QualityWorkbookPreviewControls'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'


import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { resolveInteractiveExcelHeaderColumn } from '@/lib/aureka/interactive-header-mapping'
import { normalizeProviderName, type OutpatientProviderGroup } from '@/lib/aureka/outpatient-logbook'
import { makeOutpatientProviderDaySubjectKey, normalizeOutpatientImportDate, parseOutpatientWaitingMinutes, parseOutpatientMatrixWorkbook, readOutpatientCell as readCell, outpatientCellText as cellText, type OutpatientPreparedRow as PreparedRow } from '@/lib/aureka/outpatient-excel-import'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const OUTPATIENT_IMPORT_LAYOUT = "\n/* Rawat Jalan: sidebar and a SINGLE normal-flow main column.\n   Never make every preview, notice and checkbox an independent grid item. */\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiImportBody{display:grid!important;grid-template-columns:minmax(235px,270px) minmax(0,1fr)!important;gap:16px!important;align-items:start!important;align-content:start!important;min-height:0!important}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiImportBody>.qiuSidebar{grid-column:1!important;grid-row:1!important;min-width:0}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiImportBody>.oiMain{grid-column:2!important;grid-row:1!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:12px!important;min-width:0!important;min-height:0!important;max-width:100%;position:relative}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain>*{flex:0 0 auto;min-width:0;max-width:100%;margin:0}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain>.oiTable{display:block!important;position:relative;isolation:isolate;flex:0 0 auto!important;min-height:0!important;max-height:none!important;height:auto!important;overflow:visible!important;max-width:100%;width:100%;border:1px solid #dce5eb;border-radius:11px;background:#fff}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .qwpToolbar{position:relative;top:auto;z-index:1;border-bottom:1px solid #dce5eb;background:#fff}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiPreviewScroll{display:block;position:relative;min-height:0;max-height:min(48dvh,420px);overflow:auto;overscroll-behavior:contain;width:100%;max-width:100%}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiPreviewScroll>table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;max-width:none}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiPreviewScroll th{position:sticky;top:0;z-index:2;background:#eff5f8;white-space:nowrap;color:#34485a}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiPreviewScroll td{white-space:nowrap;background:#fff}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiAfterPreview{display:flex;flex-direction:column;gap:12px;position:relative;clear:both;min-width:0;min-height:0}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiAfterPreview>*{margin:0;max-width:100%;overflow-wrap:anywhere}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiAfterPreview label{display:flex;align-items:flex-start;gap:8px;line-height:1.5;cursor:pointer}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiAfterPreview label input{flex:0 0 auto;margin-top:3px}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiWarn{white-space:pre-line;max-height:190px;overflow:auto}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport>.aqFoot{position:relative!important;z-index:3!important;flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;flex-wrap:wrap;gap:10px}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport>.aqFoot>div{display:flex!important;flex-wrap:wrap;gap:8px}\n@media(max-width:940px){\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiImportBody{grid-template-columns:minmax(0,1fr)!important;overflow-y:auto}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiImportBody>.qiuSidebar{grid-column:1!important;grid-row:auto!important;position:static}\n.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiImportBody>.oiMain{grid-column:1!important;grid-row:auto!important}\n}\n@media(max-width:540px){.aq.aqPortal.aqAuditWorkspace .aqOutpatientImport .oiMain .oiPreviewScroll{max-height:min(40dvh,350px)}}\n"
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = 25
type Layout = { roomId: number; fields: string[]; providerGroups?: OutpatientProviderGroup[] }
type Props = { open:boolean; roomId:number|null; year:number; authorized:boolean; layout?:Layout; onClose:()=>void; onImported:(summary:{imported:number;skipped:number;received:number})=>void|Promise<void> }

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
const OUTPATIENT_MAPPING_FIELDS: readonly InlineWorkbookField[] = Object.entries(ALIASES).map(([fieldKey,aliases])=>({
 fieldKey,label:({date:'Tanggal pengamatan',clinic:'Klinik',doctor:'Dokter',minutes:'Waktu tunggu (menit)'} as Record<string,string>)[fieldKey]??aliases[0],aliases,required:true,
}))
function findHeader(columns:Map<string,number[]>,aliases:string[]):number|null{
  const matches=[...new Set(aliases.flatMap(alias=>columns.get(normalizeExactHeader(alias))??[]))]
  return matches.length===1?matches[0]:null
}
function findHeaderRow(sheet:any):{rowNumber:number;columns:Map<string,number[]>;indexes:Record<string,number>}|null{
  let bestRowNumber=0
  let bestColumns:Map<string,number[]>|null=null
  let bestScore=Number.POSITIVE_INFINITY
  for(let rowNumber=1;rowNumber<=Math.min(15,sheet.rowCount);rowNumber++){
    const columns=headerMap(sheet.getRow(rowNumber))
    const score=Object.values(ALIASES).reduce((total,aliases)=>total+(findHeader(columns,aliases)==null?1:0),0)
    if(score===0){
      const indexes:Record<string,number>={}
      for(const [name,aliases] of Object.entries(ALIASES)){
        const selected=resolveInteractiveExcelHeaderColumn(columns,aliases,{
          importerKey:'outpatient',fieldKey:name,fieldLabel:aliases[0],required:true,
        })
        if(selected==null)throw new Error('Kolom "'+aliases[0]+'" belum dipetakan.')
        indexes[name]=selected
      }
      if(new Set(Object.values(indexes)).size!==Object.keys(ALIASES).length)throw new Error('Tiap field wajib menggunakan kolom fisik yang berbeda.')
      return {rowNumber,columns,indexes}
    }
    if(score<bestScore){bestScore=score;bestRowNumber=rowNumber;bestColumns=columns}
  }
  if(bestColumns&&bestRowNumber&&bestScore<=2){
    const indexes:Record<string,number>={}
    for(const [name,aliases] of Object.entries(ALIASES)){
      const index=resolveInteractiveExcelHeaderColumn(bestColumns,aliases,{
        importerKey:'outpatient',
        fieldKey:name,
        fieldLabel:aliases[0],
        required:true,
      })
      if(index==null)throw new Error('Header wajib "'+aliases[0]+'" belum dipetakan.')
      indexes[name]=index
    }
    if(new Set(Object.values(indexes)).size!==Object.keys(ALIASES).length)throw new Error('Setiap isian wajib menggunakan kolom Excel yang berbeda.')
    return {rowNumber:bestRowNumber,columns:bestColumns,indexes}
  }
  return null
}
function payloadFor(row:PreparedRow,fileName:string,year:number){
  const formFields={'Tanggal pengamatan':row.date,'Klinik':row.clinic,'Dokter':row.doctor,'Waktu Tunggu Rawat Jalan (Menit)':row.waitingMinutes}
  const sourceImport={source_workbook:fileName,source_sheet:row.sourceSheet,source_excel_row:row.sourceRow,source_excel_column:row.sourceColumn,import_scope:'outpatient_provider_day_waiting_time',idempotency_basis:'date_clinic_doctor'}
  const core={patient_name:row.doctor+' · '+row.clinic,admission_at:row.date,unit_name:'Instalasi Rawat Jalan',room_id:11,status:'Ready for Review',workflow_status:'Ready for Review',form_fields:formFields,calculated_fields:{'Waktu Tunggu Rawat Jalan (Menit)':row.waitingMinutes},measurement_grain:'provider_day',source_import:sourceImport}
  return {room_id:11,profile_year:year,measurement_grain:'provider_day',record_date:row.date,subject_key:makeOutpatientProviderDaySubjectKey(row.date,row.clinic,row.doctor),subject_json:core,core_data:core,status:'ready',review_required:false,entered_by:null}
}
export default function OutpatientExcelImportDialog({open,roomId,year,authorized,layout,onClose,onImported}:Props){
 const [file,setFile]=useState<File|null>(null),[rows,setRows]=useState<PreparedRow[]>([]),[errors,setErrors]=useState<string[]>([]),[parsing,setParsing]=useState(false),[importing,setImporting]=useState(false),[result,setResult]=useState<{imported:number;skipped:number;received:number}|null>(null),[errorMessage,setErrorMessage]=useState(''),[fileKey,setFileKey]=useState(0)
  const previewConfig = useQualityWorkbookPreview(rows)
 const [allowValidRows,setAllowValidRows]=useState(false)
 const [matrixMode,setMatrixMode]=useState(false)
 const eligible=open&&authorized&&roomId===11&&year>=2026&&year<=2100
 const preview = previewConfig.preview
 const reset=useCallback(()=>{setMatrixMode(false);setFile(null);setRows([]);setErrors([]);setResult(null);setErrorMessage('');setFileKey(v=>v+1)},[])
 const close=()=>{if(parsing||importing)return;reset();onClose()}
  const importDialogRef=useAccessibleDialog<HTMLElement>({open,onClose:close,lockScroll:true})

 const parseWorkbook=async(selected:File)=>{
  setMatrixMode(false);setFile(selected);setRows([]);setErrors([]);setAllowValidRows(false);setResult(null);setErrorMessage('')
  if(!eligible){setErrorMessage('Pilih Instalasi Rawat Jalan dan tahun profil 2026–2100 sebelum mengimpor.');return}
  if(!/\.xlsx$/i.test(selected.name)){setErrorMessage('Hanya workbook .xlsx yang didukung.');return}
  if(selected.size<=0||selected.size>MAX_FILE_BYTES){setErrorMessage('Ukuran file harus lebih dari 0 dan maksimal 15 MB.');return}
  // Match the established Excel import dialogs: never resolve the NodeJS ExcelJS
  // reader during server-side rendering of this client-only file workflow.
  if(typeof window==='undefined')return
  setParsing(true)
  try{
   const module=await import('exceljs-hardened')
   const ExcelJS:any=(module as any).default??module
   const workbook=new ExcelJS.Workbook()
   await workbook.xlsx.load(await selected.arrayBuffer())
   if(!workbook.worksheets?.length||workbook.worksheets.length>50)throw new Error('Workbook kosong atau memiliki jumlah sheet tidak wajar.')
   const groups=layout?.providerGroups??[]
   const matrix=parseOutpatientMatrixWorkbook(workbook,year,groups)
   if(matrix.matched){
    setMatrixMode(true)
    if(!matrix.rows.length&&!matrix.errors.length)throw new Error('Tidak ditemukan pengukuran waktu tunggu pada matriks untuk tahun profil ini.')
    setRows(matrix.rows);setErrors(matrix.errors)
    if(!matrix.rows.length)setErrorMessage(matrix.errors.slice(0,40).join('\n'))
    return
   }
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
      const row:PreparedRow={sourceRow:excelRow,sourceSheet:String(sheet.name??'Sheet'),sourceColumn:source.getCell(header.indexes.minutes).address.replace(/\d+$/,''),date,clinic:group?.clinic??clinicText,doctor:rosterDoctor??doctorText,waitingMinutes}
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
   if(!prepared.length)setErrorMessage(rowErrors.slice(0,40).join('\n'))
  }catch(error){setRows([]);setErrors([]);setErrorMessage(error instanceof Error?error.message:'Workbook tidak dapat dibaca.')}
  finally{setParsing(false)}
 }
 const importRows=async()=>{
  if(!eligible||!rows.length||(errors.length>0&&!allowValidRows)||importing||result)return
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
 if (typeof document === 'undefined') return null
 return createPortal(<div className="aq aqPortal aqAuditWorkspace"><div className="aqBack" onClick={e=>{if(e.target===e.currentTarget)close()}}>
  <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqOutpatientImport" role="dialog" aria-modal="true" aria-labelledby="aqOutpatientTitle">
   <style>{'.aqOutpatientImport .aqBody{display:grid;gap:12px}.aqOutpatientImport .oiBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:12px;line-height:1.5}.aqOutpatientImport .oiError{background:#fff1f0;color:#8b2822}.aqOutpatientImport .oiWarn{background:#fff8e8;color:#795c26}.aqOutpatientImport .oiSuccess{background:#ebf8ef;color:#1e6544}.aqOutpatientImport .oiTable{max-height:300px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqOutpatientImport table{width:100%;border-collapse:collapse;font-size:12px}.aqOutpatientImport th,.aqOutpatientImport td{padding:8px;border-bottom:1px solid #e2e8e4;text-align:left}.aqOutpatientImport th{position:sticky;top:0;background:#f5f8f6}.aqOutpatientImport .oiStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.aqOutpatientImport .oiStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px}.aqOutpatientImport .oiStat span{display:block;color:#65736b;font-size:12px}.aqOutpatientImport .oiStat strong{display:block;font-size:17px;margin-top:4px}.aqOutpatientImport .oiMuted{font-size:12px;color:#65736b;line-height:1.5}@media(max-width:560px){.aqOutpatientImport .oiStats{grid-template-columns:1fr 1fr}}'}</style><style>{OUTPATIENT_IMPORT_LAYOUT}</style>
   <div className="aqDHead"><div><div className="eyebrow">Audit Indikator Mutu · Instalasi Rawat Jalan</div><h4 id="aqOutpatientTitle">Unggah workbook Rawat Jalan</h4><p>Impor data harian dokter–klinik untuk penghitungan waktu tunggu.</p></div><button type="button" className="aqClose" disabled={parsing||importing} onClick={close}>×</button></div>
   <div className="aqBody qiuBody oiImportBody"><QualityWorkbookImportSidebar unitKey="outpatient" year={year} mapping={
    matrixMode ? <p className="qiuMappingNotice">Workbook matriks tanggal menggunakan pemetaan klinik–dokter khusus. Pengaturan kolom di bawah berlaku untuk workbook berbentuk tabel observasi, bukan matriks tanggal.</p> :
    <QualityWorkbookInlineColumnMapping file={file} importerKey="outpatient"
      fields={OUTPATIENT_MAPPING_FIELDS} disabled={parsing||importing}
      onApply={()=>file ? parseWorkbook(file) : undefined}/>
   }/><div className="oiMain">
    {!authorized&&<div className="oiBox oiError">Impor workbook hanya tersedia bagi Admin/Komite PMKP.</div>}
    {!eligible&&<div className="oiBox oiError">Pilih Instalasi Rawat Jalan dan tahun profil yang sesuai.</div>}
    <div className="oiBox">Workbook mendukung dua bentuk: (1) logbook matriks PMKP: tanggal pada kolom mendatar, klinik sebagai kelompok baris, dan dokter pada baris di bawahnya; atau (2) tabel dengan kolom Tanggal pengamatan, Klinik, Dokter, dan Waktu Tunggu Rawat Jalan (Menit). Sistem mengabaikan rumus rekap klinik, memetakan dokter ke roster, lalu menampilkan pratinjau sebelum impor. File diproses di browser; hanya pengukuran valid yang dikirim ke Supabase.</div>
    <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span><input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible||!authorized||parsing||importing} onChange={e=>{const f=e.target.files?.[0];if(f)void parseWorkbook(f);e.currentTarget.value=''}}/></label>
    {file&&<div className="oiMuted">Berkas: {file.name} · {(file.size/1024/1024).toFixed(2)} MB</div>}
    {parsing&&<div className="oiBox">Membaca workbook dan memeriksa data…</div>}
    {errorMessage&&<div className="oiBox oiError" role="alert">{errorMessage}</div>}
    {rows.length>0&&<div className="oiStats"><div className="oiStat"><span>Pengukuran diperiksa</span><strong>{rows.length+errors.length}</strong></div><div className="oiStat"><span>Baris bermasalah</span><strong>{errors.length}</strong></div><div className="oiStat"><span>Baris lolos validasi</span><strong>{rows.length}</strong></div></div>}
    {errors.length>0&&<div className="oiBox oiWarn"><b>Baris berikut perlu diperbaiki dari workbook.</b>{'\n'+errors.slice(0,40).join('\n')}{errors.length>40?'\n… dan '+(errors.length-40)+' baris lainnya.':''}</div>}
    {rows.length>0&&<section className="oiTable" aria-label="Pratinjau data Rawat Jalan"><QualityWorkbookPreviewControls config={previewConfig} /><div className="oiPreviewScroll" role="region" tabIndex={0} aria-label="Tabel pratinjau workbook Rawat Jalan">
            <table><thead><tr><th>Sheet</th><th>Baris</th><th>Tanggal</th><th>Klinik</th><th>Dokter</th><th>Waktu tunggu</th></tr></thead><tbody>{preview.map(row=><tr key={row.sourceSheet+'-'+row.sourceRow+'-'+row.sourceColumn}><td>{row.sourceSheet}</td><td>{row.sourceRow}</td><td>{row.date}</td><td>{row.clinic}</td><td>{row.doctor}</td><td>{row.waitingMinutes.toLocaleString('id-ID')} menit</td></tr>)}</tbody></table></div></section>}
    <div className="oiAfterPreview">
    <div className="oiMuted">Kunci idempotensi mengikuti logbook manual AUREKA: room 11 + tanggal + nama klinik roster + nama dokter roster. Unggah ulang tidak membuat catatan duplikat. Catatan impor menjadi laporan final PIC dan tetap dapat diperbarui; pemeriksaan bulanan dilakukan oleh Validator.</div>
    {!!errors.length&&!!rows.length&&!result&&<label><input type="checkbox" checked={allowValidRows} disabled={importing} onChange={event=>setAllowValidRows(event.target.checked)}/> Impor baris valid dan sisakan baris yang perlu koreksi.</label>}
    {result&&<div className="oiBox oiSuccess" role="status">Impor selesai: {result.imported} catatan baru tersimpan dan {result.skipped} dilewati karena catatan dokter/klinik/tanggal sudah ada (dari {result.received} baris valid).</div>}
   </div></div></div>
   <div className="aqFoot"><span className="oiMuted">Periksa pratinjau sebelum memulai impor.</span><div style={{display:'flex',gap:8}}><button className="aqBtn" type="button" disabled={parsing||importing} onClick={close} >Batal</button><button className="aqBtn primary" type="button" disabled={!eligible||!authorized||!rows.length||(errors.length>0&&!allowValidRows)||parsing||importing||!!result} onClick={()=>void importRows()}>{importing?'Mengimpor…':'Simpan '+rows.length+' catatan'}</button></div></div>
  </section>
 </div></div>, document.body)
}