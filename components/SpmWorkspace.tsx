'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import SpmExcelImportDialog from '@/components/SpmExcelImportDialog'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import {
  aggregateSpmMonths,
  calculateSpmMonthly,
  type SpmIndicator,
  type SpmSourceSummary,
} from '@/lib/aureka/spm-engine'

type Indicator = SpmIndicator & {
  id: string
  code: string
  profile_year: number
  group_name: string
  group_order: number
  indicator_order: number
  title: string
  target_text: string | null
  target_operator: string
  numerator_definition: string | null
  denominator_definition: string | null
  unit_of_measure: string | null
  owner_room_id: number | null
  source_mode: 'standalone' | 'quality_linked' | 'quality_denominator_linked'
  calculation_config: Record<string, any>
}
type Measurement = {
  id: string
  indicator_id: string
  profile_year: number
  period_month: number
  input_json: Record<string, unknown>
  status: 'draft' | 'submitted' | 'validated'
  notes: string | null
  updated_at: string
  room_id: number | null
}
type Room = { id: number; name: string; code: string }
type Tab = 'overview' | 'entry' | 'config'

const q = () => aurekaSupabase.schema('aureka_quality')
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const METHODS = [
  { value: 'ratio', label: 'Rasio numerator / denominator' },
  { value: 'time_average', label: 'Rerata waktu atau durasi' },
  { value: 'score_to_percent', label: 'Skor rerata menjadi persentase' },
  { value: 'manual_value', label: 'Nilai tunggal / manual' },
  { value: 'no_event_rate', label: 'Tidak ada kejadian (1 - event / denominator)' },
] as const

function methodLabel(value: unknown) {
  return METHODS.find(item => item.value === value)?.label ?? 'Rasio numerator / denominator'
}
function asNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function fmtNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return 'Belum ada data'
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function resultUnit(indicator: Indicator) {
  return String(indicator.calculation_config?.result_unit ?? indicator.unit_of_measure ?? '').toLowerCase()
}
function formatResult(indicator: Indicator, value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Belum ada data'
  const unit = resultUnit(indicator)
  if (unit === 'persen' || unit === 'percentage') return fmtNumber(value) + '%'
  if (unit === 'proporsi' || unit === 'proportion') return fmtNumber(value * 100) + '%'
  const label = indicator.calculation_config?.result_unit || indicator.unit_of_measure
  return fmtNumber(value) + (label && !['nilai','proporsi'].includes(String(label).toLowerCase()) ? ' ' + label : '')
}
function formatTarget(indicator: Indicator) {
  const value = asNumber(indicator.target_value)
  const op = indicator.target_operator || '='
  if (value == null) return indicator.target_text || 'Target belum ditetapkan'
  const rawTarget = String(indicator.target_text ?? '').trim()
  if (rawTarget && /[A-Za-z()/]/.test(rawTarget)) return op + ' ' + rawTarget
  const unit = resultUnit(indicator)
  let shown = fmtNumber(value)
  if (unit === 'proporsi' || unit === 'proportion') shown = fmtNumber(value * 100) + '%'
  else if (unit === 'persen' || unit === 'percentage') shown += '%'
  else if (indicator.unit_of_measure && !['nilai','proporsi','persen'].includes(indicator.unit_of_measure.toLowerCase())) shown += ' ' + indicator.unit_of_measure
  return op + ' ' + shown
}
function statusText(status: string) {
  if (status === 'met') return 'Memenuhi'
  if (status === 'not_met') return 'Belum memenuhi'
  if (status === 'invalid') return 'Perlu koreksi'
  return 'Belum ada data'
}
function sourceText(indicator: Indicator) {
  if (indicator.source_mode === 'quality_linked') return 'Indikator Mutu · baca-saja'
  if (indicator.source_mode === 'quality_denominator_linked') return 'Denominator Indikator Mutu · numerator SPM'
  return 'Logbook SPM mandiri'
}
function inputKeys(indicator: Indicator) {
  const method = indicator.calculation_config?.method ?? 'ratio'
  if (indicator.source_mode === 'quality_linked') return []
  if (indicator.source_mode === 'quality_denominator_linked') return ['numerator']
  if (method === 'no_event_rate') return ['numerator','denominator']
  if (method === 'score_to_percent') return ['score_mean', 'respondents']
  if (method === 'manual_value') return ['value']
  return ['numerator', 'denominator']
}

