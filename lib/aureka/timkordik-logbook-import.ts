export type TimkordikIndicatorCode = '30.1' | '30.2' | '30.3' | '30.4' | '30.5'
export type TimkordikOption = { label: string; code: 1 | 2 | 3 }
export type TimkordikResolvedOption = {
  answer: string
  code: 1 | 2 | 3
  source_value: string
  source_option: false
  review_required: false
}
export type TimkordikIndicatorProfile = {
  id: string
  code: TimkordikIndicatorCode | string
  room_id?: number
  profile_year?: number
  is_active?: boolean
  status?: string
}
export type TimkordikPreparedRow = {
  sourceRow: number
  sourceNo: number
  startDate: string
  endDate: string
  formFields: Record<string, string>
  responses: Record<TimkordikIndicatorCode, TimkordikResolvedOption>
}

export const TIMKORDIK_INDICATORS: ReadonlyArray<{
  code: TimkordikIndicatorCode
  header: string
  profileTitle: string
  options: ReadonlyArray<TimkordikOption>
}> = [
  {
    code: '30.1',
    header: 'Administrasi',
    profileTitle: 'Kelengkapan Administrasi Mahasiswa Praktek Sejak Pengajuan Praktek Hingga Akhir Stase',
    options: [
      { label: 'Administrasi Lengkap (Awal hingga Akhir)', code: 1 },
      { label: 'Tidak Lengkap (Menunggu proses MOU/Legal Institusi - Faktor Eksternal)', code: 2 },
      { label: 'Tidak Lengkap (Hasil Skrining Kesehatan/Serologi terlambat keluar dari Lab)', code: 2 },
      { label: 'Tidak Lengkap (Mahasiswa belum bayar biaya praktek/Lupa setor berkas)', code: 3 },
      { label: 'Tidak Lengkap (Logbook/Target kompetensi tidak diisi)', code: 3 },
    ],
  },
  {
    code: '30.2',
    header: 'Atribut',
    profileTitle: 'Ketepatan Penggunaan Atribut Mahasiswa Selama Masa Praktek',
    options: [
      { label: 'Atribut Selalu Lengkap & Sesuai Standar RS', code: 1 },
      { label: 'Tidak Lengkap (Ada Atribut Rusak/Hilang dan sedang dalam proses penggantian)', code: 2 },
      { label: 'Tidak Lengkap (Pernah Lupa bawa Name Tag/Jas)', code: 3 },
      { label: 'Salah Kostum (Pernah Pakai Jeans/Kaos Oblong/Sandal/Rambut Gondrong tidak rapi)', code: 3 },
    ],
  },
  {
    code: '30.3',
    header: 'Absensi',
    profileTitle: 'Ketepatan Waktu Kehadiran Mahasiswa Selama Masa Praktek',
    options: [
      { label: 'Selalu Hadir Tepat Waktu (100% atau sesuai toleransi RS)', code: 1 },
      { label: 'Pernah Terlambat/Absen (Sakit dengan Surat Dokter/Izin Duka)', code: 2 },
      { label: 'Pernah Terlambat/Absen (Tugas Institusi Pendidikan/Ujian Kampus - Ada Surat Tugas)', code: 2 },
      { label: 'Pernah Terlambat/Absen (Tanpa Keterangan/Alpha)', code: 3 },
      { label: 'Sering Terlambat (Indisipliner berulang)', code: 3 },
    ],
  },
  {
    code: '30.4',
    header: 'Sikap & Perilaku',
    profileTitle: 'Penilaian Sikap dan Perilaku Mahasiswa Selama Masa Praktek',
    options: [
      { label: 'Perilaku Baik / Tidak ada catatan pelanggaran selama praktek', code: 1 },
      { label: 'Perilaku Cukup (Ada pelanggaran minor/Sudah dibina lisan)', code: 1 },
      { label: 'Perilaku Kurang (Pelanggaran Sedang: Tidak sopan/Konflik rekan - SP 1/2)', code: 3 },
      { label: 'Perilaku Buruk (Pelanggaran Berat: Etik/Patient Safety/Asusila - Ditarik/Tidak Lulus)', code: 3 },
    ],
  },
  {
    code: '30.5',
    header: 'Laporan',
    profileTitle: 'Penyelesaian Laporan Praktek Mahasiswa Pada Akhir Stase',
    options: [
      { label: 'Laporan Selesai Tepat Waktu', code: 1 },
      { label: 'Laporan Terlambat (Menunggu tanda tangan Konsulen/Pembimbing yang cuti/sibuk)', code: 2 },
      { label: 'Laporan Terlambat (Mahasiswa Sakit/Izin resmi menjelang deadline)', code: 2 },
      { label: 'Laporan Terlambat (Kelalaian Mahasiswa/Manajemen waktu buruk)', code: 3 },
      { label: 'Tidak Mengumpulkan Laporan', code: 3 },
    ],
  },
]

