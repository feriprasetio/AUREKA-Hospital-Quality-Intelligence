'use client'
import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { detectMapping, isLegacyHeader, normalizeHeader, normalizeRow, mergeMissing, type ImportField, type RawCell, type RawRow } from '@/lib/patient-safety/incident-excel-import'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Existing = { id:string; incident_code:string; incident_date:string|null; summary:string; status:string; form_data:Record<string,string> }
type Sheet = { name:string; headers:string[]; rows:RawRow[]; raw:Record<number,unknown[]>; fingerprints:Record<number,string> }
type Props = { supabase:SupabaseClient; rooms:{id:number;name:string}[]; fields:ImportField[]; existing:Existing[]; onDone:()=>Promise<void>; onClose:()=>void; onBusyChange:(busy:boolean)=>void }
const maxRows=1000
const maxColumns=80
function cellValue(cell:any):RawCell {
 const value=cell.value
 if(value==null)return null
 if(value instanceof Date)return value.toISOString()
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value
 if(value.result!==undefined){const result=value.result;return result instanceof Date?result.toISOString():typeof result==='number'||typeof result==='boolean'?result:String(result??'')}
 if(Array.isArray(value.richText))return value.richText.map((r:any)=>r.text).join('')
 if(typeof value.text==='string')return value.text
 return String(cell.text??'')
}
const sha256=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('')
const selectStyle={width:'100%',minHeight:38,padding:'6px 10px',border:'1px solid #cbd5cf',borderRadius:8,background:'#fff',color:'#243e31'}
export default function IncidentExcelImport({supabase,rooms,fields,existing,onDone,onClose,onBusyChange}:Props){
 const [sheets,setSheets]=useState<Sheet[]>([])
 const [sheetName,setSheetName]=useState('')
 const [filename,setFilename]=useState('')
 const [mapping,setMapping]=useState<Record<string,number>>({})
 const [legacyRepair,setLegacyRepair]=useState(false)
 const [busy,setBusy]=useState(false)
 useEffect(()=>{onBusyChange(busy);return ()=>onBusyChange(false)},[busy,onBusyChange])
 const [error,setError]=useState('')
 const [result,setResult]=useState<{inserted:number;updated:number;skipped:number;errors:string[]}|null>(null)
 const [confirmed,setConfirmed]=useState(false)
 const [page,setPage]=useState(0)
 const [excluded,setExcluded]=useState<number[]>([])
 const sheet=sheets.find(s=>s.name===sheetName)
 const legacyAllowed=filename.toLowerCase()==='daftar insiden keselamatan pasien.xlsx'&&sheetName==='Form Responses 1'&&Boolean(sheet&&isLegacyHeader(sheet.headers))
 const choose=(s:Sheet)=>{setSheetName(s.name);setMapping(detectMapping(s.headers,fields));setLegacyRepair(false);setConfirmed(false);setExcluded([]);setPage(0);setResult(null)}
 const load=async(file:File)=>{
  setBusy(true);setError('');setResult(null);setSheets([]);setSheetName('');setConfirmed(false)
  try{
   if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw Error('Gunakan workbook .xlsx maksimal 10 MB.')
   const mod=await import('exceljs-hardened');const ExcelJS:any=(mod as any).default??mod;const wb=new ExcelJS.Workbook()
   await wb.xlsx.load(await file.arrayBuffer())
   if(wb.worksheets.length>20)throw Error('Maksimal 20 worksheet per workbook.')
   const parsed:Sheet[]=[]
   for(const ws of wb.worksheets){
    if(ws.rowCount>maxRows+1||ws.columnCount>maxColumns)continue
    const headers=Array.from({length:ws.getRow(1).cellCount},(_,i)=>String(cellValue(ws.getRow(1).getCell(i+1))??'').trim())
    if(!headers.some(Boolean))continue
    const rows:RawRow[]=[];const raw:Record<number,unknown[]>={};const fingerprints:Record<number,string>={}
    for(let n=2;n<=ws.rowCount;n++){
     const r=ws.getRow(n);const cells=Array.from({length:r.cellCount},(_,i)=>cellValue(r.getCell(i+1)))
     if(!cells.some(v=>v!==null&&String(v).trim()!==''))continue
     rows.push({row:n,cells});raw[n]=Array.from({length:r.cellCount},(_,i)=>r.getCell(i+1).value??null)
    }
    if(rows.length){for(const row of rows)fingerprints[row.row]=await sha256(JSON.stringify([ws.name,row.row,headers,raw[row.row]]));parsed.push({name:ws.name,headers,rows,raw,fingerprints})}
   }
   if(!parsed.length)throw Error('Tidak ada worksheet dengan header pada baris 1 dan data yang memenuhi batas ukuran.')
   setFilename(file.name);setSheets(parsed);choose(parsed.find(s=>isLegacyHeader(s.headers))??parsed[0])
  }catch(e){setError(toUserFacingError(e,{fallback:'Workbook tidak dapat dibaca.'}))}finally{setBusy(false)}
 }
 const preview=useMemo(()=>sheet?sheet.rows.map(row=>{
  const n=normalizeRow(row,sheet.headers,mapping,fields,rooms)
  const codeColumn=sheet.headers.findIndex(h=>['kode insiden','incident code','kode laporan'].includes(normalizeHeader(h)))
  const requestedCode=codeColumn>=0?String(row.cells[codeColumn]??'').trim():''
  const historicTarget=legacyAllowed?existing.find(i=>i.form_data._import_row===String(row.row)&&i.form_data._import_source==='Daftar Insiden Keselamatan Pasien.xlsx / Form Responses 1'):undefined
  const target=requestedCode?existing.find(i=>i.incident_code===requestedCode):legacyRepair?historicTarget:undefined
  const fingerprint=sheet.fingerprints[row.row]
  const exactMatch=existing.find(i=>i.form_data._import_fingerprint===fingerprint||i.incident_code==='IKP-'+n.data.A2.slice(0,4)+'-XLS-'+fingerprint.slice(0,24).toUpperCase())
  const warnings=[...n.warnings]
  let blocked=n.blocked
  if((requestedCode||legacyRepair)&&(!target||target.status!=='draft'||target.incident_date!==n.data.A2)){blocked=true;warnings.push('Target rekonsiliasi tidak ditemukan, bukan draf, atau tanggal tidak cocok.')}
  if(exactMatch){blocked=true;warnings.push('Sudah tersimpan dengan sidik data yang sama; baris dilewati.')}
  if(historicTarget&&!target){blocked=true;warnings.push('Laporan historis sudah ada. Aktifkan rekonsiliasi untuk melengkapi sumber.')}
  if(target)warnings.push('Rekonsiliasi: hanya melengkapi isian kosong dan menyimpan sumber; nilai lama tidak ditimpa.')
  else if(existing.some(i=>i.incident_date===n.data.A2&&normalizeHeader(i.summary)===normalizeHeader(n.data.A1))){blocked=true;warnings.push('Kemungkinan duplikat tanggal dan judul; gunakan kode laporan yang sudah ada untuk rekonsiliasi.')}
  return {...n,blocked,warnings,row,target}
 }):[],[sheet,mapping,fields,rooms,existing,legacyRepair,legacyAllowed])
 const selected=preview.filter(r=>!r.blocked&&!excluded.includes(r.row.row))
 const blockedCount=preview.filter(r=>r.blocked).length
 const warningCount=preview.filter(r=>r.warnings.length>0).length
 const download=async()=>{
  setBusy(true);setError('')
  try{
   const mod=await import('exceljs-hardened');const ExcelJS:any=(mod as any).default??mod;const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Register Insiden')
   ws.columns=[{header:'Kode Insiden',key:'code',width:25},...fields.map(f=>({header:f.code+' '+f.label,key:f.code,width:f.type==='textarea'?52:29}))]
   ws.views=[{state:'frozen',ySplit:1}];ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17634A'}};ws.getRow(1).alignment={wrapText:true,vertical:'middle'};ws.getRow(1).height=42
   for(let i=0;i<fields.length;i++){const f=fields[i];if(f.type==='date')ws.getColumn(i+2).numFmt='yyyy-mm-dd';else if(f.type==='time')ws.getColumn(i+2).numFmt='hh:mm';else if(f.code==='C2')ws.getColumn(i+2).numFmt='@'}
   const guide=wb.addWorksheet('Petunjuk');guide.columns=[{header:'Kolom',width:15},{header:'Keterangan / pilihan yang diterima',width:90}]
   guide.addRow(['Kode Insiden','Kosong untuk laporan baru; isi kode AUREKA untuk melengkapi draf yang sudah ada.'])
   for(const f of fields)guide.addRow([f.code,f.options?f.options.join(' | '):f.label])
   guide.getColumn(2).alignment={wrapText:true,vertical:'top'}
   const buffer=await wb.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='Template Register Insiden AUREKA.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }catch(e){setError(toUserFacingError(e,{fallback:'Template tidak dapat dibuat.'}))}finally{setBusy(false)}
 }
 const save=async()=>{
  if(!sheet||!confirmed||busy||!selected.length)return
  setBusy(true);setError('');setResult(null)
  const outcome={inserted:0,updated:0,skipped:0,errors:[] as string[]}
  try{
   const {data:auth,error:authError}=await supabase.auth.getUser();if(authError||!auth.user)throw Error('Sesi login tidak tersedia.')
   const db=(supabase as any).schema('aureka_patient_safety')
   for(const item of selected){
    try{
     const fingerprint=sheet.fingerprints[item.row.row]
     const source=JSON.stringify({sheet:sheet.name,row:item.row.row,headers:sheet.headers,cells:sheet.raw[item.row.row],mapping,normalized:item.data})
     if(source.length>250000)throw Error('Data sumber melampaui batas ukuran per baris.')
     const form={...item.data,_import_source:filename+' / '+sheet.name,_import_row:String(item.row.row),_import_raw_json:source,_import_fingerprint:fingerprint,_import_review:'Draf impor Excel; belum divalidasi Tim PMKP',_import_warnings:item.warnings.join('\n')}
     if(item.target){
      const {data:current,error:e}=await db.from('incidents').select('id,incident_code,incident_date,status,form_data,updated_at,summary,unit_name,incident_time,incident_type,room_id').eq('id',item.target.id).single()
      if(e||!current||current.status!=='draft'||current.incident_date!==item.data.A2)throw Error('Target berubah; muat ulang register.')
      if(current.form_data?._import_fingerprint===fingerprint){outcome.skipped++;continue}
      const merged=mergeMissing(current.form_data||{},form)
      // Preserve the earliest legacy source marker, and store the newest full source separately.
      if(current.form_data?._import_source)merged._import_source=current.form_data._import_source
      if(current.form_data?._import_row)merged._import_row=current.form_data._import_row
      if(current.form_data?._import_raw_json&&current.form_data._import_raw_json!==source){
       const history=JSON.parse(current.form_data._import_source_history||'[]');const nextHistory=JSON.stringify([...history,current.form_data._import_raw_json]);if(nextHistory.length>500000)throw Error('Riwayat sumber melampaui batas; perlu review manual.');merged._import_source_history=nextHistory
      }
      const {data:updated,error:updateError}=await db.from('incidents').update({form_data:merged,summary:current.summary||merged.A1,unit_name:current.unit_name||merged.E2||'',incident_time:current.incident_time||merged.A3||null,incident_type:current.incident_type||merged.A7,room_id:current.room_id??item.roomId}).eq('id',current.id).eq('updated_at',current.updated_at).eq('status','draft').select('id')
      if(updateError||updated?.length!==1)throw Error('Target tidak dapat diperbarui atau berubah saat impor.')
      outcome.updated++
     }else{
      const code='IKP-'+item.data.A2.slice(0,4)+'-XLS-'+fingerprint.slice(0,24).toUpperCase()
      const {data:inserted,error:insertError}=await db.from('incidents').upsert({incident_code:code,incident_date:item.data.A2,incident_time:item.data.A3||null,summary:item.data.A1,incident_type:item.data.A7,unit_name:item.data.E2||'',room_id:item.roomId,form_data:form,status:'draft',created_by:auth.user.id},{onConflict:'incident_code',ignoreDuplicates:true}).select('id')
      if(insertError)throw Error('Baris gagal disimpan; periksa izin dan validitas data.')
      if(inserted?.length)outcome.inserted++;else outcome.skipped++
     }
    }catch{outcome.errors.push('Baris '+item.row.row+': gagal disimpan; periksa ulang dan coba lagi.')}
   }
   await onDone()
  }catch(e){setError(toUserFacingError(e,{fallback:'Impor tidak dapat diselesaikan.'}))}finally{setResult(outcome);setBusy(false);setConfirmed(false)}
 }
 const resetConfirm=()=>{setConfirmed(false);setResult(null)}
 return <div style={{display:'grid',gap:16,padding:16,overflowWrap:'anywhere'}}>
  <div className="psSectionHead"><div><h4>Impor Excel Register Insiden</h4><p>Unggah, petakan kolom, periksa hasil, lalu simpan sebagai draf. Data asli tetap tersimpan pada laporan.</p></div><button type="button" className="psBtn" disabled={busy} onClick={onClose}>Tutup</button></div>
  <div className="psAlert warn">RAHASIA · Gunakan workbook internal yang sah. Data dibaca di perangkat ini dan dikirim hanya ke database AUREKA saat penyimpanan. Jangan isi data klinis yang tidak diketahui.</div>
  <div className="psActions"><button type="button" className="psBtn" disabled={busy} onClick={()=>void download()}>Unduh Template Excel</button><label className="psField"><span className="psLabel">Workbook .xlsx (maks. 10 MB / 1.000 baris per sheet)</span><input type="file" accept=".xlsx" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.target.value=''}} /></label></div>
  {error?<div role="alert" className="psAlert error">{error}</div>:null}
  {sheet?<><label className="psField"><span className="psLabel">Worksheet (header pada baris 1)</span><select style={selectStyle} disabled={busy} value={sheetName} onChange={e=>{const s=sheets.find(s=>s.name===e.target.value);if(s)choose(s)}}>{sheets.map(s=><option key={s.name}>{s.name}</option>)}</select></label>
  {legacyAllowed?<label style={{display:'flex',gap:8,alignItems:'start'}}><input type="checkbox" checked={legacyRepair} disabled={busy} onChange={e=>{setLegacyRepair(e.target.checked);resetConfirm()}}/><span>Rekonsiliasi 46 laporan historis yang sudah ada (verifikasi bahwa workbook ini adalah sumber aslinya). Hanya melengkapi kolom kosong, bukan menimpa narasi yang sudah dirapikan.</span></label>:null}
  <details open><summary style={{cursor:'pointer',fontWeight:600}}>1. Pemetaan kolom ({fields.filter(f=>(mapping[f.code]??-1)>=0).length}/{fields.length})</summary><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10,marginTop:12}}>{fields.map(f=><label key={f.code} className="psField"><span className="psLabel">{f.code} · {f.label}</span><select style={selectStyle} value={mapping[f.code]??-1} disabled={busy} onChange={e=>{setMapping(m=>({...m,[f.code]:Number(e.target.value)}));resetConfirm()}}><option value={-1}>Tidak dipetakan</option>{sheet.headers.map((h,i)=><option key={i} value={i}>{i+1}. {h||'(tanpa judul)'}</option>)}</select></label>)}</div></details>
  <div><strong>2. Pratinjau dan validasi</strong><p>{preview.length} baris · {selected.length} siap dipilih · {blockedCount} diblokir · {warningCount} memiliki catatan</p><div style={{overflowX:'auto',maxWidth:'100%'}}><table className="psTable"><thead><tr><th>Pilih</th><th>Baris</th><th>Tanggal / Jenis</th><th>Insiden</th><th>Unit</th><th>Validasi</th></tr></thead><tbody>{preview.slice(page*20,page*20+20).map(r=><tr key={r.row.row}><td><input type="checkbox" aria-label={'Pilih baris '+r.row.row} checked={!r.blocked&&!excluded.includes(r.row.row)} disabled={busy||r.blocked} onChange={e=>{setExcluded(old=>e.target.checked?old.filter(n=>n!==r.row.row):[...old,r.row.row]);resetConfirm()}}/></td><td>{r.row.row}</td><td>{r.data.A2||'—'}<br/>{r.data.A7||'—'}</td><td style={{minWidth:180,whiteSpace:'normal'}}>{r.data.A1||'—'}<details><summary>Detail isian</summary>{fields.map(f=>r.data[f.code]?<p key={f.code}><b>{f.label}:</b> {r.data[f.code]}</p>:null)}</details></td><td>{r.data.E2||'Belum tercatat'}</td><td style={{minWidth:220,whiteSpace:'normal'}}><b>{r.blocked?'Diblokir':r.target?'Lengkapi draf':'Draf baru'}</b>{r.warnings.map((w,i)=><p key={i}>{w}</p>)}</td></tr>)}</tbody></table></div><div className="psActions"><button type="button" className="psBtn" disabled={page===0||busy} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><span>Halaman {page+1} / {Math.max(1,Math.ceil(preview.length/20))}</span><button type="button" className="psBtn" disabled={(page+1)*20>=preview.length||busy} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div></div>
  <div><strong>3. Simpan ke Register</strong><label style={{display:'flex',gap:8,margin:'10px 0'}}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Saya telah memeriksa pemetaan dan catatan; laporan disimpan sebagai draf belum tervalidasi.</label><button type="button" className="psBtn primary" disabled={busy||!confirmed||!selected.length} onClick={()=>void save()}>{busy?'Memproses…':'Simpan '+selected.length+' laporan terpilih'}</button></div></>:null}
  {result?<div className="psAlert" role="status"><b>Hasil impor</b><p>{result.inserted} baru · {result.updated} diperbarui · {result.skipped} dilewati (sudah tersimpan) · {result.errors.length} gagal</p>{result.errors.map(e=><p key={e}>{e}</p>)}<button type="button" className="psBtn" onClick={onClose}>Kembali ke Register</button></div>:null}
 </div>
}
