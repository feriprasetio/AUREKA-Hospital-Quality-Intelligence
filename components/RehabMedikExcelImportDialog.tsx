'use client'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'


import { useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, isStatementTimeout, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  makeRehabMedikSubjectKey,
  normalizeRehabDate,
  normalizeRehabOptionLabel,
  parseRehabSourceAnswer,
  type RehabIndicatorProfile,
  type RehabSourceAnswer,
} from '@/lib/aureka/rehab-medik-excel-import'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = DEFAULT_IMPORT_BATCH_SIZE
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const INDICATORS = [
  { code:'12.1', title:'Efektivitas Tindakan Rehab Medik', header:'Efektivitas' },
  { code:'12.2', title:'Kejadian Drop Out dari Program Rehab Medik Tanpa Izin Dokter', header:'Drop Out Tanpa Izin Dokter' },
  { code:'12.3', title:'Kejadian Jatuh Saat Program Rehab Medik', header:'Kejadian Jatuh' },
  { code:'12.4', title:'Kejadian Salah Tindakan Rehab Medik', header:'Salah Tindakan' },
  { code:'12.5', title:'Kepatuhan Batas Durasi Pelayanan Pasien', header:'Kepatuhan Durasi Pelayanan' },
  { code:'12.6', title:'Tidak Tersedianya Media Terapi Rehab Medik', header:'Ketersediaan Media Terapi' },
] as const

type PreparedRow = {
  sourceRow:number
  sourceNo:string
  patientName:string
  medicalRecordNo:string
  serviceDate:string
  therapist:string
  treatment:string
  indicators:Record<string,RehabSourceAnswer>
}
type ImportCounts = { received:number; imported:number; skipped:number; completedBatches:number }
type Props = {
  open:boolean
  roomId:number|null
  year:number
  authorized:boolean
  profiles:RehabIndicatorProfile[]
  onClose:()=>void
  onImported:(summary:{imported:number;skipped:number;received:number})=>void|Promise<void>
}

const REQUIRED_HEADERS:Record<string,string[]> = {
  sourceNo:['No.','No','Nomor'],
  patientName:['Nama Pasien'],
  medicalRecordNo:['No. Rekam Medis','No RM','No. RM.'],
  serviceDate:['Tanggal Dilayani','Tanggal Pelayanan'],
  therapist:['Nama Terapis','Terapis'],
  treatment:['Jenis Tindakan','Jenis Terapi','Tindakan'],
}
const INDICATOR_HEADERS = Object.fromEntries(INDICATORS.map(item=>[item.code,[item.header]])) as Record<string,string[]>