const SOURCE_KEY_PREFIX = 'excel-pmkp-timkordik-2026:no:'

function validDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Normalize Excel serial dates, Date values, ISO dates, and Indonesian D/M/YYYY values. */
export function normalizeTimkordikDate(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' || /^\d+(?:[.,]\d+)?$/.test(String(value).trim())) {
    const serial = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (!iso && !dmy) return null
  const year = Number(iso?.[1] ?? dmy?.[3])
  const month = Number(iso?.[2] ?? dmy?.[2])
  const day = Number(iso?.[3] ?? dmy?.[1])
  if (!validDateParts(year, month, day)) return null
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

/** Match the exact workbook label and its explicit Code suffix; never infer a code from free text. */
export function resolveTimkordikIndicatorOption(
  code: TimkordikIndicatorCode,
  raw: unknown,
): TimkordikResolvedOption | null {
  const sourceValue = String(raw ?? '').trim()
  const match = sourceValue.match(/^(.*?)\s*\(Code\s*([1-3])\)\s*$/i)
  if (!match) return null
  const answer = match[1].trim()
  const responseCode = Number(match[2]) as 1 | 2 | 3
  const option = TIMKORDIK_INDICATORS.find(item => item.code === code)?.options.find(item =>
    item.label === answer && item.code === responseCode,
  )
  if (!option) return null
  return {
    answer: option.label,
    code: option.code,
    source_value: sourceValue,
    source_option: false,
    review_required: false,
  }
}

export function createTimkordikSubjectKey(sourceNo: number | string): string {
  const normalized = String(sourceNo ?? '').trim()
  if (!/^[1-9]\d{0,8}$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    throw new Error('Nomor sumber mahasiswa harus berupa bilangan bulat positif.')
  }
  return SOURCE_KEY_PREFIX + normalized
}

export function buildTimkordikImportPayload(input: {
  row: TimkordikPreparedRow
  fileName: string
  fileSha256: string
  profiles: TimkordikIndicatorProfile[]
  userId: string
}): Record<string, unknown> {
  const { row, fileName, fileSha256, profiles, userId } = input
  if (!/^[0-9a-f]{64}$/.test(fileSha256)) throw new Error('Hash workbook SHA-256 tidak valid.')
  const profileByCode = new Map(profiles.map(profile => [String(profile.code), profile]))
  if (profileByCode.size !== 5) throw new Error('Lima master indikator Timkordik harus tersedia.')
  const sourceImport = {
    source_workbook: fileName,
    source_file_sha256: fileSha256,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_import_type: 'workbook_batch_v1',
    idempotency_basis: 'room_year_source_no',
  }
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const responses = TIMKORDIK_INDICATORS.map(indicator => {
    const profile = profileByCode.get(indicator.code)
    const resolved = row.responses[indicator.code]
    if (!profile?.id || !resolved || resolved.review_required || resolved.source_option) {
      throw new Error('Respons ' + indicator.code + ' belum tervalidasi terhadap pilihan workbook.')
    }
    const rawValue = {
      answer: resolved.answer,
      code: resolved.code,
      source_value: resolved.source_value,
      source_label: resolved.source_value,
      source_option: false,
      review_required: false,
    }
    indicatorValues[indicator.code] = rawValue
    return {
      indicator_id: profile.id,
      response_label: resolved.answer,
      response_code: resolved.code,
      raw_value: rawValue,
      other_text: null,
      review_status: 'not_required',
    }
  })
  const core = {
    unit_name: 'Tim Koordinasi Pendidikan',
    room_id: 30,
    activity: 'Praktik mahasiswa',
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    practice_start_date: row.startDate,
    practice_end_date: row.endDate,
    form_fields: row.formFields,
    indicator_values: indicatorValues,
    measurement_grain: 'activity',
    source_import: sourceImport,
  }
  return {
    payload: {
      room_id: 30,
      profile_year: 2026,
      measurement_grain: 'activity',
      record_date: row.startDate,
      subject_key: createTimkordikSubjectKey(row.sourceNo),
      subject_json: { source_import: sourceImport },
      core_data: core,
      status: 'ready',
      review_required: false,
      entered_by: userId,
    },
    responses,
    attributions: [],
  }
}