export default function SpmWorkspace({ role, currentRoomId }: { role: string | null; currentRoomId: number | null }) {
  const initialYear = new Date().getFullYear()
  const [year, setYear] = useState(initialYear)
  const [yearDraft, setYearDraft] = useState(String(initialYear))
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [importOpen, setImportOpen] = useState(false)
  const [openImportAfterYearLoad, setOpenImportAfterYearLoad] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [groupFilter, setGroupFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(currentRoomId != null && [22,23,24,25,26,27].includes(Number(currentRoomId)) ? Number(currentRoomId) : null)
  const [annualDrafts, setAnnualDrafts] = useState<Record<string, string>>({})
  const [sourceSummary, setSourceSummary] = useState<SpmSourceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sourceWarning, setSourceWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Indicator | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [editNotes, setEditNotes] = useState('')
  const [configuring, setConfiguring] = useState<Indicator | null>(null)
  const [configForm, setConfigForm] = useState<Record<string, string>>({})

  const isManager = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR'].includes(role || '')
  const canConfigure = role === 'ADMIN' || role === 'PMKP'
  const canImport = role === 'ADMIN' || role === 'PMKP'
  const canEdit = (indicator: Indicator) => {
    const roomId = indicator.group_name === 'Instalasi Rawat Inap' ? activeRoomId : indicator.owner_room_id
    if (indicator.group_name === 'Instalasi Rawat Inap' && roomId == null) return false
    return isManager || (role === 'PIC' && roomId != null && rooms.some(room => Number(room.id) === Number(roomId)))
  }

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError('')
    setSourceWarning('')
    try {
      const { error: profileSetupError } = await q().rpc('ensure_spm_profile', { p_year: year })
      if (profileSetupError) throw profileSetupError

      const [profileResult, measurementResult, sourceResult, roomResult] = await Promise.all([
        q().from('spm_indicators').select('*').eq('profile_year', year).eq('is_active', true).order('group_order').order('indicator_order'),
        q().from('spm_monthly_measurements').select('id,indicator_id,profile_year,period_month,room_id,input_json,status,notes,updated_at').eq('profile_year', year),
        q().rpc('spm_quality_source_summary', { p_year: year }),
        aurekaSupabase.from('master_rooms').select('id,name,code').eq('is_active', true).order('sort_order'),
      ])
      if (profileResult.error) throw profileResult.error
      if (measurementResult.error) throw measurementResult.error
      setIndicators((profileResult.data ?? []) as Indicator[])
      setMeasurements((measurementResult.data ?? []) as Measurement[])
      if (!roomResult.error) {
        const allRooms = (roomResult.data ?? []) as Room[]
        if (['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS'].includes(role || '')) setRooms(allRooms)
        else {
          const { data: authData } = await aurekaSupabase.auth.getUser()
          const { data: assignments } = await aurekaSupabase.schema('aureka_system').from('user_room_assignments').select('room_id').eq('user_id', authData.user?.id ?? '').eq('is_active', true)
          const allowed = new Set((assignments ?? []).map((item: any) => Number(item.room_id)))
          if (currentRoomId != null) allowed.add(Number(currentRoomId))
          setRooms(allRooms.filter(room => allowed.has(Number(room.id))))
        }
      }
      if (sourceResult.error) {
        setSourceSummary(null)
        setSourceWarning('Sumber Indikator Mutu belum tersedia untuk tahun ini. Pengukuran SPM mandiri tetap dapat dikelola.')
      } else {
        setSourceSummary((sourceResult.data ?? null) as SpmSourceSummary | null)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String((cause as any)?.message || cause)
      setError(/spm_indicators|spm_monthly_measurements|schema cache|does not exist|could not find/i.test(message)
        ? 'Modul SPM belum tersedia pada basis data. Jalankan migrasi SPM AUREKA terlebih dahulu.'
        : /1900|2200|tahun spm|profil spm/i.test(message)
          ? 'Tahun SPM harus berupa bilangan bulat antara 1900 dan 2200.'
          : 'Data SPM belum dapat dimuat. Periksa koneksi, hak akses, dan migrasi basis data.')
    } finally {
      setLoading(false)
    }
  }, [year, role, currentRoomId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setYearDraft(String(year)) }, [year])
  useEffect(() => {
    if (!openImportAfterYearLoad || loading) return
    if (error) {
      setOpenImportAfterYearLoad(false)
      return
    }
    if (indicators.length > 0 && indicators.every(item => Number(item.profile_year) === year)) {
      setOpenImportAfterYearLoad(false)
      setImportOpen(true)
    }
  }, [openImportAfterYearLoad, loading, error, indicators, year])

  const commitYear = () => {
    const nextYear = Number(yearDraft.trim())
    if (!Number.isInteger(nextYear) || nextYear < 1900 || nextYear > 2200) {
      setYearDraft(String(year))
      setNotice('Tahun SPM harus berupa bilangan bulat antara 1900 dan 2200.')
      return false
    }
    setYearDraft(String(nextYear))
    setNotice('')
    if (nextYear !== year) setYear(nextYear)
    return true
  }

  const openXlsxImport = () => {
    const nextYear = Number(yearDraft.trim())
    if (!Number.isInteger(nextYear) || nextYear < 1900 || nextYear > 2200) {
      setYearDraft(String(year))
      setNotice('Tahun SPM harus berupa bilangan bulat antara 1900 dan 2200.')
      return
    }
    setYearDraft(String(nextYear))
    if (nextYear !== year) {
      setOpenImportAfterYearLoad(true)
      setYear(nextYear)
      return
    }
    if (loading || indicators.length === 0 || indicators.some(item => Number(item.profile_year) !== nextYear)) {
      setOpenImportAfterYearLoad(true)
      void load()
      return
    }
    setImportOpen(true)
  }

  const measurementMap = useMemo(() => {
    const map = new Map<string, Measurement>()
    measurements.forEach(item => map.set(item.indicator_id + ':' + item.period_month + ':' + (item.room_id ?? 'all'), item))
    return map
  }, [measurements])

  const groups = useMemo(() => {
    const seen = new Map<string, number>()
    indicators.forEach(item => seen.set(item.group_name, item.group_order))
    return Array.from(seen.entries()).sort((a,b) => a[1] - b[1]).map(([name]) => name)
  }, [indicators])

  const inpatientRoomIds = [22,23,24,25,26,27]
  const activeRoomId = selectedRoomId
  const measurementKey = (indicator: Indicator, monthNumber: number) => indicator.id + ':' + monthNumber + ':' + ((indicator.group_name === 'Instalasi Rawat Inap' ? activeRoomId : indicator.owner_room_id) ?? 'all')
  const measurementFor = (indicator: Indicator, monthNumber: number): Measurement | undefined => {
    if (indicator.group_name === 'Instalasi Rawat Inap' && activeRoomId == null) {
      const unitRows = inpatientRoomIds.map(roomId => measurementMap.get(indicator.id + ':' + monthNumber + ':' + roomId)).filter(Boolean) as Measurement[]
      if (!unitRows.length) return measurementMap.get(indicator.id + ':' + monthNumber + ':all')
      const input: Record<string, number> = {}
      const keys = inputKeys(indicator)
      for (const key of keys) {
        if (key === 'score_mean') {
          const respondents = unitRows.reduce((sum,row) => sum + Number(row.input_json.respondents ?? 0), 0)
          input.score_mean = respondents > 0 ? unitRows.reduce((sum,row) => sum + Number(row.input_json.score_mean ?? 0) * Number(row.input_json.respondents ?? 0), 0) / respondents : 0
          input.respondents = respondents
        } else input[key] = unitRows.reduce((sum,row) => sum + Number(row.input_json[key] ?? 0), 0)
      }
      return { ...unitRows[0], input_json: input, room_id: null }
    }
    return measurementMap.get(measurementKey(indicator, monthNumber))
  }

  useEffect(() => {
    if (selectedRoomId != null && inpatientRoomIds.includes(Number(selectedRoomId)) && rooms.some(room => Number(room.id) === Number(selectedRoomId))) return
    if (selectedRoomId == null && isManager) return
    const preferred = currentRoomId != null && inpatientRoomIds.includes(Number(currentRoomId)) && rooms.some(room => Number(room.id) === Number(currentRoomId))
      ? Number(currentRoomId)
      : rooms.find(room => inpatientRoomIds.includes(Number(room.id)))?.id ?? null
    setSelectedRoomId(preferred == null ? null : Number(preferred))
  }, [rooms, selectedRoomId, currentRoomId, isManager])

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const indicator of indicators) {
      for (let m = 1; m <= 12; m++) {
        const saved = measurementFor(indicator, m)
        for (const key of inputKeys(indicator)) next[indicator.id + ':' + m + ':' + key] = saved?.input_json?.[key] == null ? '' : String(saved.input_json[key])
      }
    }
    setAnnualDrafts(next)
  }, [indicators, measurementMap, selectedRoomId])

  const calculations = useMemo(() => {
    const monthly = new Map<string, ReturnType<typeof calculateSpmMonthly>>()
    const annual = new Map<string, ReturnType<typeof aggregateSpmMonths>>()
    for (const indicator of indicators) {
      const months = Array.from({ length: 12 }, (_, index) => {
        const m = index + 1
        const saved = measurementFor(indicator, m)
        const input = saved?.input_json ?? {}
        const monthResult = calculateSpmMonthly(indicator, input, sourceSummary, m)
        monthly.set(indicator.id + ':' + m, monthResult)
        return monthResult
      })
      annual.set(indicator.id, aggregateSpmMonths(indicator, months))
    }
    return { monthly, annual }
  }, [indicators, measurementMap, sourceSummary, selectedRoomId])

  const visibleIndicators = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID')
    return indicators.filter(item =>
      (groupFilter === 'all' || item.group_name === groupFilter) &&
      (!term || item.title.toLocaleLowerCase('id-ID').includes(term) || item.code.toLowerCase().includes(term) || item.group_name.toLocaleLowerCase('id-ID').includes(term)),
    )
  }, [indicators, groupFilter, search])

  const currentStats = useMemo(() => {
    const values = indicators.map(item => calculations.monthly.get(item.id + ':' + month)?.status ?? 'no_data')
    return {
      total: indicators.length,
      met: values.filter(value => value === 'met').length,
      notMet: values.filter(value => value === 'not_met').length,
      noData: values.filter(value => value === 'no_data').length,
      invalid: values.filter(value => value === 'invalid').length,
    }
  }, [indicators, calculations, month])

  const openEdit = (indicator: Indicator) => {
    const saved = measurementMap.get(measurementKey(indicator, month))
    const initial = saved?.input_json ?? {}
    const values: Record<string, string> = {}
    inputKeys(indicator).forEach(key => { values[key] = initial[key] == null ? '' : String(initial[key]) })
    setEditValues(values)
    setEditNotes(saved?.notes ?? '')
    setEditing(indicator)
    setNotice('')
  }

  const saveMeasurement = async () => {
    if (!editing || saving) return
    const next: Record<string, number> = {}
    for (const key of inputKeys(editing)) {
      const value = asNumber(editValues[key])
      if (value == null || value < 0) {
        setNotice('Lengkapi seluruh angka dengan nilai numerik yang valid dan tidak negatif.')
        return
      }
      next[key] = value
    }
    if (editing.calculation_config?.method === 'ratio' || editing.calculation_config?.method === 'time_average') {
      if (!next.denominator || next.denominator <= 0) {
        setNotice('Denominator harus lebih besar dari nol.')
        return
      }
    }
    if (editing.calculation_config?.method === 'score_to_percent') {
      if (!next.respondents || next.respondents <= 0) {
        setNotice('Jumlah responden harus lebih besar dari nol.')
        return
      }
    }
    const currentDenominator = editing.source_mode === 'quality_denominator_linked'
      ? Number(sourceSummary?.falls?.find(item => Number(item.month) === month)?.denominator ?? 0)
      : null
    if (editing.source_mode === 'quality_denominator_linked' && currentDenominator != null && currentDenominator > 0 && next.numerator > currentDenominator) {
      setNotice('Numerator tidak boleh melebihi jumlah pasien yang menjadi denominator dari Indikator Mutu.')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      const { error: saveError } = await q().from('spm_monthly_measurements').upsert({
        indicator_id: editing.id,
        profile_year: year,
        period_month: month,
        room_id: editing.group_name === 'Instalasi Rawat Inap' ? activeRoomId : editing.owner_room_id,
        input_json: next,
        status: 'submitted',
        notes: editNotes.trim() || null,
        entered_by: (await aurekaSupabase.auth.getUser()).data.user?.id ?? null,
        updated_by: (await aurekaSupabase.auth.getUser()).data.user?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'indicator_id,profile_year,period_month,room_id' })
      if (saveError) throw saveError
      setEditing(null)
      setNotice('Pengukuran SPM berhasil disimpan.')
      await load(true)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String((cause as any)?.message || cause)
      setNotice(/row-level security|permission|not allowed/i.test(message)
        ? 'Akun tidak memiliki kewenangan untuk mengubah indikator SPM pada kelompok ini.'
        : 'Pengukuran belum berhasil disimpan. Periksa koneksi dan migrasi SPM.')
    } finally {
      setSaving(false)
    }
  }

  const saveAnnualMeasurements = async () => {
    if (saving) return
    const payload: Array<Record<string, unknown>> = []
    const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
    if (authError || !authData.user?.id) { setNotice('Sesi login tidak tersedia. Silakan masuk kembali.'); return }
    for (const indicator of visibleIndicators) {
      if (!canEdit(indicator) || indicator.source_mode === 'quality_linked') continue
      if (indicator.source_mode === 'quality_denominator_linked' && indicator.group_name === 'Instalasi Rawat Inap') continue
      const roomId = indicator.group_name === 'Instalasi Rawat Inap' ? activeRoomId : indicator.owner_room_id
      if (indicator.group_name === 'Instalasi Rawat Inap' && roomId == null) continue
      for (let m = 1; m <= 12; m++) {
        const keys = inputKeys(indicator)
        if (!keys.length) continue
        const input: Record<string, number> = {}
        let hasAny = false
        for (const key of keys) {
          const raw = annualDrafts[indicator.id + ':' + m + ':' + key] ?? ''
          if (raw.trim() === '') continue
          const value = asNumber(raw)
          if (value == null || value < 0) { setNotice(indicator.code + ' bulan ' + MONTHS[m-1] + ': nilai harus numerik dan tidak negatif.'); return }
          input[key] = value; hasAny = true
        }
        if (!hasAny) continue
        if (keys.some(key => input[key] == null)) { setNotice(indicator.code + ' bulan ' + MONTHS[m-1] + ': lengkapi seluruh parameter sebelum menyimpan.'); return }
        const method = indicator.calculation_config?.method
        if ((method === 'ratio' || method === 'time_average' || method === 'no_event_rate') && Number(input.denominator) <= 0) { setNotice(indicator.code + ' bulan ' + MONTHS[m-1] + ': denominator harus lebih besar dari nol.'); return }
        if (method === 'score_to_percent' && Number(input.respondents) <= 0) { setNotice(indicator.code + ' bulan ' + MONTHS[m-1] + ': jumlah responden harus lebih besar dari nol.'); return }
        const existing = measurementMap.get(indicator.id + ':' + m + ':' + (roomId ?? 'all'))
        if (existing && JSON.stringify(existing.input_json) === JSON.stringify(input)) continue
        payload.push({ indicator_id: indicator.id, profile_year: year, period_month: m, room_id: roomId, input_json: input, status: 'submitted', notes: existing?.notes ?? null, entered_by: authData.user.id, updated_by: authData.user.id, updated_at: new Date().toISOString() })
      }
    }
    if (!payload.length) { setNotice('Tidak ada perubahan nilai tahunan yang perlu disimpan.'); return }
    setSaving(true); setNotice('')
    try {
      const { error: saveError } = await q().from('spm_monthly_measurements').upsert(payload, { onConflict: 'indicator_id,profile_year,period_month,room_id' })
      if (saveError) throw saveError
      setNotice(payload.length + ' pengukuran bulanan berhasil disimpan. Status: Menunggu Verifikasi.')
      await load(true)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String((cause as any)?.message || cause)
      setNotice(/row-level security|permission|not allowed/i.test(message) ? 'Akun tidak memiliki kewenangan untuk menyimpan sebagian data unit yang dipilih.' : 'Penyimpanan tahunan gagal. ' + message)
    } finally { setSaving(false) }
  }

  const openConfig = (indicator: Indicator) => {
    if (!canConfigure) return
    const cfg = indicator.calculation_config ?? {}
    setConfigForm({
      method: String(cfg.method ?? 'ratio'),
      multiplier: String(cfg.multiplier ?? 1),
      scale_max: String(cfg.scale_max ?? 4),
      aggregation: String(cfg.aggregation ?? 'weighted_ratio'),
      result_unit: String(cfg.result_unit ?? indicator.unit_of_measure ?? 'proporsi'),
      target_operator: String(indicator.target_operator ?? '='),
      target_value: indicator.target_value == null ? '' : String(indicator.target_value),
      target_text: String(indicator.target_text ?? ''),
      unit_of_measure: String(indicator.unit_of_measure ?? ''),
      numerator_definition: String(indicator.numerator_definition ?? ''),
      denominator_definition: String(indicator.denominator_definition ?? ''),
    })
    setConfiguring(indicator)
    setNotice('')
  }

  const saveConfig = async () => {
    if (!configuring || !canConfigure || saving) return
    const multiplier = asNumber(configForm.multiplier)
    const targetValue = configForm.target_value.trim() === '' ? null : asNumber(configForm.target_value)
    if (multiplier == null || multiplier <= 0 || (configForm.target_value.trim() !== '' && targetValue == null)) {
      setNotice('Pengali dan target harus berupa angka yang valid.')
      return
    }
    const method = configuring.source_mode === 'quality_linked'
      ? 'ratio'
      : configuring.source_mode === 'quality_denominator_linked'
        ? 'no_event_rate'
        : configForm.method
    const calculationConfig = {
      ...(configuring.calculation_config ?? {}),
      method,
      multiplier,
      scale_max: asNumber(configForm.scale_max) ?? 4,
      aggregation: configForm.aggregation,
      result_unit: configForm.result_unit.trim() || configForm.unit_of_measure.trim() || 'nilai',
    }
    setSaving(true)
    setNotice('')
    try {
      const { error: configError } = await q().from('spm_indicators').update({
        calculation_config: calculationConfig,
        target_operator: configForm.target_operator,
        target_value: targetValue,
        target_text: configForm.target_text.trim() || null,
        unit_of_measure: configForm.unit_of_measure.trim() || null,
        numerator_definition: configForm.numerator_definition.trim() || null,
        denominator_definition: configForm.denominator_definition.trim() || null,
        updated_by: (await aurekaSupabase.auth.getUser()).data.user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', configuring.id)
      if (configError) throw configError
      setConfiguring(null)
      setNotice('Konfigurasi perhitungan berhasil diperbarui.')
      await load(true)
    } catch {
      setNotice('Konfigurasi belum dapat disimpan. Pastikan akun Admin/PMKP dan migrasi SPM aktif.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <AsyncStatePanel state="loading" title="Memuat Standar Pelayanan Minimal" description="Mengambil master indikator, pengukuran, dan sumber data mutu." compact />
  if (error) return <AsyncStatePanel state="error" title="Modul SPM belum siap" description={error} retrying={loading} onRetry={() => void load()} compact />

  return (
    <section className="spmWorkspace">
      <header className="spmHero">
        <div>
          <div className="spmEyebrow">AUREKA · Quality & Performance</div>
          <h1>Standar Pelayanan Minimal</h1>
          <p>Monitoring 98 indikator SPM rumah sakit, dengan logbook mandiri dan dua integrasi baca-saja ke sumber Indikator Mutu.</p>
        </div>
        <div className="spmHeroFilters">
          <label>Tahun
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={2200}
              step={1}
              value={yearDraft}
              onChange={event => setYearDraft(event.target.value)}
              onBlur={commitYear}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitYear() } }}
              aria-label="Tahun pengukuran SPM"
            />
          </label>
          <label>Bulan
            <select value={month} onChange={event => setMonth(Number(event.target.value))}>
              {MONTHS.map((name,index) => <option key={name} value={index+1}>{name}</option>)}
            </select>
          </label>
          {canImport && <button type="button" className="spmPrimary spmUploadButton" onClick={openXlsxImport}>Unggah XLSX</button>}
        </div>
      </header>

      {sourceWarning && <div className="spmNotice warning">{sourceWarning}</div>}
      {notice && <div className="spmNotice" role="status">{notice}</div>}

      <div className="spmKpis">
        <article><span>Total indikator</span><strong>{currentStats.total}</strong><small>Master SPM {year}</small></article>
        <article className="positive"><span>Memenuhi standar</span><strong>{currentStats.met}</strong><small>{month ? MONTHS[month-1] : ''}</small></article>
        <article className="negative"><span>Belum memenuhi</span><strong>{currentStats.notMet}</strong><small>Perlu tindak lanjut</small></article>
        <article><span>Belum ada data</span><strong>{currentStats.noData}</strong><small>{currentStats.invalid} data perlu koreksi</small></article>
      </div>

      <nav className="spmTabs" aria-label="Navigasi Standar Pelayanan Minimal">
        {([
          ['overview','Ringkasan'],
          ['entry','Input & Monitoring'],
          ['config','Konfigurasi Perhitungan'],
        ] as Array<[Tab,string]>).map(([id,label]) =>
          <button type="button" key={id} className={tab===id?'active':''} onClick={() => setTab(id)}>{label}</button>
        )}
      </nav>

      <div className="spmFilters">
        <label>Kelompok pelayanan
          <select value={groupFilter} onChange={event => setGroupFilter(event.target.value)}>
            <option value="all">Seluruh kelompok pelayanan</option>
            {groups.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {groupFilter === 'Instalasi Rawat Inap' && <label>Unit rawat inap
          <select value={selectedRoomId ?? 'all'} onChange={event => setSelectedRoomId(event.target.value === 'all' ? null : Number(event.target.value))}>
            {(isManager || rooms.filter(room => inpatientRoomIds.includes(Number(room.id))).length > 1) && <option value="all">Semua unit — rekap instalasi</option>}
            <option value="" disabled>Pilih unit rawat inap</option>
            {rooms.filter(room => inpatientRoomIds.includes(Number(room.id))).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>}
        <label className="spmSearch">Cari indikator
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama atau kode indikator..." />
        </label>
        <span className="spmCount">{visibleIndicators.length} dari {indicators.length} indikator</span>
      </div>

      {tab === 'overview' && (
        <div className="spmOverview">
          <div className="spmOverviewIntro">
            <div><strong>Capaian {MONTHS[month-1]} {year}</strong><span>Status dihitung dari data yang tersedia. Data kosong tidak dianggap 0% atau memenuhi target.</span></div>
            <span className="spmInfoTag">22 kelompok pelayanan</span>
          </div>
          <div className="spmGroupGrid">
            {groups.filter(name => groupFilter==='all' || name===groupFilter).map(name => {
              const items = indicators.filter(item => item.group_name === name)
              const met = items.filter(item => calculations.monthly.get(item.id+':'+month)?.status==='met').length
              const missing = items.filter(item => calculations.monthly.get(item.id+':'+month)?.status==='no_data').length
              return <button type="button" key={name} className="spmGroupCard" onClick={() => {setGroupFilter(name);setTab('entry')}}>
                <span>{name}</span><strong>{met} / {items.length}</strong><small>{missing} belum ada data</small>
                <span className="spmMiniTrack"><i style={{width:(items.length ? met/items.length*100 : 0)+'%'}} /></span>
              </button>
            })}
          </div>
        </div>
      )}

      {(tab === 'entry' || tab === 'config') && (
        <div className="spmTablePanel">
          <div className="spmTableHead">
            <div><strong>{tab==='entry'?'Lembar kerja tahunan':'Master dan aturan perhitungan'}</strong><span>{tab==='entry'?'Januari–Desember ditampilkan sekaligus. Perubahan dapat disimpan dalam satu kali proses.':'Metode awal dapat disesuaikan oleh Admin/PMKP.'}</span></div>
            {tab==='entry' && <button type="button" className="spmPrimary" disabled={saving || (groupFilter==='Instalasi Rawat Inap' && activeRoomId==null)} onClick={() => void saveAnnualMeasurements()}>{saving?'Menyimpan…':'Simpan perubahan tahunan'}</button>}
            {tab==='config' && !canConfigure && <span className="spmInfoTag">Baca-saja · Admin/PMKP dapat mengubah</span>}
          </div>
          <div className="spmTableScroll">
            <table>
              <thead><tr>
                <th>Kode</th><th>Indikator / kelompok</th>
                {tab==='entry' ? <>{MONTHS.map(name => <th key={name}>{name.slice(0,3)}</th>)}<th>Target</th><th>Sumber</th> : <><th>Target</th><th>Metode aktif</th><th>Definisi N / D</th><th>Sumber</th><th>Aksi</th></>}
                  : <><th>Metode aktif</th><th>Definisi N / D</th><th>Sumber</th><th>Aksi</th></>}
              </tr></thead>
              <tbody>
                {visibleIndicators.map(indicator => {
                  const canChange = canEdit(indicator)
                  return <tr key={indicator.id}>
                    <td><code>{indicator.code}</code></td>
                    <td><strong>{indicator.title}</strong><small>{indicator.group_name}</small></td>
                    {tab==='entry' ? <>
                      {MONTHS.map((name,index) => {
                        const monthNumber = index + 1
                        const rowMeasurement = measurementFor(indicator, monthNumber)
                        const keys = inputKeys(indicator)
                        const roomMissing = indicator.group_name === 'Instalasi Rawat Inap' && activeRoomId == null
                        const linkedRoomUnsupported = indicator.source_mode === 'quality_denominator_linked' && indicator.group_name === 'Instalasi Rawat Inap'
                        return <td className="spmAnnualCell" key={name}>
                          {keys.length === 0 ? <span className="spmLocked">Otomatis</span> : linkedRoomUnsupported ? <span className="spmLocked" title="Denominator per unit belum tersedia">Sumber per unit belum dipetakan</span> : keys.map(key => <input key={key} aria-label={indicator.code + ' ' + name + ' ' + key} type="number" min="0" step="any" placeholder={key==='numerator'?'N':key==='denominator'?'D':key==='score_mean'?'Skor':key==='respondents'?'n':'Nilai'} disabled={!canChange || roomMissing} value={annualDrafts[indicator.id + ':' + monthNumber + ':' + key] ?? ''} onChange={event => setAnnualDrafts(current => ({...current,[indicator.id + ':' + monthNumber + ':' + key]:event.target.value}))} />)}
                          {(() => { const result = calculations.monthly.get(indicator.id + ':' + monthNumber); return result ? <small className="spmAnnualResult">{formatResult(indicator,result.value)} · {statusText(result.status)}</small> : null })()}
                          {rowMeasurement?.status === 'validated' && <small className="spmValidatedMark">Tervalidasi</small>}
                        </td>
                      })}
                      <td>{formatTarget(indicator)}</td><td><span className="spmSource">{sourceText(indicator)}</span></td>
                    </> : <>
                      <td>{formatTarget(indicator)}</td>
                      <td>{methodLabel(indicator.calculation_config?.method)}</td>
                      <td className="spmDefinition"><span>N: {indicator.numerator_definition || '-'}</span><span>D: {indicator.denominator_definition || '-'}</span></td>
                      <td><span className="spmSource">{sourceText(indicator)}</span></td>
                      <td>{canConfigure ? <button type="button" className="spmAction" onClick={() => openConfig(indicator)}>Atur formula</button> : <span className="spmLocked">Baca-saja</span>}</td>
                    </>}
                  </tr>
                })}
                {!visibleIndicators.length && <tr><td colSpan={tab==='entry'?16:7} className="spmEmpty">Tidak ada indikator yang cocok dengan filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="spmOverlay" role="presentation" onMouseDown={event => {if(event.target===event.currentTarget)setEditing(null)}}>
          <form className="spmDialog" onSubmit={event => {event.preventDefault();void saveMeasurement()}}>
            <header><div><span>Input pengukuran · {MONTHS[month-1]} {year}</span><h2>{editing.title}</h2><small>{editing.code} · {editing.group_name}</small></div><button type="button" onClick={() => setEditing(null)} aria-label="Tutup">×</button></header>
            {editing.source_mode==='quality_denominator_linked' ? <>
              <div className="spmLinkedBox">
                <span>Denominator otomatis dari Indikator Mutu</span>
                <strong>{fmtNumber(sourceSummary?.falls?.find(item => Number(item.month)===month)?.denominator ?? 0,0)} pasien</strong>
                <small>Jumlah episode pasien PIC pada unit rawat inap yang telah berstatus Siap Ditinjau atau Tervalidasi.</small>
              </div>
              <label className="spmField">Jumlah pasien yang tidak mengalami kejadian jatuh yang berakibat kecacatan atau kematian (numerator)
                <input type="number" min="0" step="1" value={editValues.numerator ?? ''} onChange={event => setEditValues(current => ({...current,numerator:event.target.value}))} required />
              </label>
              <p className="spmHelp">Numerator diinput manual pada SPM. Denominator diambil otomatis dari jumlah pasien rawat inap yang telah dicatat PIC pada Indikator Mutu. Nilai numerator tidak boleh melebihi denominator.</p>
            </> : <>
              {inputKeys(editing).map(key => {
                const label = key==='numerator' ? editing.numerator_definition || 'Numerator (N)'
                  : key==='denominator' ? editing.denominator_definition || 'Denominator (D)'
                  : key==='score_mean' ? editing.numerator_definition || 'Rerata skor kepuasan'
                  : key==='respondents' ? editing.denominator_definition || 'Jumlah responden'
                  : editing.numerator_definition || 'Nilai capaian'
                return <label key={key} className="spmField">{label}
                  <input type="number" min="0" step="any" value={editValues[key] ?? ''} onChange={event => setEditValues(current => ({...current,[key]:event.target.value}))} required />
                </label>
              })}
              {editing.calculation_config?.method==='score_to_percent'&&<p className="spmHelp">Skor rerata dikonversi menjadi persentase berdasarkan skala maksimum {editing.calculation_config?.scale_max ?? 4}. Jumlah responden digunakan untuk agregasi berbobot.</p>}
            </>}
            <label className="spmField">Catatan / bukti pengukuran
              <textarea value={editNotes} rows={3} onChange={event => setEditNotes(event.target.value)} placeholder="Catatan sumber data, penjelasan, atau referensi dokumen..." />
            </label>
            {notice && <p className="spmDialogNotice" role="alert">{notice}</p>}
            <footer><button type="button" className="spmSecondary" onClick={() => setEditing(null)}>Batal</button><button type="submit" className="spmPrimary" disabled={saving}>{saving?'Menyimpan...':'Simpan pengukuran'}</button></footer>
          </form>
        </div>
      )}

      {configuring && (
        <div className="spmOverlay" role="presentation" onMouseDown={event => {if(event.target===event.currentTarget)setConfiguring(null)}}>
          <form className="spmDialog spmConfigDialog" onSubmit={event => {event.preventDefault();void saveConfig()}}>
            <header><div><span>Konfigurasi perhitungan</span><h2>{configuring.title}</h2><small>{configuring.code} · perubahan dicatat dalam audit log</small></div><button type="button" onClick={() => setConfiguring(null)} aria-label="Tutup">×</button></header>
            {configuring.source_mode!=='standalone' && <div className="spmLockedBox">Sumber data indikator ini dikunci sesuai integrasi mutu yang telah ditetapkan. Target dan pengali tetap dapat disesuaikan oleh Admin/PMKP.</div>}
            <div className="spmConfigGrid">
              <label className="spmField">Metode perhitungan
                <select value={configForm.method} disabled={configuring.source_mode!=='standalone'} onChange={event => setConfigForm(current => ({...current,method:event.target.value}))}>
                  {METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="spmField">Operator target
                <select value={configForm.target_operator} onChange={event => setConfigForm(current => ({...current,target_operator:event.target.value}))}>
                  {['=','≥','>','≤','<'].map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </label>
              <label className="spmField">Nilai target
                <input type="number" step="any" value={configForm.target_value} onChange={event => setConfigForm(current => ({...current,target_value:event.target.value}))} />
              </label>
              <label className="spmField">Pengali hasil
                <input type="number" min="0.000001" step="any" value={configForm.multiplier} onChange={event => setConfigForm(current => ({...current,multiplier:event.target.value}))} />
              </label>
              <label className="spmField">Skala maksimum (skor)
                <input type="number" min="0.000001" step="any" value={configForm.scale_max} onChange={event => setConfigForm(current => ({...current,scale_max:event.target.value}))} />
              </label>
              <label className="spmField">Satuan hasil
                <input value={configForm.result_unit} onChange={event => setConfigForm(current => ({...current,result_unit:event.target.value}))} />
              </label>
              <label className="spmField">Satuan indikator
                <input value={configForm.unit_of_measure} onChange={event => setConfigForm(current => ({...current,unit_of_measure:event.target.value}))} />
              </label>
              <label className="spmField">Agregasi tahunan
                <select value={configForm.aggregation} onChange={event => setConfigForm(current => ({...current,aggregation:event.target.value}))}>
                  <option value="weighted_ratio">Rasio berbobot (ΣN / ΣD)</option>
                  <option value="weighted_mean">Rerata berbobot responden</option>
                  <option value="monthly_average">Rerata capaian bulanan</option>
                  <option value="derived_ratio">Rasio hasil turunan</option>
                </select>
              </label>
            </div>
            <label className="spmField">Tampilan target
              <input value={configForm.target_text} onChange={event => setConfigForm(current => ({...current,target_text:event.target.value}))} placeholder="Contoh: ≥ 80%" />
            </label>
            <label className="spmField">Definisi numerator
              <textarea rows={2} value={configForm.numerator_definition} onChange={event => setConfigForm(current => ({...current,numerator_definition:event.target.value}))} />
            </label>
            <label className="spmField">Definisi denominator
              <textarea rows={2} value={configForm.denominator_definition} onChange={event => setConfigForm(current => ({...current,denominator_definition:event.target.value}))} />
            </label>
            <p className="spmHelp">Formula dijalankan oleh mesin perhitungan AUREKA dengan metode terstruktur. Kode ekspresi bebas tidak dieksekusi untuk mencegah formula yang tidak aman atau tidak dapat direproduksi.</p>
            {notice && <p className="spmDialogNotice" role="alert">{notice}</p>}
            <footer><button type="button" className="spmSecondary" onClick={() => setConfiguring(null)}>Batal</button><button type="submit" className="spmPrimary" disabled={saving}>{saving?'Menyimpan...':'Simpan konfigurasi'}</button></footer>
          </form>
        </div>
      )}

      <SpmExcelImportDialog
        open={importOpen && canImport}
        year={year}
        indicators={indicators}
        measurements={measurements}
        sourceSummary={sourceSummary}
        onClose={() => setImportOpen(false)}
        onImported={() => load(true)}
      />
    </section>
  )
}
