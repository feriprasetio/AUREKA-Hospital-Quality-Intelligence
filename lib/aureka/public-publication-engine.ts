import { NATIONAL_INDICATORS } from './national-indicators.ts'
import type { IndicatorResult } from './quality-results-engine.ts'
const normalized = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const aliases: Record<string,string> = {
  'kecepatan respon terhadap komplain':'KWTK',
  'kepatuhan jam visite dokter spesialis':'KWVD',
  'kepatuhan upaya pencegahan risiko cedera akibat pasien jatuh':'KPRPJ',
  'indeks kepuasan pasien':'IKP',
  'waktu tanggap operasi sectio caesarea emergency':'WTSC',
  'waktu lapor hasil tes kritis laboratorium':'PHKL',
}
export function nationalCode(title: unknown): string | undefined {
  const key = normalized(title)
  return NATIONAL_INDICATORS.find(([,name]) => normalized(name) === key)?.[0] ?? aliases[key]
}
export function buildPublicInm(results: IndicatorResult[], year: number, month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Bulan tidak valid.')
  const period = String(year)+'-'+String(month).padStart(2,'0')
  const mapped = new Map<string, IndicatorResult>()
  for (const r of results) {
    if (!/^INM\b/i.test(String(r.profile.indicator_type ?? ''))) continue
    const code = nationalCode(r.profile.title)
    if (!code) throw new Error('Pemetaan profil INM belum lengkap. Tinjau master indikator.')
    if (mapped.has(code)) throw new Error('Profil INM ganda. Rekonsiliasi definisi dan unit sebelum publikasi.')
    mapped.set(code,r)
  }
  if (mapped.size !== NATIONAL_INDICATORS.length) throw new Error('Cakupan 13 profil INM belum lengkap atau akses sumber tidak memadai.')
  const indicators = []
  for (const [code,title] of NATIONAL_INDICATORS) {
    const r = mapped.get(code)!
    const m = r.monthly.find(item=>item.month===month)
    if (!m || m.validatedRecords < 1) continue
    const actual = r.continuous ? m.mean : m.rate
    const rawTarget = r.profile.target_value
    const target = rawTarget == null || String(rawTarget).trim()==='' ? NaN : Number(rawTarget)
    const operator = String(r.profile.target_operator ?? '')
    if (actual == null || !Number.isFinite(actual) || !Number.isFinite(target) || !['>=','>','<=','<','='].includes(operator)) continue
    if (!r.continuous && (!Number.isFinite(m.numerator) || !Number.isFinite(m.denominator) || m.denominator < 5)) continue
    if (r.continuous && m.observations < 5) continue
    const met = operator==='>='?actual>=target:operator==='>'?actual>target:operator==='<='?actual<=target:operator==='<'?actual<target:actual===target
    indicators.push({code,title,actual,target,operator,unit:r.continuous?r.unit:'%',period,
      numerator:r.continuous?null:m.numerator,denominator:r.continuous?null:m.denominator,
      source:'Indikator Mutu tervalidasi · profil '+String(r.profile.code)+' · '+period,
      status:met?'Memenuhi target':'Belum memenuhi target'})
  }
  if (!indicators.length) throw new Error('Belum ada hasil INM tervalidasi yang memenuhi syarat publikasi pada periode ini.')
  return {indicators}
}
export type PublicCount = {label:string;count:number}
export function safePublicPartition(rows: PublicCount[]): PublicCount[] {
  if (!rows.length || rows.some(r=>!Number.isSafeInteger(r.count)||r.count<0||(r.count>0&&r.count<5))) return []
  return rows.some(r=>r.count>0)?rows:[]
}
