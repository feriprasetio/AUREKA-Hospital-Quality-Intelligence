import type { Workbook, Worksheet } from 'exceljs-hardened'
export { parseOutpatientWaitingMinutes } from './outpatient-logbook.ts'
import { parseOutpatientWaitingMinutes, normalizeProviderName, type OutpatientProviderGroup } from './outpatient-logbook.ts'

export function normalizeOutpatientImportDate(value: unknown): string | null {
  const valid = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : null
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return valid(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/)
  if (dmy) return valid(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    const serial = Number(raw.replace(',', '.'))
    if (serial < 20000 || serial > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  return null
}

/** The same provider-day key used by manual logbook saves and the live DB import RPC. */
export function makeOutpatientProviderDaySubjectKey(date: string, clinic: string, doctor: string): string {
  return '11:' + date + ':' + clinic.trim() + ':' + doctor.trim()
}

const MAX_DATA_ROWS = 5000
export type OutpatientPreparedRow = { sourceRow:number; sourceSheet:string; sourceColumn:string; date:string; clinic:string; doctor:string; waitingMinutes:number }

export function readOutpatientCell(cell:any):unknown {
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
export function outpatientCellText(cell:any):string {
  const value=readOutpatientCell(cell)
  return value instanceof Date?normalizeOutpatientImportDate(value)??'':String(value??'').trim()
}

export function parseOutpatientMatrixSheet(sheet:Worksheet,year:number,groups:OutpatientProviderGroup[],seen:Set<string>):{matched:boolean;rows:OutpatientPreparedRow[];errors:string[]}{
 const rows:OutpatientPreparedRow[]=[],errors:string[]=[]
 const firstLabel=outpatientCellText(sheet.getRow(1).getCell(1)).toLocaleLowerCase('id-ID')
 const sheetName=String(sheet.name??'').toLocaleLowerCase('id-ID')
 if(!/poliklinik|klinik/.test(firstLabel)&&!/(^|\s)logbook(\s|$)/.test(sheetName))return {matched:false,rows,errors}
 let headerRow=0,firstDateColumn=0,dateColumns:Array<{column:number;date:string}>=[]
 // Official PMKP logbook: first column contains clinic group labels and
 // each following column is a calendar date. Date formulas may have no
 // cached result in some Excel readers, so continue a sequential date series
 // only when the cell is an Excel formula.
 for(let r=1;r<=Math.min(15,sheet.rowCount);r++){
  for(let c=1;c<=Math.min(Number(sheet.columnCount??500),500);c++){
   const cell=sheet.getRow(r).getCell(c)
   const value=readOutpatientCell(cell)
   const date=normalizeOutpatientImportDate(value)
   if(date&&Number(date.slice(0,4))===year){headerRow=r;firstDateColumn=c;break}
  }
  if(headerRow)break
 }
 if(!headerRow)return {matched:false,rows,errors}
 let currentDate=normalizeOutpatientImportDate(readOutpatientCell(sheet.getRow(headerRow).getCell(firstDateColumn)))!
 for(let c=firstDateColumn;c<=Math.min(Number(sheet.columnCount??500),500);c++){
  const cell=sheet.getRow(headerRow).getCell(c)
  const raw=readOutpatientCell(cell)
  const parsed=normalizeOutpatientImportDate(raw)
  if(parsed&&Number(parsed.slice(0,4))===year){currentDate=parsed;dateColumns.push({column:c,date:parsed});continue}
  const formula=String(cell.formula??'').replace(/[=$\s]/g,'').toUpperCase()
  const previous=c>firstDateColumn?sheet.getRow(headerRow).getCell(c - 1).address.toUpperCase():''
  const beforePrevious=c>firstDateColumn+1?sheet.getRow(headerRow).getCell(c - 2).address.toUpperCase():''
  const leapPlaceholder=previous&&formula===`IF(AND(MONTH(${previous})2,DAY(${previous})28,OR(MOD(YEAR(${previous}),400)0,AND(MOD(YEAR(${previous}),4)0,MOD(YEAR(${previous}),100)<>0))),${previous}+1,"")`
  const afterLeapPlaceholder=beforePrevious&&formula===`IF(${previous}"",${beforePrevious}+1,${previous}+1)`
  const next=new Date(currentDate+'T00:00:00Z')
  next.setUTCDate(next.getUTCDate()+1)
  if(leapPlaceholder&&next.getUTCMonth()===2&&next.getUTCDate()===1)continue
  if(previous&&(formula===previous+'+1'||leapPlaceholder||afterLeapPlaceholder)){
   currentDate=next.toISOString().slice(0,10)
   if(Number(currentDate.slice(0,4))===year)dateColumns.push({column:c,date:currentDate})
   continue
  }
  if(c>firstDateColumn)break
 }
 if(!dateColumns.length)return {matched:false,rows,errors}
 const clinicByKey=new Map(groups.map(group=>[normalizeProviderName(group.clinic),group]))
 let activeClinic:OutpatientProviderGroup|null=null
 for(let r=headerRow+1;r<=Math.min(sheet.rowCount,headerRow+5000);r++){
  const source=sheet.getRow(r),label=outpatientCellText(source.getCell(1))
  if(!label){
   for(const {column} of dateColumns){
    const cell=source.getCell(column)
    if(!cell.formula&&parseOutpatientWaitingMinutes(readOutpatientCell(cell))!=null){
     errors.push('Sheet "'+String(sheet.name??'Logbook')+'" · sel '+cell.address+': nilai harian tidak memiliki identitas dokter.')
    }
   }
   continue
  }
  // Excel may return the merged calendar heading in column A on row 2.
  // Match the helper formulas before interpreting a label as a provider.
  const firstFormula=String(source.getCell(firstDateColumn).formula??'').replace(/[=$\s]/g,'').toUpperCase()
  const labelKey=normalizeProviderName(label)
  if(r===headerRow+1&&/^CONCATENATE\(TEXT\(/.test(firstFormula))continue
  if(['month','bulan'].includes(labelKey)&&/^MONTH\([A-Z]+\d+\)$/.test(firstFormula)){activeClinic=null;continue}
  const clinic=clinicByKey.get(normalizeProviderName(label))
  if(clinic){activeClinic=clinic;continue}
  const doctor=activeClinic?.doctors.find(name=>normalizeProviderName(name)===normalizeProviderName(label))
  if(!doctor){
   const hasValues=dateColumns.some(({column})=>{const value=readOutpatientCell(source.getCell(column));return value!==''&&value!=null})
   if(hasValues)errors.push('Sheet "'+String(sheet.name??'Logbook')+'" · baris '+r+': dokter "'+label+'" tidak ditemukan pada roster klinik '+(activeClinic?.clinic??'Rawat Jalan')+'.')
   continue
  }
  for(const {column,date} of dateColumns){
   const cell=source.getCell(column)
   const raw=readOutpatientCell(cell)
   if(raw===''||raw==null)continue
   const waitingMinutes=parseOutpatientWaitingMinutes(raw)
   if(waitingMinutes==null){ errors.push('Sheet "'+String(sheet.name??'Logbook')+'" · baris '+r+', kolom '+column+': waktu tunggu harus berupa angka 0–1.440 menit.'); continue }
   const row:OutpatientPreparedRow={sourceRow:r,sourceSheet:String(sheet.name??'Logbook'),sourceColumn:cell.address.replace(/\d+$/,''),date,clinic:activeClinic!.clinic,doctor,waitingMinutes}
   const key=makeOutpatientProviderDaySubjectKey(row.date,row.clinic,row.doctor)
   if(seen.has(key)){errors.push('Sheet "'+row.sourceSheet+'" · baris '+r+': duplikasi tanggal, klinik, dan dokter.');continue}
   seen.add(key);rows.push(row)
   if(rows.length>MAX_DATA_ROWS)throw new Error('Workbook melebihi batas '+MAX_DATA_ROWS+' baris data.')
  }
 }
 return {matched:true,rows,errors}
}


export function parseOutpatientMatrixWorkbook(workbook: Workbook, year: number, groups: OutpatientProviderGroup[]) {
 const seen = new Set<string>()
 const rows: OutpatientPreparedRow[] = []
 const errors: string[] = []
 let matched = false
 for (const sheet of workbook.worksheets) {
  const result = parseOutpatientMatrixSheet(sheet, year, groups, seen)
  matched ||= result.matched
  rows.push(...result.rows)
  errors.push(...result.errors)
  if (rows.length > MAX_DATA_ROWS) throw new Error('Workbook melebihi batas ' + MAX_DATA_ROWS + ' baris data.')
 }
 return { matched, rows, errors }
}
