// Pure parsing/mapping functions; no database or browser storage.
export type ImportField = { code: string; label: string; type: string; options?: string[] }
export type RawCell = string | number | boolean | null
export type RawRow = { row: number; cells: RawCell[] }
export const LEGACY_HEADERS = ['Timestamp','Insiden','Tanggal','Jam','Ruangan','Lokasi Spesifik','Diagnosa','Tipe Insiden','Dampak ke Pasien','Kronologi','Gender','Pembiayaan','Tanggal Masuk','Jam Masuk','Penemu Insiden','Pelaksana Pertolongan','Tindakan yang Dilakukan','Probabilitas','Pernah Terjadi di RS','Tindakan Pencegahan Langsung','Nama Petugas','Ruang Tugas','Finalisasi Laporan']
const aliases: Record<string,string[]> = {
 A1:['insiden','insiden yang terjadi','ringkasan'], A2:['tanggal','tanggal insiden'], A3:['jam','jam insiden'], A4:['ruangan','lokasi insiden'], A5:['lokasi spesifik','ruang perawatan pasien'], A6:['diagnosa','diagnosis','diagnosa pasien'], A7:['tipe insiden','jenis insiden'], A8:['dampak ke pasien','akibat dari insiden'], B1:['kronologi','kronologi kejadian'], C1:['nama pasien','nama pasien korban'], C2:['no rm','no rekam medis','nomor rekam medis'], C3:['usia','umur'], C4:['gender','jenis kelamin'], C5:['pembiayaan','penanggung biaya'], C6:['tanggal masuk','tanggal masuk rumah sakit'], C7:['jam masuk','jam masuk rumah sakit'], D1:['penemu insiden','orang pertama yang melaporkan insiden'], D2:['pelaksana pertolongan','petugas yang pertama kali segera melakukan tindakan penyelamatan'], D3:['tindakan yang dilakukan','tindakan yang segera dilakukan'], D4:['probabilitas','likelihood'], D5:['pernah terjadi di rs','kejadian yang sama pernah terjadi di ruangan lain'], D6:['tindakan pencegahan langsung','langkah pencegahan'], D7:['tingkat cedera','dampak pada pasien tingkat cedera'], E1:['nama petugas','nama pembuat laporan'], E2:['ruang tugas','unit kerja'], E3:['finalisasi laporan']
}
export const normalizeHeader = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
export const isLegacyHeader = (headers: string[]) => LEGACY_HEADERS.every((h,i)=>normalizeHeader(headers[i])===normalizeHeader(h))
export function detectMapping(headers: string[], fields: ImportField[]) {
 return Object.fromEntries(fields.map(f=>[f.code,headers.findIndex(h=>[normalizeHeader(f.code),normalizeHeader(f.label),normalizeHeader(f.code+' '+f.label),...(aliases[f.code]||[])].includes(normalizeHeader(h)))]))
}
export function excelDate(value: RawCell): string {
 if (value===null || value==='') return ''
 let y:number,m:number,d:number
 if (typeof value==='number') {
  if(!Number.isFinite(value)||value<61||value>2958465)return ''
  const dt=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000)
  return dt.toISOString().slice(0,10)
 }
 const s=String(value).trim()
 const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T| )/)
 const local=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
 if(iso){y=+iso[1];m=+iso[2];d=+iso[3]}else if(local){d=+local[1];m=+local[2];y=+local[3]}else return ''
 const dt=new Date(Date.UTC(y,m-1,d))
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?dt.toISOString().slice(0,10):''
}
export function excelTime(value: RawCell): string {
 if(value===null||value==='')return ''
 if(typeof value==='number'){if(!Number.isFinite(value)||value<0||value>=1)return '';const n=Math.round(value*1440);if(n>=1440)return '';return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 const s=String(value).trim();const match=s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/)||s.match(/T(\d{2}):(\d{2})/)
 return match&&+match[1]<24&&+match[2]<60?match[1].padStart(2,'0')+':'+match[2]:''
}
export function normalizeOption(code:string,raw:string,options:string[]) {
 const n=normalizeHeader(raw);if(!n)return ''
 const exact=options.find(o=>normalizeHeader(o)===n);if(exact)return exact
 if(code==='A7'){const k=n==='kpc'?'kpcs':n;return options.find(o=>normalizeHeader(o).split(' ').includes(k))||''}
 if(code==='C4'){if(['l','laki laki','pria','male'].includes(n))return options.find(o=>normalizeHeader(o)==='laki laki')||'';if(['p','wanita','female','perempuan'].includes(n))return options.find(o=>normalizeHeader(o)==='perempuan')||''}
 if(code==='C5'){if(['jkn','bpjs','bpjs kesehatan'].includes(n))return options.find(o=>o.startsWith('BPJS'))||'';if(n==='umum')return options.find(o=>o.startsWith('Umum'))||''}
 if(code==='D4'){return options.find(o=>normalizeHeader(o).startsWith(n+' '))||''}
 if(code==='D7'&&['tidak ada','tidak ada cedera'].includes(n))return options.find(o=>o.startsWith('Tidak signifikan'))||''
 return ''
}
export function normalizeRow(row:RawRow,headers:string[],mapping:Record<string,number>,fields:ImportField[],rooms:{id:number;name:string}[]) {
 const warnings:string[]=[];const data:Record<string,string>={}
 const legacy=isLegacyHeader(headers)
 const shifted=legacy&&row.cells.length>=26&&['laki laki','perempuan'].includes(normalizeHeader(row.cells[13]))&&String(row.cells[11]??'').trim()!==''&&/tahun|bulan|hari/i.test(String(row.cells[12]??''))
 const rawAt=(code:string)=>{let i=mapping[code]??-1;if(shifted){if(code==='C1')i=10;else if(code==='C2')i=11;else if(code==='C3')i=12;else if(i>=10&&i<=22)i+=3}return i>=0?row.cells[i]??null:null}
 if(shifted)warnings.push('Tiga kolom identitas tambahan terdeteksi sebelum gender; verifikasi pemetaan.')
 else if(row.cells.length>headers.length)warnings.push('Kolom tambahan tanpa judul dipertahankan di sumber; perlu diperiksa.')
 for(const field of fields){
  const raw=rawAt(field.code);const s=String(raw??'').trim();let v=s
  if(field.type==='date')v=excelDate(raw)
  else if(field.type==='time')v=excelTime(raw)
  else if(field.options)v=normalizeOption(field.code,s,field.options)
  if(s&&!v)warnings.push(field.code+' tidak sesuai format/pilihan; nilai asli dipertahankan.')
  data[field.code]=v
 }
 if(legacy){
  if(!data.D7&&normalizeHeader(data.A8)==='tidak ada')data.D7=normalizeOption('D7',data.A8,fields.find(f=>f.code==='D7')?.options||[])
  if(!data.D5&&rawAt('D5'))warnings.push('Pernah terjadi di RS tidak selalu sama dengan kejadian di ruangan lain.')
 }
 if(data.A7.includes('(KTD)')&&data.D7.startsWith('Tidak signifikan'))warnings.push('KTD tanpa cedera tercatat; validasi klasifikasi.')
 const room=rooms.find(r=>normalizeHeader(r.name)===normalizeHeader(data.E2))
 if(data.E2&&!room)warnings.push('Unit pelapor belum cocok dengan master.')
 if(room)data.E2=room.name
 const blocked=!data.A1||!data.A2||!data.A7
 if(blocked)warnings.push('Judul, tanggal dan jenis insiden wajib untuk impor.')
 return {data,warnings,blocked,roomId:room?.id??null,shifted}
}
export function mergeMissing(existing:Record<string,string>,incoming:Record<string,string>) {
 const result={...existing}
 for(const [key,value] of Object.entries(incoming))if(value&&(!result[key]||key.startsWith('_import_')))result[key]=value
 return result
}
