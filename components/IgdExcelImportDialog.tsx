'use client'

import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { useCallback, useMemo, useState } from 'react'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import {
  IGD_INDICATORS,
  assessIgdConsultationFlags,
  calculateIgdElapsedMinutes,
  igdLocalDate,
  normalizeIgdDateTime,
  normalizeIgdMrn,
  normalizeIgdText,
  parseIgdSourceChoice,
  reconcileIgdConsultation,
  type IgdMainMatchRow,
} from '@/lib/aureka/igd-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const ROOM_ID = 6
const PROFILE_YEAR = 2026
const MAIN_KEY_PREFIX = 'excel-pmkp-igd-2026:row:'
const BATCH_SIZE = 100
const MAX_MAIN_FILE_BYTES = 35 * 1024 * 1024
const MAX_SUPPLEMENT_FILE_BYTES = 20 * 1024 * 1024
const MAX_MAIN_ROWS = 20000
const MAX_SUPPLEMENT_ROWS = 2000

type Profile = Record<string, any>
type Layout = { roomId: number; fields: string[]; indicators: string[] }
type MainRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  admissionAt: string
  recordDate: string
  formFields: Record<string, string>
  indicatorCells: Record<string, string>
  sourceCells: Record<string, string>
  calculatedFields: Record<string, number | null>
  responses: Array<Record<string, unknown>>
  duplicateCount: number
  warnings: string[]
  payload: Record<string, any>
}
type ConsultationRow = {
  sourceWorkbook: string
  sourceSheet: string
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  age: string
  sex: string
  patientType: string
  edDoctor: string
  specialistDoctor: string
  nurse: string
  registeredAt: string | null
  consultationAt: string | null
  consultationMonth: number
  registrationToConsultationMinutes: number | null
  sourceDurationMinutes: number | null
  doorDecisionRaw: string
  doorDecisionCode: number | null
  attainmentRaw: string
  dpjpReasonRaw: string
  dpjpReasonCode: number | null
  otherReason: string
  matchStatus: 'matched' | 'ambiguous' | 'unmatched'
  linkedSourceRow: number | null
  candidateSourceRows: number[]
  matchDeltaSeconds: number | null
  reviewFlags: string[]
  sourceJson: Record<string, unknown>
}
type ImportSummary = {
  mainReceived: number
  mainImported: number
  mainSkipped: number
  consultationReceived: number
  consultationImported: number
  consultationSkipped: number
  matched: number
  ambiguous: number
  unmatched: number
}
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: Profile[]
  layout?: Layout
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}

function readCell(cell: any): unknown {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) return value.result
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => String(part?.text ?? '')).join('')
    if (typeof value.text === 'string') return value.text
    if (typeof value.hyperlink === 'string') return value.text ?? value.hyperlink
    if (typeof value.error === 'string') return value.error
    return ''
  }
  return value
}

function cellText(cell: any): string {
  const value = readCell(cell)
  if (value instanceof Date) return normalizeIgdDateTime(value) ?? ''
  return normalizeIgdText(value)
}

function headerMap(row: any): Map<string, number[]> {
  const output = new Map<string, number[]>()
  const count = Math.min(Number(row.cellCount ?? row.actualCellCount ?? 100), 100)
  for (let column = 1; column <= count; column++) {
    const label = cellText(row.getCell(column))
    if (!label) continue
    const key = normalizeExactHeader(label)
    const list = output.get(key) ?? []
    list.push(column)
    output.set(key, list)
  }
  return output
}

function findHeaderRow(sheet: any, required: Record<string, string[]>): { rowNumber: number; indexes: Record<string, number> } {
  for (let rowNumber = 1; rowNumber <= Math.min(40, sheet.rowCount); rowNumber++) {
    const columns = headerMap(sheet.getRow(rowNumber))
    const indexes: Record<string, number> = {}
    let valid = true
    for (const [field, aliases] of Object.entries(required)) {
      const found = aliases.map(alias => columns.get(normalizeExactHeader(alias))?.[0]).find(Boolean)
      if (!found) { valid = false; break }
      indexes[field] = found
    }
    if (valid) return { rowNumber, indexes }
  }
  throw new Error('Header sumber tidak ditemukan pada sheet "' + String(sheet.name ?? 'tanpa nama') + '".')
}

function rawCellValue(cell: any): string {
  const value = readCell(cell)
  if (value instanceof Date) return value.toISOString()
  return value == null ? '' : String(value)
}

function excelSerialMonthFromFileName(fileName: string): number | null {
  const lower = fileName.toLocaleLowerCase('id-ID')
  const monthNames = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember']
  const index = monthNames.findIndex(name => lower.includes(name))
  return index < 0 ? null : index + 1
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === ''
}

function countResponseMismatch(rows: ConsultationRow[]): number {
  return rows.filter(row => row.reviewFlags.includes('attainment_reason_code_mismatch')).length
}

function countThresholdMismatch(rows: ConsultationRow[]): number {
  return rows.filter(row => row.reviewFlags.includes('door_to_decision_threshold_mismatch')).length
}