function readCell(cell:any):unknown {
  const value=cell?.value
  if(value==null)return ''
  if(value instanceof Date)return value
  if(typeof value==='object'){
    if('result' in value && value.result!=null)return value.result
    if(Array.isArray(value.richText))return value.richText.map((part:any)=>String(part?.text??'')).join('')
    if(typeof value.text==='string')return value.text
    if(typeof value.hyperlink==='string')return value.text??value.hyperlink
    return ''
  }
  return value
}
function cellText(cell:any):string {
  const value=readCell(cell)
  if(value instanceof Date)return value.toISOString()
  if(typeof value==='number'){
    const display=String(cell?.text??'').trim()
    return display && !/[Ee][+-]?\d+/.test(display) ? display : String(value)
  }
  return String(value??'').trim()
}
function normalizeMedicalRecordNumber(cell:any):string {
  const value=readCell(cell)
  if(value==null||value==='')return ''
  if(typeof value==='number'&&Number.isFinite(value)){
    const display=String(cell?.text??'').trim()
    return display && !/[Ee][+-]?\d+/.test(display) ? display : String(Math.trunc(value))
  }
  return String(value).trim()
}
function columnsForRow(row:any):Map<string,number[]> {
  const result=new Map<string,number[]>()
  const count=Math.min(Number(row.cellCount??row.actualCellCount??100),100)
  for(let col=1;col<=count;col++){
    const text=cellText(row.getCell(col))
    if(!text)continue
    const key=normalizeExactHeader(text)
    const matches=result.get(key)??[]
    matches.push(col);result.set(key,matches)
  }
  return result
}
function findHeader(columns:Map<string,number[]>,aliases:string[],required:boolean):number|null {
  for(const alias of aliases){
    const matches=columns.get(normalizeExactHeader(alias))
    if(matches?.length){
      if(matches.length>1)throw new Error('Header "'+alias+'" muncul lebih dari satu kali pada baris header.')
      return matches[0]
    }
  }
  if(required)throw new Error('Header wajib "'+aliases[0]+'" tidak ditemukan pada baris header Logbook.')
  return null
}
function findHeaderRow(sheet:any):{rowNumber:number;indexes:Record<string,number>} {
  for(let rowNumber=1;rowNumber<=Math.min(10,sheet.rowCount);rowNumber++){
    try{
      const columns=columnsForRow(sheet.getRow(rowNumber))
      const indexes:Record<string,number>={}
      for(const [key,aliases] of Object.entries(REQUIRED_HEADERS)){
        const index=findHeader(columns,aliases,key!=='treatment')
        if(index!=null)indexes[key]=index
      }
      for(const [code,aliases] of Object.entries(INDICATOR_HEADERS)){
        const index=findHeader(columns,aliases,true)
        if(index!=null)indexes['indicator:'+code]=index
      }
      const requiredReady=['sourceNo','patientName','medicalRecordNo','serviceDate','therapist'].every(key=>indexes[key]!=null)
      const indicatorsReady=INDICATORS.every(item=>indexes['indicator:'+item.code]!=null)
      if(requiredReady&&indicatorsReady)return {rowNumber,indexes}
    }catch{
      // Continue scanning title/merged header rows before the actual Logbook header.
    }
  }
  throw new Error('Header Logbook tidak lengkap. Workbook harus memiliki kolom No., Nama Pasien, No. Rekam Medis, Tanggal Dilayani, Nama Terapis, dan keenam indikator Rehab Medik pada satu baris.')
}
function formatCounts(rows:PreparedRow[]) {
  const therapists=new Set(rows.map(row=>row.therapist).filter(Boolean))
  const treatments=new Set(rows.map(row=>row.treatment).filter(Boolean))
  const dates=rows.map(row=>row.serviceDate).sort()
  const byIndicator=Object.fromEntries(INDICATORS.map(item=>[item.code,rows.filter(row=>!!row.indicators[item.code]).length]))
  return {therapists:therapists.size,treatments:treatments.size,firstDate:dates[0]??null,lastDate:dates.at(-1)??null,byIndicator}
}
function makePayload(row:PreparedRow,fileName:string,year:number,userId:string,profiles:RehabIndicatorProfile[]) {
  const indicatorValues:Record<string,Record<string,unknown>>={}
  const responses:Array<Record<string,unknown>>=[]
  for(const item of INDICATORS){
    const answer=row.indicators[item.code]
    if(!answer)continue
    const profile=profiles.find(candidate=>Number(candidate.room_id)===12&&Number(candidate.profile_year)===year&&String(candidate.code)===item.code&&candidate.id)
    if(!profile?.id)throw new Error('Master indikator '+item.code+' tidak tersedia untuk impor.')
    const rawValue={
      answer:answer.label,
      code:answer.code,
      source_value:answer.sourceLabel,
      source_code:answer.sourceCode,
      review_required:answer.reviewRequired,
    }
    indicatorValues[item.code]=rawValue
    responses.push({
      indicator_id:profile.id,
      response_label:answer.label,
      response_code:answer.code,
      raw_value:rawValue,
      other_text:answer.reviewRequired?answer.sourceLabel:null,
      review_status:answer.reviewRequired?'pending':'not_required',
    })
  }
  const sourceImport={
    source_workbook:fileName,
    source_sheet:'Logbook',
    source_excel_row:row.sourceRow,
    source_excel_no:row.sourceNo,
    import_scope:'rehab_medik_patient_visit_logbook',
    idempotency_basis:'room_year_source_excel_row',
  }
  const formFields={
    'Nama Pasien':row.patientName,
    'No. Rekam Medis':row.medicalRecordNo,
    'Tanggal Dilayani':row.serviceDate,
    'Nama Terapis':row.therapist,
    'Jenis Tindakan':row.treatment,
  }
  const core={
    patient_name:row.patientName,
    medical_record_no:row.medicalRecordNo,
    admission_at:row.serviceDate,
    unit_name:'Instalasi Rehab Medik',
    room_id:12,
    status:'Final',
    workflow_status:'Final',
    form_fields:formFields,
    calculated_fields:{},
    indicator_values:indicatorValues,
    measurement_grain:'patient_episode',
    source_import:sourceImport,
  }
  return {
    payload:{
      room_id:12,
      profile_year:year,
      measurement_grain:'patient_episode',
      record_date:row.serviceDate,
      subject_key:makeRehabMedikSubjectKey(year,row.sourceRow),
      subject_json:{source_import:sourceImport},
      core_data:core,
      status:'ready',
      review_required:false,
      entered_by:userId,
    },
    responses,
    attributions:[],
  }
}