function buildMainRows(sheet: any, fileName: string, profiles: Profile[]): { rows: MainRow[]; errors: string[]; formulaErrors: number; duplicates: number } {
  const required = {
    patientName: ['Nama Pasien'],
    medicalRecordNo: ['No. Rekam Medis', 'No RM'],
    diagnosis: ['Diagnosa IGD', 'Diagnosis IGD'],
    admissionAt: ['Waktu Masuk'],
    transferAt: ['Waktu Transfer'],
    destination: ['Tujuan'],
    queueWard: ['Antrian Pasien'],
    nurse: ['Perawat Penerima'],
    generalDoctor: ['Dokter Umum'],
    dpjp: ['DPJP'],
    death: ['Kematian IGD ≤8h', 'Kematian IGD ≤ 8h'],
    queue: ['Antrian Rawat Inap'],
    overcrowding: ['Overcrowding Index'],
    assessment: ['Kelengkapan Assessment Keperawatan'],
    doorDecision: ['Door-to-Decision'],
    triage: ['Response Triage'],
    dpjpResponse: ['Response Time DPJP'],
  }
  const header = findHeaderRow(sheet, required)
  const prepared: Array<Omit<MainRow, 'duplicateCount' | 'warnings' | 'payload'> & { transferWarnings: string[] }> = []
  const errors: string[] = []
  let formulaErrors = 0

  const profileMap = new Map<string, Profile>()
  for (const item of IGD_INDICATORS) {
    const profile = profiles.find(p =>
      Number(p.room_id) === ROOM_ID &&
      Number(p.profile_year) === PROFILE_YEAR &&
      String(p.code) === item.code &&
      p.status === 'published' &&
      p.is_active === true &&
      p.id
    )
    if (!profile) errors.push('Master indikator IGD ' + item.code + ' belum aktif/published.')
    else profileMap.set(item.code, profile)
  }
  if (errors.length) return { rows: [], errors, formulaErrors, duplicates: 0 }

  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const sourceValues = Object.values(header.indexes).map(index => readCell(row.getCell(index)))
    if (sourceValues.every(isBlank)) continue
    if (prepared.length >= MAX_MAIN_ROWS) {
      errors.push('Jumlah baris Logbook melebihi batas ' + MAX_MAIN_ROWS + '.')
      break
    }

    const value = (key: string) => cellText(row.getCell(header.indexes[key]))
    const raw = (key: string) => readCell(row.getCell(header.indexes[key]))
    const patientName = value('patientName')
    const medicalRecordNo = normalizeIgdMrn(raw('medicalRecordNo'))
    const admissionAt = normalizeIgdDateTime(raw('admissionAt'))
    const transferSourceRaw = raw('transferAt')
    const transferAt = normalizeIgdDateTime(transferSourceRaw)
    const transferMinutes = calculateIgdElapsedMinutes(admissionAt, transferAt)
    const transferWarnings: string[] = []
    if (!isBlank(transferSourceRaw) && !transferAt) {
      transferWarnings.push('Waktu Transfer pada sumber tidak dapat dinormalisasi; nilai mentah tetap dipertahankan.')
    } else if (transferAt && transferMinutes == null) {
      transferWarnings.push('Waktu Transfer lebih awal daripada Waktu Masuk; durasi tidak dihitung.')
    }
    const sourceNo = String(rowNumber - header.rowNumber)

    if (!patientName || !medicalRecordNo || !admissionAt) {
      errors.push('Logbook baris ' + rowNumber + ': Nama Pasien, No. Rekam Medis, dan Waktu Masuk wajib valid.')
      continue
    }
    if (igdLocalDate(admissionAt)?.slice(0, 4) !== String(PROFILE_YEAR)) {
      errors.push('Logbook baris ' + rowNumber + ': Waktu Masuk berada di luar tahun 2026.')
      continue
    }

    const indicatorCells: Record<string, string> = {}
    const responses: Array<Record<string, unknown>> = []
    const indicatorValues: Record<string, unknown> = {}

    for (const item of IGD_INDICATORS) {
      const key = ({
        '6.1': 'death',
        '6.2': 'doorDecision',
        '6.3': 'dpjpResponse',
        '6.4': 'queue',
        '6.5': 'assessment',
        '6.6': 'overcrowding',
        '6.7': 'triage',
      } as Record<string, string>)[item.code]
      const sourceCell = row.getCell(header.indexes[key])
      const sourceRaw = readCell(sourceCell)
      const rawLabel = cellText(sourceCell)
      const formulaError = typeof sourceRaw === 'string' && /^#(REF|VALUE|DIV\/0|N\/A|NUM|NAME)!?$/i.test(sourceRaw.trim())
      if (formulaError) {
        formulaErrors++
        indicatorCells[item.code] = ''
        continue
      }
      const sourceLabel = rawLabel
      indicatorCells[item.code] = sourceLabel
      if (!sourceLabel) continue

      const choice = parseIgdSourceChoice(sourceLabel)
      indicatorValues[item.code] = {
        answer: sourceLabel,
        source_value: sourceLabel,
        source_label: sourceLabel,
        source_code: choice.code,
        code: choice.code,
        mapping_status: 'source_label_pending_review',
        numerator: null,
        denominator: true,
        review_required: true,
      }
      const profile = profileMap.get(item.code)!
      responses.push({
        indicator_id: profile.id,
        response_label: sourceLabel,
        response_code: choice.code,
        raw_value: { ...indicatorValues[item.code], source_indicator_code: item.code },
        other_text: sourceLabel,
        review_status: 'pending',
      })
    }

    const formFields: Record<string, string> = {
      'Nama Pasien': patientName,
      'No. Rekam Medis': medicalRecordNo,
      'Diagnosa IGD': value('diagnosis'),
      'Waktu Masuk': admissionAt,
      'Waktu Transfer': transferAt ?? value('transferAt'),
      'Tujuan': value('destination'),
      'Antrian Pasien': value('queueWard'),
      'Perawat Penerima': value('nurse'),
      'Dokter Umum': value('generalDoctor'),
      'DPJP': value('dpjp'),
    }
    prepared.push({
      sourceRow: rowNumber,
      sourceNo,
      patientName,
      medicalRecordNo,
      admissionAt,
      recordDate: igdLocalDate(admissionAt)!,
      formFields,
      indicatorCells,
      sourceCells: Object.fromEntries(Object.entries(header.indexes).map(([field, index]) => [field, rawCellValue(row.getCell(index))])),
      calculatedFields: { 'Selisih Waktu Masuk–Transfer (menit)': transferMinutes },
      transferWarnings,
      responses,
    })
  }

  const keyCounts = new Map<string, number>()
  for (const row of prepared) {
    const key = row.medicalRecordNo + '|' + row.admissionAt
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }
  let duplicates = 0
  const rows: MainRow[] = prepared.map(row => {
    const key = row.medicalRecordNo + '|' + row.admissionAt
    const duplicateCount = keyCounts.get(key) ?? 1
    if (duplicateCount > 1) duplicates++
    const warnings = [...row.transferWarnings, ...(duplicateCount > 1 ? ['Duplikasi kandidat RM dan Waktu Masuk pada workbook; baris sumber dipertahankan terpisah.'] : [])]
    const sourceImport = {
      source_workbook: fileName,
      source_sheet: String(sheet.name ?? 'Logbook'),
      source_excel_row: row.sourceRow,
      source_excel_no: row.sourceNo,
      import_scope: 'igd_patient_episode',
      idempotency_basis: 'physical_excel_row',
      source_indicator_cells: row.indicatorCells,
      source_indicator_values: Object.fromEntries(Object.entries(row.indicatorCells).filter(([, value]) => value !== '')),
      source_cells: row.sourceCells,
      source_warnings: warnings,
      duplicate_mrn_arrival_count: duplicateCount,
    }
    const indicatorValues = Object.fromEntries(IGD_INDICATORS.map(item => [
      item.code,
      row.indicatorCells[item.code] ? { answer: row.indicatorCells[item.code], source_value: row.indicatorCells[item.code], source_code: parseIgdSourceChoice(row.indicatorCells[item.code]).code, review_required: true } : null,
    ]).filter(([, value]) => value != null))
    const core = {
      patient_name: row.patientName,
      medical_record_no: row.medicalRecordNo,
      admission_at: row.admissionAt,
      unit_name: 'Instalasi Gawat Darurat',
      room_id: ROOM_ID,
      status: 'Ready for Review',
      workflow_status: 'Ready for Review',
      form_fields: row.formFields,
      calculated_fields: row.calculatedFields,
      indicator_values: indicatorValues,
      measurement_grain: 'patient_episode',
      source_import: sourceImport,
    }
    return {
      ...row,
      duplicateCount,
      warnings,
      payload: {
        room_id: ROOM_ID,
        profile_year: PROFILE_YEAR,
        measurement_grain: 'patient_episode',
        record_date: row.recordDate,
        subject_key: MAIN_KEY_PREFIX + row.sourceRow,
        subject_json: { source_import: sourceImport },
        core_data: core,
        status: 'ready',
        review_required: true,
        entered_by: null,
      },
    }
  })
  return { rows, errors, formulaErrors, duplicates }
}

function parseConsultationWorkbook(
  workbook: any,
  fileName: string,
  mainRows: MainRow[],
): { rows: ConsultationRow[]; errors: string[]; sheetCount: number } {
  const errors: string[] = []
  const rows: ConsultationRow[] = []
  let sheetCount = 0
  const mainMatches: IgdMainMatchRow[] = mainRows.map(row => ({
    sourceRow: row.sourceRow,
    medicalRecordNo: row.medicalRecordNo,
    admissionAt: row.admissionAt,
  }))

  for (const sheet of workbook.worksheets ?? []) {
    const name = String(sheet.name ?? '').trim()
    if (!name || /rang?kuman|rekap|summary/i.test(name)) continue
    let header: { rowNumber: number; indexes: Record<string, number> }
    try {
      header = findHeaderRow(sheet, {
        sourceNo: ['No.', 'No'],
        medicalRecordNo: ['No RM', 'No. RM', 'No Rekam Medis', 'No. Rekam Medis'],
        patientName: ['Nama Pasien'],
        edDoctor: ['Dokter IGD'],
        specialistDoctor: ['Dokter Spesialis'],
        nurse: ['Perawat'],
        registeredAt: ['Waktu Registrasi'],
        doorDecision: ['Door-to-Decision'],
        consultationAt: ['Waktu Konsultasi DPJP'],
        targetDuration: ['Target capaian'],
        attainment: ['Capaian mutu'],
        dpjpReason: ['Alasan tidak tercapai mutu'],
        otherReason: ['Alasan lain'],
      })
    } catch {
      continue
    }
    if (header.rowNumber < 20) {
      errors.push('Sheet "' + name + '" memiliki header konsultasi pada baris ' + header.rowNumber + '; sumber resmi biasanya berada di baris 30.')
    }
    sheetCount++
    if (sheet.rowCount > 2500) {
      errors.push('Sheet "' + name + '" melebihi batas 2.500 baris.')
      continue
    }

    for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const source = sheet.getRow(rowNumber)
      const patientName = cellText(source.getCell(header.indexes.patientName))
      const medicalRecordNo = normalizeIgdMrn(readCell(source.getCell(header.indexes.medicalRecordNo)))
      const registeredAt = normalizeIgdDateTime(readCell(source.getCell(header.indexes.registeredAt)))
      const consultationAt = normalizeIgdDateTime(readCell(source.getCell(header.indexes.consultationAt)))
      const doorDecisionRaw = cellText(source.getCell(header.indexes.doorDecision))
      const attainmentRaw = cellText(source.getCell(header.indexes.attainment))
      const dpjpReasonRaw = cellText(source.getCell(header.indexes.dpjpReason))
      const otherReason = cellText(source.getCell(header.indexes.otherReason))
      if (!patientName && !medicalRecordNo && !registeredAt && !consultationAt && !doorDecisionRaw && !attainmentRaw) continue
      if (rows.length >= MAX_SUPPLEMENT_ROWS * 8) {
        errors.push('Jumlah data konsultasi melewati batas aman.')
        break
      }

      const choiceDoor = parseIgdSourceChoice(doorDecisionRaw)
      const choiceDpjp = parseIgdSourceChoice(dpjpReasonRaw)
      const durationSourceRaw = readCell(source.getCell(header.indexes.targetDuration))
      const durationSource = isBlank(durationSourceRaw) ? null : Number(String(durationSourceRaw).replace(',', '.'))
      const derived = calculateIgdElapsedMinutes(registeredAt, consultationAt)
      const consultationDate = igdLocalDate(consultationAt)
      const fileMonth = excelSerialMonthFromFileName(fileName)
      const consultationMonth = consultationDate ? Number(consultationDate.slice(5, 7)) : (fileMonth ?? 0)
      if (!consultationMonth || consultationMonth < 1 || consultationMonth > 12) {
        errors.push('Sheet "' + name + '" baris ' + rowNumber + ': bulan konsultasi tidak dapat ditentukan dari waktu konsultasi maupun nama file.')
        continue
      }

      const match = reconcileIgdConsultation({ medicalRecordNo, registeredAt }, mainMatches, 60)
      const flags = assessIgdConsultationFlags({
        registeredAt,
        consultationAt,
        sourceDurationMinutes: durationSource,
        derivedDurationMinutes: derived,
        doorDecisionLabel: doorDecisionRaw,
        attainment: attainmentRaw,
        dpjpReasonCode: choiceDpjp.code,
      })
      const registeredMonth = igdLocalDate(registeredAt)?.slice(0, 7)
      if (registeredMonth && consultationDate && registeredMonth !== consultationDate.slice(0, 7) &&
          !flags.includes('source_month_crosses_registration_month')) {
        flags.push('source_month_crosses_registration_month')
      }

      const sourceJson = {
        source_no: cellText(source.getCell(header.indexes.sourceNo)),
        source_medical_record_no_raw: rawCellValue(source.getCell(header.indexes.medicalRecordNo)),
        source_registered_at_raw: rawCellValue(source.getCell(header.indexes.registeredAt)),
        source_consultation_at_raw: rawCellValue(source.getCell(header.indexes.consultationAt)),
        age: cellText(source.getRow(rowNumber).getCell(4)),
        sex: cellText(source.getRow(rowNumber).getCell(5)),
        patient_type: cellText(source.getRow(rowNumber).getCell(6)),
        source_target_duration_minutes: durationSourceRaw == null ? '' : String(durationSourceRaw),
        source_door_to_decision: doorDecisionRaw,
        source_attainment: attainmentRaw,
        source_dpjp_reason: dpjpReasonRaw,
        source_other_reason: otherReason,
        source_duration_formula_is_not_authoritative: true,
        matching_candidate_rows: match.candidateRows,
      }
      rows.push({
        sourceWorkbook: fileName,
        sourceSheet: name,
        sourceRow: rowNumber,
        sourceNo: cellText(source.getCell(header.indexes.sourceNo)),
        patientName,
        medicalRecordNo,
        age: cellText(source.getRow(rowNumber).getCell(4)),
        sex: cellText(source.getRow(rowNumber).getCell(5)),
        patientType: cellText(source.getRow(rowNumber).getCell(6)),
        edDoctor: cellText(source.getCell(header.indexes.edDoctor)),
        specialistDoctor: cellText(source.getCell(header.indexes.specialistDoctor)),
        nurse: cellText(source.getCell(header.indexes.nurse)),
        registeredAt,
        consultationAt,
        consultationMonth,
        registrationToConsultationMinutes: derived,
        sourceDurationMinutes: Number.isFinite(durationSource as number) ? durationSource : null,
        doorDecisionRaw,
        doorDecisionCode: choiceDoor.code,
        attainmentRaw,
        dpjpReasonRaw,
        dpjpReasonCode: choiceDpjp.code,
        otherReason,
        matchStatus: match.status,
        linkedSourceRow: match.sourceRow,
        candidateSourceRows: match.candidateRows,
        matchDeltaSeconds: match.deltaSeconds,
        reviewFlags: flags,
        sourceJson,
      })
    }
  }
  if (!sheetCount) errors.push('Tidak ditemukan sheet dokter dengan header kasus konsultasi. Sheet RANGKUMAN memang diabaikan.')
  return { rows, errors, sheetCount }
}