export default function RehabMedikExcelImportDialog({open,roomId,year,authorized,profiles,onClose,onImported}:Props){
 const [file,setFile]=useState<File|null>(null)
 const [rows,setRows]=useState<PreparedRow[]>([])
 const [errors,setErrors]=useState<string[]>([])
 const [parsing,setParsing]=useState(false)
 const [importing,setImporting]=useState(false)
 const [result,setResult]=useState<ImportCounts|null>(null)
 const [partial,setPartial]=useState<ImportCounts|null>(null)
 const [progress,setProgress]=useState(0)
 const [errorMessage,setErrorMessage]=useState('')
 const [fileKey,setFileKey]=useState(0)
 const eligible=open&&authorized&&roomId===12&&year>=2026&&year<=2100
 const preview=useMemo(()=>rows.slice(0,100),[rows])
 const stats=useMemo(()=>formatCounts(rows),[rows])
 const reset=()=>{setFile(null);setRows([]);setErrors([]);setParsing(false);setImporting(false);setResult(null);setPartial(null);setProgress(0);setErrorMessage('');setFileKey(v=>v+1)}
 const close=()=>{if(parsing||importing)return;reset();onClose()}
  const importDialogRef=useAccessibleDialog<HTMLElement>({open,onClose:close,lockScroll:true})


 const parseWorkbook=async(selectedFile:File)=>{
  setFile(selectedFile);setRows([]);setErrors([]);setResult(null);setPartial(null);setProgress(0);setErrorMessage('')
  if(!eligible){setErrorMessage('Pilih Instalasi Rehab Medik dan tahun profil yang sesuai sebelum mengunggah.');return}
  if(!/\.xlsx$/i.test(selectedFile.name)){setErrorMessage('Hanya workbook .xlsx yang didukung.');return}
  if(selectedFile.size<=0||selectedFile.size>MAX_FILE_BYTES){setErrorMessage('Ukuran workbook harus lebih besar dari 0 dan maksimal 15 MB.');return}
  if(typeof window==='undefined')return
  setParsing(true)
  try{
   const module=await import('exceljs-hardened')
   const ExcelJS:any=(module as any).default??module
   const workbook=new ExcelJS.Workbook()
   await workbook.xlsx.load(await selectedFile.arrayBuffer())
   if(!workbook.worksheets?.length||workbook.worksheets.length>50)throw new Error('Workbook kosong atau jumlah sheet tidak wajar.')
   const sheet=workbook.getWorksheet('Logbook')
   if(!sheet)throw new Error('Sheet Logbook tidak ditemukan. Sheet Dashboard, Profil, dan rekap 1–20 tidak diimpor.')
   if(sheet.rowCount>MAX_DATA_ROWS+10||sheet.columnCount>100)throw new Error('Dimensi sheet Logbook melewati batas 5.010 baris atau 100 kolom.')
   const header=findHeaderRow(sheet)
   const profileByCode=new Map(profiles.filter(profile=>Number(profile.room_id)===12&&Number(profile.profile_year)===year&&profile.is_active===true&&profile.status==='published').map(profile=>[String(profile.code),profile]))
   for(const item of INDICATORS){const profile=profileByCode.get(item.code);if(!profile?.id||!Array.isArray(profile.options_json)||!profile.options_json.length)throw new Error('Master indikator '+item.code+' belum aktif/terbit atau belum memiliki pilihan sumber.')}
   const prepared:PreparedRow[]=[],rowErrors:string[]=[]
   for(let excelRow=header.rowNumber+1;excelRow<=sheet.rowCount;excelRow++){
    const source=sheet.getRow(excelRow)
    const patientName=cellText(source.getCell(header.indexes.patientName))
    const medicalRecordNo=normalizeMedicalRecordNumber(source.getCell(header.indexes.medicalRecordNo))
    const dateRaw=readCell(source.getCell(header.indexes.serviceDate))
    const therapist=cellText(source.getCell(header.indexes.therapist))
    const treatment=header.indexes.treatment?cellText(source.getCell(header.indexes.treatment)):''
    const hasAny=[patientName,medicalRecordNo,String(dateRaw??''),therapist,treatment,...INDICATORS.map(item=>cellText(source.getCell(header.indexes['indicator:'+item.code])))].some(value=>String(value??'').trim()!=='')
    if(!hasAny)continue
    if(prepared.length>=MAX_DATA_ROWS){rowErrors.push('Batas maksimum '+MAX_DATA_ROWS+' catatan terlampaui.');break}
    try{
      if(!patientName)throw new Error('Nama Pasien kosong.')
      if(!medicalRecordNo)throw new Error('No. Rekam Medis kosong.')
      if(!therapist)throw new Error('Nama Terapis kosong.')
      const serviceDate=normalizeRehabDate(dateRaw)
      if(!serviceDate)throw new Error('Tanggal Dilayani tidak valid.')
      if(Number(serviceDate.slice(0,4))!==year)throw new Error('Tanggal Dilayani tidak sesuai tahun profil '+year+'.')
      const answers:Record<string,RehabSourceAnswer>={}
      let answerCount=0
      for(const item of INDICATORS){
        const raw=cellText(source.getCell(header.indexes['indicator:'+item.code]))
        if(!raw)continue
        const profile=profileByCode.get(item.code)!
        try{
          const answer=parseRehabSourceAnswer(raw,Array.isArray(profile.options_json)?profile.options_json:[])
          if(!answer)continue
          answers[item.code]=answer
          answerCount++
        }catch(error){
          throw new Error(item.header+': '+(error instanceof Error?error.message:'Pilihan tidak cocok dengan master.'))
        }
      }
      if(answerCount===0)throw new Error('Tidak ada respons indikator pada baris ini.')
      prepared.push({
        sourceRow:excelRow,
        sourceNo:cellText(source.getCell(header.indexes.sourceNo)),
        patientName,
        medicalRecordNo,
        serviceDate,
        therapist,
        treatment,
        indicators:answers,
      })
    }catch(error){
      rowErrors.push('Baris Excel '+excelRow+': '+(error instanceof Error?error.message:'Data tidak valid.'))
    }
   }
   if(!prepared.length&&!rowErrors.length)throw new Error('Tidak ditemukan catatan pelayanan pada sheet Logbook.')
   setRows(prepared);setErrors(rowErrors)
   if(rowErrors.length)setErrorMessage('Ada baris yang belum valid. Baris valid dapat dipratinjau, tetapi impor menunggu koreksi seluruh baris.')
  }catch(error){
    setRows([]);setErrors([])
    setErrorMessage(error instanceof Error?error.message:'Workbook tidak dapat dibaca.')
  }finally{setParsing(false)}
 }

 const importRows=async()=>{
  if(!eligible||!authorized||!rows.length||errors.length||importing||result)return
  setImporting(true);setErrorMessage('')
  try{
   const {data:{user},error:userError}=await sb.auth.getUser()
   if(userError||!user)throw new Error('Sesi login tidak tersedia.')
   const items=rows.map(row=>makePayload(row,file?.name??'workbook.xlsx',year,user.id,profiles))
   const counts:ImportCounts={received:0,imported:0,skipped:0,completedBatches:0}
   let start=0,batchSize=BATCH_SIZE,batchNumber=0
   while(start<items.length){
    const batch=items.slice(start,start+batchSize)
    batchNumber++
    const {data,error}=await quality().rpc('import_rehab_medik_logbook_batch',{p_rows:batch})
    if(error){
      const smaller=nextBatchSizeAfterTimeout(error,batchSize,MIN_BATCH_SIZE)
      if(smaller!=null){batchSize=smaller;batchNumber--;setErrorMessage('Server membatasi waktu transaksi. Ukuran batch diturunkan menjadi '+batchSize+' baris; batch yang sama akan diulang dengan aman.');continue}
      throw new Error('Batch '+batchNumber+' ('+batch.length+' baris) gagal: '+error.message)
    }
    const summary=(data??{}) as {received_count?:number;imported_count?:number;skipped_existing_count?:number}
    const received=Number(summary.received_count??batch.length)
    const imported=Number(summary.imported_count??0)
    const skipped=Number(summary.skipped_existing_count??0)
    if(received!==batch.length||imported+skipped!==received)throw new Error('Ringkasan server pada batch '+batchNumber+' tidak konsisten.')
    counts.received+=received;counts.imported+=imported;counts.skipped+=skipped;counts.completedBatches++
    start+=batch.length
    setPartial({...counts});setProgress(Math.round((counts.received/items.length)*100));setErrorMessage('')
   }
   if(counts.received!==items.length||counts.imported+counts.skipped!==counts.received)throw new Error('Ringkasan akhir impor tidak konsisten.')
   setResult(counts)
   await onImported({imported:counts.imported,skipped:counts.skipped,received:counts.received})
  }catch(error){
   setErrorMessage('Impor belum tuntas. '+(error instanceof Error?error.message:'Periksa koneksi atau hak akses.'))
  }finally{setImporting(false)}
 }

 if(!open)return null
 return <div className="aqBack" role="presentation" onClick={event=>{if(event.target===event.currentTarget)close()}}>
  <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqRehabImport" role="dialog" aria-modal="true" aria-labelledby="aqRehabImportTitle">
   <style>{'.aqRehabImport .aqBody{display:grid;align-content:start;gap:12px}.aqRehabImport .riBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqRehabImport .riError{background:#fff1f0;color:#8b2822}.aqRehabImport .riWarn{background:#fff8e8;color:#795c26}.aqRehabImport .riSuccess{background:#ebf8ef;color:#1e6544}.aqRehabImport .riTable{max-height:320px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqRehabImport table{width:100%;border-collapse:collapse;font-size:11px}.aqRehabImport th,.aqRehabImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;white-space:nowrap}.aqRehabImport th{position:sticky;top:0;background:#f5f8f6}.aqRehabImport .riStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.aqRehabImport .riStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff}.aqRehabImport .riStat span{display:block;color:#65736b;font-size:11px}.aqRehabImport .riStat strong{display:block;font-size:17px;margin-top:4px}.aqRehabImport .riMuted{font-size:11px;color:#65736b;line-height:1.5}@media(max-width:560px){.aqRehabImport .riStats{grid-template-columns:1fr 1fr}}'}</style>
   <div className="aqDHead"><div><div className="eyebrow">Audit Indikator Mutu · Instalasi Rehab Medik</div><h4 id="aqRehabImportTitle">Unggah workbook Rehab Medik (.xlsx)</h4><p>Impor baris pelayanan pasien dan respons indikator 12.1–12.6.</p></div><button type="button" className="aqClose" disabled={parsing||importing} onClick={close} aria-label="Batal">×</button></div>
   <div className="aqBody">
    {!authorized&&<div className="riBox riError">Impor workbook hanya tersedia bagi Admin/Komite PMKP.</div>}
    {!eligible&&<div className="riBox riError">Pilih Instalasi Rehab Medik dan tahun profil yang sesuai.</div>}
    <div className="riBox">Sistem hanya mengimpor sheet <b>Logbook</b> (baris header ditemukan otomatis). Sheet Profil, Dashboard, dan sheet rekap 1–20 tidak diimpor karena berisi master atau hasil formula. Enam pilihan indikator dicocokkan dengan master AUREKA; sel kosong dibiarkan kosong. Pratinjau tidak menampilkan nama pasien atau nomor rekam medis.</div>
    <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span><input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible||!authorized||parsing||importing} onChange={event=>{const selected=event.target.files?.[0];if(selected)void parseWorkbook(selected);event.currentTarget.value=''}}/></label>
    {file&&<div className="riMuted">Berkas: {file.name} · {(file.size/1024/1024).toFixed(2)} MB</div>}
    {parsing&&<div className="riBox">Membaca Logbook, memeriksa tanggal, identitas, nama terapis, dan kesesuaian enam indikator…</div>}
    {errorMessage&&<div className="riBox riError" role="alert">{errorMessage}</div>}
    {rows.length>0&&<div className="riStats"><div className="riStat"><span>Baris valid</span><strong>{rows.length.toLocaleString('id-ID')}</strong></div><div className="riStat"><span>Baris bermasalah</span><strong>{errors.length.toLocaleString('id-ID')}</strong></div><div className="riStat"><span>Jumlah terapis</span><strong>{stats.therapists}</strong></div></div>}
    {rows.length>0&&<div className="riBox">Periode data: {stats.firstDate} s.d. {stats.lastDate} · {stats.treatments} jenis tindakan yang terisi · pratinjau menampilkan maksimal 100 baris tanpa identitas pasien.</div>}
    {errors.length>0&&<div className="riBox riWarn"><b>Impor diblokir sampai semua baris bermasalah dikoreksi.</b>{'\n'+errors.slice(0,40).join('\n')}{errors.length>40?'\n… dan '+(errors.length-40)+' baris lainnya.':''}</div>}
    {rows.length>0&&<div className="riTable"><table><thead><tr><th>Baris Excel</th><th>Tanggal</th><th>Nama Terapis</th><th>Jenis Tindakan</th><th>Indikator terisi</th></tr></thead><tbody>{preview.map(row=><tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.serviceDate}</td><td>{row.therapist}</td><td>{row.treatment||'-'}</td><td>{Object.keys(row.indicators).length}/6</td></tr>)}</tbody></table></div>}
    {rows.length>100&&<div className="riMuted">Pratinjau menampilkan 100 dari {rows.length.toLocaleString('id-ID')} baris valid.</div>}
    {partial&&importing&&<div className="riBox">Progres {progress}% · {partial.completedBatches} batch selesai · {partial.imported.toLocaleString('id-ID')} catatan baru · {partial.skipped.toLocaleString('id-ID')} sudah ada.</div>}
    {partial&&!importing&&!result&&partial.completedBatches>0&&<div className="riBox riWarn">Sebagian proses selesai sebelum kegagalan. {partial.imported} catatan baru tersimpan dan {partial.skipped} dilewati. Unggah ulang aman: kunci sumber menggunakan nomor baris Logbook.</div>}
    {result&&<div className="riBox riSuccess" role="status">Impor selesai: {result.received.toLocaleString('id-ID')} baris diproses, {result.imported.toLocaleString('id-ID')} catatan baru disimpan, dan {result.skipped.toLocaleString('id-ID')} sudah ada sehingga dilewati. Semua catatan impor menjadi laporan final PIC.</div>}
    <div className="riMuted">Kunci idempotensi mengikuti nomor baris sumber: Instalasi Rehab Medik + tahun + nomor baris Excel. Workbook yang sama aman diunggah ulang dan tidak menggandakan catatan. Dua kunjungan pada pasien/tanggal/terapis/tindakan yang sama tetap dipisahkan jika berasal dari baris Excel berbeda.</div>
   </div>
   <div className="aqFoot"><span className="riMuted">Pastikan pratinjau sesuai sumber sebelum melaporkan.</span><div style={{display:'flex',gap:8}}><button type="button" className="aqBtn" disabled={parsing||importing} onClick={close}>Batal</button><button type="button" className="aqBtn primary" disabled={!eligible||!authorized||!rows.length||errors.length>0||parsing||importing||!!result} onClick={()=>void importRows()}>{importing?'Mengimpor…':'Laporkan '+rows.length.toLocaleString('id-ID')+' catatan'}</button></div></div>
  </section>
 </div>
}