function buildMainImportItem(row: MainRow, fileName: string, userId: string) {
  const payload = {
    ...row.payload,
    entered_by: userId,
    core_data: {
      ...row.payload.core_data,
      source_import: {
        ...row.payload.core_data.source_import,
        source_workbook: fileName,
      },
    },
    subject_json: {
      source_import: {
        ...row.payload.subject_json.source_import,
        source_workbook: fileName,
      },
    },
  }
  return { payload, responses: row.responses, attributions: [] }
}

function buildConsultationImportItem(row: ConsultationRow) {
  return {
    source_workbook: row.sourceWorkbook,
    source_sheet: row.sourceSheet,
    source_excel_row: row.sourceRow,
    source_no: row.sourceNo,
    consultation_month: row.consultationMonth,
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    age: row.age,
    sex: row.sex,
    patient_type: row.patientType,
    ed_doctor: row.edDoctor,
    specialist_doctor: row.specialistDoctor || row.sourceSheet,
    nurse: row.nurse,
    registered_at: row.registeredAt,
    consultation_at: row.consultationAt,
    registration_to_consultation_minutes: row.registrationToConsultationMinutes,
    source_duration_minutes: row.sourceDurationMinutes,
    door_to_decision_label: row.doorDecisionRaw,
    door_to_decision_code: row.doorDecisionCode,
    quality_attainment: row.attainmentRaw,
    dpjp_response_reason: row.dpjpReasonRaw,
    dpjp_response_code: row.dpjpReasonCode,
    other_reason: row.otherReason,
    matching_status: row.matchStatus,
    proposed_main_source_row: row.linkedSourceRow,
    candidate_source_rows: row.candidateSourceRows,
    match_delta_seconds: row.matchDeltaSeconds,
    review_flags: row.reviewFlags,
    source_json: row.sourceJson,
  }
}

export default function IgdExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [supplementFiles, setSupplementFiles] = useState<File[]>([])
  const [mainRows, setMainRows] = useState<MainRow[]>([])
  const [consultationRows, setConsultationRows] = useState<ConsultationRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [inputKey, setInputKey] = useState(0)
  const eligible = open && authorized && roomId === ROOM_ID && year === PROFILE_YEAR
  const [mainFormulaErrors, setMainFormulaErrors] = useState(0)

  const reset = useCallback(() => {
    setMainFile(null)
    setSupplementFiles([])
    setMainRows([])
    setConsultationRows([])
    setErrors([])
    setWarnings([])
    setParsing(false)
    setImporting(false)
    setProgress('')
    setResult(null)
    setErrorMessage('')
    setMainFormulaErrors(0)
    setInputKey(value => value + 1)
  }, [])

  const close = () => {
    if (parsing || importing) return
    reset()
    onClose()
  }
  const dialogRef = useAccessibleDialog<HTMLElement>({ open, onClose: close, lockScroll: true })

  const mainByIndicator = useMemo(() => IGD_INDICATORS.map(item => ({
    code: item.code,
    name: item.header,
    filled: mainRows.filter(row => !!row.indicatorCells[item.code]).length,
  })), [mainRows])

  const consultStats = useMemo(() => ({
    matched: consultationRows.filter(row => row.matchStatus === 'matched').length,
    ambiguous: consultationRows.filter(row => row.matchStatus === 'ambiguous').length,
    unmatched: consultationRows.filter(row => row.matchStatus === 'unmatched').length,
    mismatches: countResponseMismatch(consultationRows),
    threshold: countThresholdMismatch(consultationRows),
    durationMismatch: consultationRows.filter(row => row.reviewFlags.includes('source_formula_duration_mismatch')).length,
    durationUnreadable: consultationRows.filter(row => row.reviewFlags.includes('source_formula_duration_unreadable')).length,
    crossMonth: consultationRows.filter(row => row.reviewFlags.includes('source_month_crosses_registration_month')).length,
    missingReason: consultationRows.filter(row => row.reviewFlags.includes('missing_reason_code')).length,
    monthBreakdown: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      count: consultationRows.filter(row => row.consultationMonth === index + 1).length,
    })).filter(item => item.count > 0),
  }), [consultationRows])

  const parseFiles = async () => {
    setErrors([])
    setWarnings([])
    setResult(null)
    setErrorMessage('')
    if (!eligible) { setErrorMessage('Pilih unit Instalasi Gawat Darurat dan profil 2026 terlebih dahulu.'); return }
    if (!mainFile) { setErrorMessage('Workbook utama PMKP IGD wajib dipilih.'); return }
    if (!/\.xlsx$/i.test(mainFile.name) || mainFile.size <= 0 || mainFile.size > MAX_MAIN_FILE_BYTES) {
      setErrorMessage('Workbook utama harus .xlsx dengan ukuran maksimal 35 MB.')
      return
    }
    for (const file of supplementFiles) {
      if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > MAX_SUPPLEMENT_FILE_BYTES) {
        setErrorMessage('Setiap workbook konsultasi harus .xlsx dan berukuran maksimal 20 MB: ' + file.name)
        return
      }
    }
    if (typeof window === 'undefined') return
    setParsing(true)
    setMainRows([])
    setConsultationRows([])
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const mainBook = new ExcelJS.Workbook()
      await mainBook.xlsx.load(await mainFile.arrayBuffer())
      const mainSheet = mainBook.getWorksheet('Logbook')
      if (!mainSheet) throw new Error('Sheet Logbook tidak ditemukan pada workbook utama IGD.')
      if (mainSheet.rowCount > 15000 || mainSheet.columnCount > 80) throw new Error('Dimensi Logbook utama melampaui batas 15.000 baris/80 kolom.')
      if (!mainBook.getWorksheet('Profil')) throw new Error('Sheet Profil tidak ditemukan pada workbook utama IGD.')
      const builtMain = buildMainRows(mainSheet, mainFile.name, profiles)
      if (builtMain.errors.length) {
        setErrors(builtMain.errors.slice(0, 100))
        setErrorMessage('Workbook utama belum dapat diproses. Periksa master indikator atau baris sumber yang ditandai.')
        return
      }
      setMainRows(builtMain.rows)
      setMainFormulaErrors(builtMain.formulaErrors)

      const allConsultations: ConsultationRow[] = []
      const consultationErrors: string[] = []
      let parsedSheets = 0
      for (const file of supplementFiles) {
        const book = new ExcelJS.Workbook()
        await book.xlsx.load(await file.arrayBuffer())
        if (!book.worksheets?.length || book.worksheets.length > 40) {
          consultationErrors.push(file.name + ': jumlah sheet kosong/tidak wajar.')
          continue
        }
        const built = parseConsultationWorkbook(book, file.name, builtMain.rows)
        allConsultations.push(...built.rows)
        consultationErrors.push(...built.errors.map(error => file.name + ': ' + error))
        parsedSheets += built.sheetCount
      }
      setConsultationRows(allConsultations)
      if (consultationErrors.length) setErrors(consultationErrors.slice(0, 100))
      const warningItems: string[] = []
      if (builtMain.duplicates > 0) warningItems.push(builtMain.duplicates + ' baris berada pada kelompok RM + Waktu Masuk berulang; seluruh baris tetap dipertahankan.')
      if (builtMain.formulaErrors > 0) warningItems.push(builtMain.formulaErrors + ' sel indikator utama berisi error formula; sel tersebut tidak ditafsirkan sebagai respons.')
      if (!supplementFiles.length) warningItems.push('Belum ada workbook konsultasi DPJP dipilih; logbook episode utama tetap dapat diimpor.')
      if (allConsultations.length) {
        warningItems.push(allConsultations.length + ' sampel konsultasi ditangkap sebagai data audit tambahan, bukan denominator seluruh kunjungan IGD.')
        warningItems.push(consultStatsLabel(allConsultations))
        warningItems.push('Waktu registrasi → konsultasi tidak dipakai sebagai Response Time DPJP sejak permintaan konsultasi.')
        warningItems.push('Door-to-Decision sumber menggunakan ambang ≤4 jam; profil AUREKA saat ini mendefinisikan keputusan definitif <2 jam.')
        if (supplementFiles.some(file => /mei/i.test(file.name))) warningItems.push('Berkas Mei 2026 memiliki 8 tab dokter; kelengkapan roster sampel perlu diverifikasi.')
      }
      if (parsedSheets > 0) warningItems.push(parsedSheets + ' tab dokter dibaca; tab RANGKUMAN/repo formula tidak diimpor.')
      setWarnings(warningItems)
    } catch (error) {
      setMainRows([])
      setConsultationRows([])
      setErrors([])
      setErrorMessage(error instanceof Error ? error.message : 'Workbook tidak dapat dibaca.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!eligible || !mainFile || !mainRows.length || errors.length || importing || result) return
    setImporting(true)
    setErrorMessage('')
    try {
      const { data: { user }, error: userError } = await sb.auth.getUser()
      if (userError || !user) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.')
      let mainImported = 0
      let mainSkipped = 0
      for (let offset = 0; offset < mainRows.length; offset += BATCH_SIZE) {
        const batch = mainRows.slice(offset, offset + BATCH_SIZE)
        const payload = batch.map(row => buildMainImportItem(row, mainFile.name, user.id))
        const { data, error } = await quality().rpc('import_igd_logbook_batch', { p_rows: payload })
        if (error) throw error
        mainImported += Number(data?.imported_count ?? 0)
        mainSkipped += Number(data?.skipped_existing_count ?? 0)
        setProgress('Logbook episode IGD: ' + Math.min(offset + batch.length, mainRows.length).toLocaleString('id-ID') + ' / ' + mainRows.length.toLocaleString('id-ID'))
      }

      let consultationImported = 0
      let consultationSkipped = 0
      if (consultationRows.length) {
        for (let offset = 0; offset < consultationRows.length; offset += BATCH_SIZE) {
          const batch = consultationRows.slice(offset, offset + BATCH_SIZE)
          const { data, error } = await quality().rpc('import_igd_consultation_batch', {
            p_rows: batch.map(buildConsultationImportItem),
          })
          if (error) throw error
          consultationImported += Number(data?.imported_count ?? 0)
          consultationSkipped += Number(data?.skipped_existing_count ?? 0)
          setProgress('Bukti konsultasi DPJP: ' + Math.min(offset + batch.length, consultationRows.length).toLocaleString('id-ID') + ' / ' + consultationRows.length.toLocaleString('id-ID'))
        }
      }

      const summary: ImportSummary = {
        mainReceived: mainRows.length,
        mainImported,
        mainSkipped,
        consultationReceived: consultationRows.length,
        consultationImported,
        consultationSkipped,
        matched: consultStats.matched,
        ambiguous: consultStats.ambiguous,
        unmatched: consultStats.unmatched,
      }
      setResult(summary)
      setProgress('Impor selesai; seluruh record baru berstatus Ready for Review.')
      await onImported({
        imported: mainImported + consultationImported,
        skipped: mainSkipped + consultationSkipped,
        received: mainRows.length + consultationRows.length,
      })
    } catch (error) {
      setErrorMessage('Impor belum tuntas. Data batch yang sukses tetap tersimpan dan dapat dilewati secara idempoten saat dijalankan ulang. ' +
        (error instanceof Error ? error.message : 'Periksa koneksi atau hak akses.'))
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null
  return <div className="aqBack" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <section ref={dialogRef} tabIndex={-1} className="aqDrawer aqWide aqIgdImport" role="dialog" aria-modal="true" aria-labelledby="aqIgdImportTitle">
      <style>{'.aqIgdImport .aqBody{display:grid;gap:13px}.aqIgdImport .igdDrop{border:1px dashed rgba(35,63,50,.22);border-radius:14px;padding:13px;background:#fbfdfb}.aqIgdImport .igdDrop label{display:block;font-weight:850;font-size:12px;margin-bottom:7px}.aqIgdImport .igdDrop input{width:100%;font-size:12px}.aqIgdImport .igdGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.aqIgdImport .igdKpi{border:1px solid var(--line);border-radius:12px;padding:11px;background:#fff}.aqIgdImport .igdKpi small{display:block;color:var(--muted);font-size:10px}.aqIgdImport .igdKpi strong{display:block;font-size:19px;margin-top:4px}.aqIgdImport .igdList{display:grid;gap:5px}.aqIgdImport .igdRow{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:11px}.aqIgdImport .igdWarn{padding:10px 12px;border-radius:10px;background:#fff8e7;color:#765923;font-size:11px}.aqIgdImport .igdError{padding:10px 12px;border-radius:10px;background:#fff0ef;color:#8b3028;font-size:11px;white-space:pre-wrap}.aqIgdImport .igdPreview{max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:9px}.aqIgdImport .igdActions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.aqIgdImport .igdMuted{font-size:10px;color:var(--muted);line-height:1.5}@media(max-width:720px){.aqIgdImport .igdGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
      <header className="aqDHead">
        <div>
          <div className="aqPill green">IMPORT KHUSUS ROOM 6 · 2026</div>
          <h4 id="aqIgdImportTitle">Impor Logbook Instalasi Gawat Darurat</h4>
          <p className="igdMuted">Dua sumber diproses dalam satu alur. Logbook utama menjadi episode IGD; sampel konsultasi DPJP disimpan terpisah dan ditautkan hanya bila cocok secara unik.</p>
        </div>
        <button type="button" className="aqBtn" onClick={close} disabled={parsing || importing}>Tutup</button>
      </header>
      <div className="aqBody">
        <div className="igdDrop">
          <label htmlFor="igd-main-file">1. Workbook utama PMKP IGD 2026 (.xlsx)</label>
          <input id="igd-main-file" key={'main-' + inputKey} type="file" accept=".xlsx" onChange={event => { setMainFile(event.target.files?.[0] ?? null); setMainRows([]); setResult(null) }} />
          <div className="igdMuted">Wajib. Sheet Logbook dibaca sebagai episode pasien; formula/helper dan sheet rekap tidak diimpor.</div>
        </div>
        <div className="igdDrop">
          <label htmlFor="igd-consult-files">2. Workbook bulanan waktu konsultasi DPJP (.xlsx)</label>
          <input id="igd-consult-files" key={'consult-' + inputKey} type="file" accept=".xlsx" multiple onChange={event => { setSupplementFiles(Array.from(event.target.files ?? [])); setConsultationRows([]); setResult(null) }} />
          <div className="igdMuted">Opsional. Pilih Januari–Mei atau workbook bulan lain. Tab RANGKUMAN diabaikan; tab kasus dokter dibaca per pasien.</div>
          {supplementFiles.length > 0 && <div className="igdMuted">{supplementFiles.length} file dipilih: {supplementFiles.map(file => file.name).join(', ')}</div>}
        </div>
        <div className="igdActions">
          <button type="button" className="aqBtn primary" onClick={parseFiles} disabled={parsing || importing || !mainFile || !eligible}>
            {parsing ? 'Membaca workbook…' : 'Validasi dan Tampilkan Pratinjau'}
          </button>
        </div>
        {errorMessage && <div className="igdError">{errorMessage}</div>}
        {errors.length > 0 && <div className="igdError"><strong>Baris/struktur yang memerlukan perbaikan ({errors.length}):</strong>{'\n'}{errors.slice(0, 20).join('\n')}</div>}
        {mainRows.length > 0 && <section>
          <h4>Hasil validasi sumber</h4>
          <div className="igdGrid">
            <div className="igdKpi"><small>Episode IGD</small><strong>{mainRows.length.toLocaleString('id-ID')}</strong></div>
            <div className="igdKpi"><small>Kelompok RM + waktu masuk berulang</small><strong>{mainRows.filter(row => row.duplicateCount > 1).length.toLocaleString('id-ID')}</strong></div>
            <div className="igdKpi"><small>Sel formula error indikator</small><strong>{mainFormulaErrors.toLocaleString('id-ID')}</strong></div>
          </div>
          <div className="igdList">
            {mainByIndicator.map(item => <div className="igdRow" key={item.code}><span>{item.code} · {item.name}</span><strong>{item.filled.toLocaleString('id-ID')} terisi</strong></div>)}
          </div>
        </section>}
        {consultationRows.length > 0 && <section>
          <h4>Rekonsiliasi sampel konsultasi DPJP</h4>
          <div className="igdGrid">
            <div className="igdKpi"><small>Sampel kasus dokter</small><strong>{consultationRows.length.toLocaleString('id-ID')}</strong></div>
            <div className="igdKpi"><small>Tertaut unik ke episode</small><strong>{consultStats.matched.toLocaleString('id-ID')}</strong></div>
            <div className="igdKpi"><small>Ambigu / tidak cocok</small><strong>{consultStats.ambiguous + consultStats.unmatched}</strong></div>
          </div>
          <div className="igdList">
            <div className="igdRow"><span>Ambigu (kandidat lebih dari satu)</span><strong>{consultStats.ambiguous}</strong></div>
            <div className="igdRow"><span>Tidak cocok dengan episode utama</span><strong>{consultStats.unmatched}</strong></div>
            <div className="igdRow"><span>Ketidaksesuaian status Ya/Tidak vs kode alasan</span><strong>{consultStats.mismatches}</strong></div>
            <div className="igdRow"><span>Ambang Door-to-Decision berbeda dari master</span><strong>{consultStats.threshold}</strong></div>
            <div className="igdRow"><span>Selisih rumus durasi sumber vs timestamp</span><strong>{consultStats.durationMismatch}</strong></div>
            <div className="igdRow"><span>Rumus durasi sumber tidak terbaca</span><strong>{consultStats.durationUnreadable}</strong></div>
            <div className="igdRow"><span>Registrasi dan konsultasi lintas bulan</span><strong>{consultStats.crossMonth}</strong></div>
            <div className="igdRow"><span>Alasan respons DPJP kosong</span><strong>{consultStats.missingReason}</strong></div>
          </div>
          <div className="igdMuted">Bulan konsultasi ditentukan oleh Waktu Konsultasi DPJP, bukan bulan Waktu Registrasi. Selisih registrasi → konsultasi dihitung ulang dari timestamp dan diberi nama terpisah; bukan Response Time DPJP ≤30 menit sejak permintaan.</div>
        </section>}
        {warnings.length > 0 && <section className="igdWarn"><strong>Catatan interpretasi / telaah PMKP</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section>}
        {result && <div className="igdWarn"><strong>Hasil impor</strong><div className="igdList">
          <div className="igdRow"><span>Episode baru</span><strong>{result.mainImported}</strong></div>
          <div className="igdRow"><span>Episode sudah ada (dilewati)</span><strong>{result.mainSkipped}</strong></div>
          <div className="igdRow"><span>Bukti konsultasi DPJP baru</span><strong>{result.consultationImported}</strong></div>
          <div className="igdRow"><span>Bukti konsultasi sudah ada</span><strong>{result.consultationSkipped}</strong></div>
          <div className="igdRow"><span>Relasi DPJP → episode (preview)</span><strong>{result.matched} cocok · {result.ambiguous} ambigu · {result.unmatched} belum cocok</strong></div>
        </div></div>}
        {progress && <div className="igdMuted">{progress}</div>}
        <footer className="aqFoot">
          <span className="igdMuted">Semua data berstatus Ready for Review. Tidak ada capaian indikator yang divalidasi otomatis.</span>
          <div className="igdActions">
            <button type="button" className="aqBtn" onClick={close} disabled={parsing || importing}>Batal</button>
            <button type="button" className="aqBtn primary" onClick={importRows} disabled={!mainRows.length || errors.length > 0 || parsing || importing || !!result}>
              {importing ? 'Mengimpor…' : 'Impor ke AUREKA'}
            </button>
          </div>
        </footer>
      </div>
    </section>
  </div>
}

function consultStatsLabel(rows: ConsultationRow[]): string {
  const matched = rows.filter(row => row.matchStatus === 'matched').length
  const ambiguous = rows.filter(row => row.matchStatus === 'ambiguous').length
  const unmatched = rows.filter(row => row.matchStatus === 'unmatched').length
  return 'Rekonsiliasi awal: ' + matched + ' cocok unik; ' + ambiguous + ' ambigu; ' + unmatched + ' tidak cocok.'
}
