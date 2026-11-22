'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CertificateTemplateEditor from '@/components/CertificateTemplateEditor'
import { loadCertificateLayout, pdfPoint, type CertificateLayout, type CertificateElementId } from '@/lib/aureka/certificate-template'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { qrPdfCommands, certificateVerificationUrl } from '@/lib/aureka/qr-code'
import { toUserFacingError } from '@/lib/ui/error-feedback'

const sys = () => aurekaSupabase.schema('aureka_system')
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''
const quality = () => aurekaSupabase.schema('aureka_quality')
const PAGE_SIZE = 500
const MATERIALS = [
  'Sasaran Keselamatan Pasien',
  'Peningkatan Mutu  Dan Keselamatan Pasien',
  'Pelayanan Kefarmasian dan Penggunaan Obat',
  'Pengendalian dan Pencegahan Infeksi',
  'Bantuan Hidup Dasar',
  'Manajemen Fasilitas dan Keselamatan (APAR dan Evakuasi)',
  'Hak dan Kewajiban Pasien',
] as const

type SourceRecord = {
  id: string
  profile_year: number
  record_date: string | null
  core_data: Record<string, unknown> | null
  status: string
}
type EducationEvent = {
  id: string
  title: string
  event_code: string
  event_type: string
  start_at: string
  end_at: string | null
  status: string
}
type EducationParticipant = {
  id: string
  event_id: string
  participant_type: string
  source_quality_record_id: string | null
  full_name: string
  institution: string
  profession_or_program: string
  participant_role: 'Peserta' | 'Narasumber' | 'Sumpah Rekam Medik'
  activity_name: string
  period_label: string
  signed_date: string | null
  materials: string[]
  orientation_notes: string
  status: string
}
type EducationCertificate = {
  id: string
  event_id: string
  participant_id: string
  certificate_number: string
  verification_code: string
  issue_date: string
  object_path: string | null
  file_sha256: string | null
  revoked_at: string | null
  render_snapshot?: {kind:string;layout:CertificateLayout;data:{name:string;profession:string;campus:string;saved:EducationParticipant}} | null
}
type OrientationRow = {
  source: SourceRecord
  name: string
  profession: string
  campus: string
  rotation: string
  ci: string
  defaultPeriod: string
  saved: EducationParticipant | null
  certificate: EducationCertificate | null
}
type Draft = {
  roleType: EducationParticipant['participant_role']
  activityName: string
  periodLabel: string
  signedDate: string
  materials: string[]
  notes: string
}

const styles = [
  '.studentOrientation{display:grid;gap:14px;min-width:0;color:var(--aureka-color-foreground)}',
  '.soPanel{padding:18px 20px;border:1px solid var(--border,rgba(100,125,150,.24));border-radius:16px;background:var(--aureka-color-surface);min-width:0}',
  '.soEyebrow{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--aureka-color-foreground-secondary)}',
  '.soTitle{font-size:23px;line-height:1.2;letter-spacing:-.035em;font-weight:850;margin:5px 0 7px}',
  '.soDesc{font-size:13px;line-height:1.6;color:var(--aureka-color-foreground-secondary);max-width:900px;margin:0}',
  '.soHead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}',
  '.soActions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
  '.soBtn{min-height:40px;padding:9px 13px;border-radius:10px;border:1px solid var(--border,rgba(100,125,150,.3));background:var(--aureka-color-surface-raised);color:var(--aureka-color-foreground);font:inherit;font-size:12px;font-weight:800;cursor:pointer}',
  '.soBtn.primary{background:#164b7a;border-color:#164b7a;color:#fff}',
  '.soBtn:disabled{opacity:.48;cursor:not-allowed}',
  '.soKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
  '.soKpi{padding:13px 15px;border:1px solid var(--border,rgba(100,125,150,.22));border-radius:13px;background:var(--aureka-color-surface);min-width:0}',
  '.soKpi span{display:block;color:var(--aureka-color-foreground-secondary);font-size:11px;font-weight:750}',
  '.soKpi strong{display:block;margin-top:5px;font-size:25px;line-height:1.1;font-weight:850;font-variant-numeric:tabular-nums}',
  '.soToolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:14px}',
  '.soToolbar input,.soToolbar select,.soEditor input,.soEditor select,.soEditor textarea{min-height:40px;border:1px solid var(--border,rgba(100,125,150,.3));border-radius:9px;background:var(--aureka-color-surface-raised);color:var(--aureka-color-foreground);padding:8px 10px;font:inherit;font-size:13px;min-width:0}',
  '.soSearch{flex:1 1 260px}',
  '.soTableWrap{overflow:auto;max-width:100%;border:1px solid var(--border,rgba(100,125,150,.22));border-radius:12px;margin-top:13px}',
  '.soTable{border-collapse:separate;border-spacing:0;width:100%;min-width:1580px;font-size:12px}',
  '.soTable th{position:sticky;top:0;z-index:1;background:var(--surface,#edf3f8);color:var(--aureka-color-foreground);font-size:11px;font-weight:850;text-align:left;padding:10px 9px;border-bottom:1px solid var(--border,rgba(100,125,150,.25));white-space:nowrap}',
  '.soTable td{padding:10px 9px;vertical-align:top;border-bottom:1px solid var(--border,rgba(100,125,150,.16));max-width:190px;line-height:1.45}',
  '.soTable tr:last-child td{border-bottom:0}',
  '.soTable td:first-child,.soTable th:first-child{text-align:center;width:48px}',
  '.soName{font-weight:800;min-width:190px}',
  '.soMeta{display:block;margin-top:4px;color:var(--aureka-color-foreground-secondary);font-size:10px;line-height:1.5}',
  '.soMaterial{min-width:125px;white-space:normal}',
  '.soEmpty{padding:24px 16px;text-align:center;color:var(--aureka-color-foreground-secondary);font-size:13px}',
  '.soStatus{display:inline-block;padding:4px 7px;border-radius:7px;background:rgba(22,75,122,.08);color:#164b7a;font-size:10px;font-weight:800}',
  '.soEditor{display:grid;gap:13px;margin-top:14px;border:1px solid var(--border,rgba(100,125,150,.25));border-radius:14px;padding:16px;background:var(--surface,rgba(255,255,255,.52))}',
  '.soEditorHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}',
  '.soEditorGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
  '.soField{display:grid;gap:5px;min-width:0}',
  '.soField label{font-size:11px;font-weight:800;color:var(--aureka-color-foreground-secondary)}',
  '.soField input,.soField select,.soField textarea{width:100%;box-sizing:border-box}',
  '.soField textarea{min-height:66px;resize:vertical}',
  '.soMaterials{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
  '.soMaterialInput{display:grid;grid-template-columns:24px minmax(0,1fr);gap:7px;align-items:center}',
  '.soMaterialInput span{font-size:11px;font-weight:850;color:var(--aureka-color-foreground-secondary)}',
  '.soMaterialInput input{width:100%;box-sizing:border-box}',
  '.soMessage{padding:11px 13px;border-radius:10px;background:rgba(22,75,122,.07);border:1px solid rgba(22,75,122,.17);font-size:12px;line-height:1.5}',
  '.soError{background:rgba(185,28,28,.07);border-color:rgba(185,28,28,.2);color:#991b1b}',
  '@media(max-width:760px){.soKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.soEditorGrid{grid-template-columns:1fr}.soMaterials{grid-template-columns:1fr}.soPanel{padding:14px}.soTitle{font-size:20px}}',
  '[data-mode="gelap"] .studentOrientation .soBtn{background:rgba(255,255,255,.06);color:var(--text,#eef2fa)}',
  '[data-mode="gelap"] .studentOrientation .soTable th{background:#18263a;color:#eef2fa}',
  '[data-mode="gelap"] .studentOrientation .soTable td{color:#eef2fa}',
  '[data-mode="gelap"] .studentOrientation .soToolbar input,[data-mode="gelap"] .studentOrientation .soToolbar select,[data-mode="gelap"] .studentOrientation .soEditor input,[data-mode="gelap"] .studentOrientation .soEditor select,[data-mode="gelap"] .studentOrientation .soEditor textarea{background:#111c2d;color:#eef2fa;border-color:rgba(180,200,225,.2)}',
].join('\n')

function str(value: unknown): string {
  return value == null ? '' : String(value).trim()
}
function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const datePart = String(value).slice(0, 10)
  const parsed = new Date(datePart + 'T00:00:00')
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}
function sourcePeriod(form: Record<string, unknown>, recordDate: string | null): string {
  const start = str(form['Tanggal Mulai Praktek'] ?? form['Tanggal Mulai Praktik'])
  const end = str(form['Tanggal Selesai Praktek'] ?? form['Tanggal Selesai Praktik'])
  if (start && end) return formatDate(start) + ' s.d. ' + formatDate(end)
  if (start || end) return formatDate(start || end)
  return formatDate(recordDate)
}
function safeAscii(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ')
}
function pdfEscape(value: unknown): string {
  return safeAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}
function createCertificatePdf(row: OrientationRow, number: string, verificationCode: string, layout: CertificateLayout): Blob {
  const saved = row.saved!
  const point = (id: CertificateElementId, fallback: { x: number; y: number }) => pdfPoint(layout, id, fallback)
  const text = (id: CertificateElementId, value: string, size: number, color: string, fallback: { x: number; y: number }, font = 'F1', align: 'left' | 'center' = 'center', offsetY = 0) => {
    const pos = point(id, fallback)
    const width = safeAscii(value).length * size * 0.25
    const x = align === 'center' ? pos.x - width : pos.x
    return 'BT /' + font + ' ' + size + ' Tf ' + color + ' rg ' + x.toFixed(1) + ' ' + (pos.y + offsetY) + ' Td (' + pdfEscape(value) + ') Tj ET'
  }
  const logo = (id: 'logo_pemkot' | 'logo_rsud', label: string, fallback: { x: number; y: number }) => {
    const pos = point(id, fallback)
    return [
      '0.08 0.22 0.36 RG 1.4 w ' + (pos.x - 22) + ' ' + (pos.y - 18) + ' 44 36 re S',
      text(id, label, 7, '0.08 0.22 0.36', fallback),
    ]
  }
  const signature = (id: 'signature_left' | 'signature_right', label: string, fallback: { x: number; y: number }) => {
    const pos = point(id, fallback)
    return [
      '0.18 0.29 0.40 RG 0.7 w ' + (pos.x - 76) + ' ' + (pos.y + 18) + ' m ' + (pos.x + 76) + ' ' + (pos.y + 18) + ' l S',
      text(id, label, 10, '0 0 0', fallback),
    ]
  }
  const commands: string[] = [
    '0.08 0.22 0.36 RG 2.2 w 24 24 794 547 re S',
    '0.39 0.68 0.82 RG 0.8 w 34 34 774 527 re S',
    ...logo('logo_pemkot', 'PEMKOT', { x: 10, y: 13 }),
    ...logo('logo_rsud', 'RSUD', { x: 90, y: 13 }),
    text('institution', 'DINAS KESEHATAN KOTA PONTIANAK', 12, '0.08 0.22 0.36', { x: 50, y: 12 }, 'F1', 'center', 8),
    text('institution', 'UPT RSUD SULTAN SYARIF MOHAMAD ALKADRIE KOTA PONTIANAK', 10, '0.08 0.22 0.36', { x: 50, y: 12 }, 'F1', 'center', -9),
    text('title', 'SERTIFIKAT', 30, '0.08 0.22 0.36', { x: 50, y: 25 }, 'F2'),
    text('subtitle', 'ORIENTASI MAHASISWA', 13, '0.08 0.22 0.36', { x: 50, y: 31 }),
    text('recipient_label', 'Diberikan kepada', 12, '0 0 0', { x: 50, y: 38 }),
    text('recipient_name', row.name, 25, '0.08 0.22 0.36', { x: 50, y: 45 }),
    text('role', 'Sebagai: ' + saved.participant_role, 12, '0 0 0', { x: 50, y: 52 }),
    text('activity', saved.activity_name, 12, '0 0 0', { x: 50, y: 59 }),
    text('details', 'Periode/Tanggal: ' + saved.period_label, 11, '0 0 0', { x: 50, y: 64 }),
    text('materials', 'Materi yang diikuti:', 11, '0 0 0', { x: 22, y: 69 }, 'F1', 'left'),
  ]
  const materialsPoint = point('materials', { x: 22, y: 69 })
  let y = materialsPoint.y - 18
  saved.materials.slice(0, 7).forEach((material, index) => {
    commands.push('BT /F1 10 Tf 0 0 0 rg ' + Math.round(materialsPoint.x + 18) + ' ' + y + ' Td (' + pdfEscape((index + 1) + '. ' + material) + ') Tj ET')
    y -= 17
  })
  commands.push(
    text('program_info', 'Program/Profesi: ' + row.profession + '  |  Institusi: ' + row.campus, 9, '0.25 0.32 0.4', { x: 50, y: 84 }, 'F1', 'center', 0),
    text('issue_date', 'Pontianak, ' + formatDate(saved.signed_date), 10, '0 0 0', { x: 77, y: 79 }),
    ...signature('signature_left', 'Direktur', { x: 24, y: 86 }),
    ...signature('signature_right', 'Pejabat yang berwenang', { x: 76, y: 86 }),
    text('verification', 'Nomor: ' + number + '  |  Kode: ' + verificationCode, 8, '0.25 0.32 0.4', { x: 91, y: 91 }),
    text('footer', 'AUREKA DOCUMENT INTELLIGENCE', 8, '0.08 0.22 0.36', { x: 50, y: 96 }),
  )
  commands.push(...qrPdfCommands(certificateVerificationUrl(verificationCode,BASE_PATH),716,364,104))
  commands.push('BT /F1 7 Tf 0.08 0.22 0.36 rg 721 353 Td (SCAN QR VERIFIKASI) Tj ET')
  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'
  })
  const xrefOffset = pdf.length
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
  for (let index = 1; index < offsets.length; index++) pdf += String(offsets[index]).padStart(10, '0') + ' 00000 n \n'
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF'
  return new Blob([pdf], { type: 'application/pdf' })
}
async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
function safeFileName(value: string): string {
  return safeAscii(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sertifikat'
}

export default function StudentOrientationWorkspace({
  role,
  userId,
  canManage,
}: {
  role: string | null
  userId: string
  canManage: boolean
}) {
  const [selectedYear, setSelectedYear] = useState(2026)
  const [event, setEvent] = useState<EducationEvent | null>(null)
  const [rows, setRows] = useState<OrientationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showList, setShowList] = useState(false)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const yearStart = selectedYear + '-01-01T00:00:00+07:00'
      const nextYearStart = (selectedYear + 1) + '-01-01T00:00:00+07:00'
      const { data: eventRows, error: eventError } = await sys().from('education_events')
        .select('id,title,event_code,event_type,start_at,end_at,status')
        .eq('event_type', 'orientasi_mahasiswa')
        .eq('room_id', 30)
        .gte('start_at', yearStart)
        .lt('start_at', nextYearStart)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true })
        .limit(1)
      if (eventError) throw eventError
      let currentEvent = (eventRows?.[0] || null) as EducationEvent | null

      if (!currentEvent && canManage) {
        const { data: created, error: createError } = await sys().from('education_events')
          .insert({
            event_type: 'orientasi_mahasiswa',
            title: 'Orientasi Mahasiswa ' + selectedYear,
            topic: 'Orientasi mahasiswa praktik',
            organizer: 'Tim Koordinasi Pendidikan',
            room_id: 30,
            start_at: yearStart,
            end_at: selectedYear + '-12-31T23:59:59+07:00',
            venue: 'UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak',
            learning_objectives: [...MATERIALS],
            certificate_template: { title: 'SERTIFIKAT ORIENTASI MAHASISWA', page: 'A4-landscape' },
            status: 'published',
          })
          .select('id,title,event_code,event_type,start_at,end_at,status')
          .single()
        if (createError) throw createError
        currentEvent = created as EducationEvent
      }
      setEvent(currentEvent)

      const sourceRows: SourceRecord[] = []
      for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
        const { data, error: sourceError } = await quality().from('quality_records')
          .select('id,profile_year,record_date,core_data,status')
          .eq('room_id', 30)
          .eq('profile_year', selectedYear)
          .eq('measurement_grain', 'activity')
          .neq('status', 'archived')
          .is('archived_at', null)
          .order('record_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)
        if (sourceError) throw sourceError
        const page = (data || []) as SourceRecord[]
        sourceRows.push(...page)
        if (page.length < PAGE_SIZE) break
      }

      const mappedSources = sourceRows.flatMap((source) => {
        const core = (source.core_data || {}) as Record<string, unknown>
        const form = (core.form_fields || core.form_data || {}) as Record<string, unknown>
        const name = str(form['Nama Mahasiswa'])
        if (!name) return []
        return [{
          source,
          name,
          profession: str(form['Profesi/Prodi'] ?? form['Profesi'] ?? form['Prodi']),
          campus: str(form['Kampus']),
          rotation: str(form['Stase Terakhir'] ?? form['Stase']),
          ci: str(form['CI/Penanggung Jawab'] ?? form['CI / Penanggung Jawab']),
          defaultPeriod: sourcePeriod(form, source.record_date),
        }]
      })

      let participantRows: EducationParticipant[] = []
      let certificates: EducationCertificate[] = []
      if (currentEvent) {
        if (canManage && mappedSources.length) {
          for (let offset = 0; offset < mappedSources.length; offset += 100) {
            const batch = mappedSources.slice(offset, offset + 100).map((row) => ({
              event_id: currentEvent!.id,
              participant_type: 'student',
              source_quality_record_id: row.source.id,
              participant_code: row.source.id,
              full_name: row.name,
              institution: row.campus,
              profession_or_program: row.profession,
              room_id: 30,
              participant_role: 'Peserta',
              activity_name: currentEvent!.title,
              period_label: row.defaultPeriod,
              status: 'registered',
            }))
            const { error: syncError } = await sys().from('education_participants')
              .upsert(batch, { onConflict: 'event_id,source_quality_record_id', ignoreDuplicates: true })
            if (syncError) throw syncError
          }
        }
        for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
          const { data, error: participantError } = await sys().from('education_participants')
            .select('id,event_id,participant_type,source_quality_record_id,full_name,institution,profession_or_program,participant_role,activity_name,period_label,signed_date,materials,orientation_notes,status')
            .eq('event_id', currentEvent.id)
            .eq('participant_type', 'student')
            .order('full_name', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
          if (participantError) throw participantError
          const page = (data || []) as EducationParticipant[]
          participantRows.push(...page)
          if (page.length < PAGE_SIZE) break
        }
        for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
          const { data, error: certificateError } = await sys().from('education_certificates')
            .select('id,event_id,participant_id,certificate_number,verification_code,issue_date,object_path,file_sha256,revoked_at,render_snapshot')
            .eq('event_id', currentEvent.id)
            .is('revoked_at', null)
            .range(offset, offset + PAGE_SIZE - 1)
          if (certificateError) throw certificateError
          const page = (data || []) as EducationCertificate[]
          certificates.push(...page)
          if (page.length < PAGE_SIZE) break
        }
      }

      const participantBySource = new Map(participantRows.filter((row) => row.source_quality_record_id).map((row) => [String(row.source_quality_record_id), row]))
      const certificateByParticipant = new Map(certificates.map((row) => [row.participant_id, row]))
      setRows(mappedSources.map((row) => {
        const saved = participantBySource.get(row.source.id) || null
        return {
          ...row,
          saved,
          certificate: saved ? certificateByParticipant.get(saved.id) || null : null,
        }
      }))
      if (!currentEvent) {
        setMessage(canManage
          ? 'Kegiatan Orientasi Mahasiswa belum dapat disiapkan. Periksa izin pengelolaan pendidikan.'
          : 'Kegiatan Orientasi Mahasiswa belum diaktifkan oleh pengelola pendidikan. Daftar sumber dapat dibaca setelah kegiatan dipublikasikan.')
      } else if (mappedSources.length === 0) {
        setMessage('Belum ada baris mahasiswa pada logbook indikator mutu Tim Koordinasi Pendidikan untuk tahun ini. Daftar akan muncul otomatis setelah PIC mengisi laporan indikator mutu.')
      }
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Data orientasi belum dapat dimuat. Periksa akses pendidikan dan logbook Tim Koordinasi Pendidikan.' }))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [selectedYear, canManage])

  useEffect(() => { void load() }, [load])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id')
    return rows.filter((row) => {
      const rowRole = row.saved?.participant_role || 'Peserta'
      if (roleFilter !== 'all' && rowRole !== roleFilter) return false
      if (!term) return true
      return [
        row.name, row.profession, row.campus, row.rotation, row.ci,
        row.saved?.activity_name || event?.title || 'Orientasi Mahasiswa',
      ].some((value) => String(value || '').toLocaleLowerCase('id').includes(term))
    })
  }, [rows, search, roleFilter, event?.title])

  const participantCount = useMemo(() => new Set(rows.map((row) => row.name.trim().toLocaleLowerCase('id'))).size, [rows])
  const savedCount = rows.filter((row) => !!row.saved).length
    const certificateCount = rows.filter((row) => !!row.certificate?.certificate_number).length
  const selectedRow = selectedSourceId ? rows.find((row) => row.source.id === selectedSourceId) || null : null

  const beginEdit = (row: OrientationRow) => {
    if (!canManage || !event || row.certificate) return
    const saved = row.saved
    setSelectedSourceId(row.source.id)
    setDraft({
      roleType: saved?.participant_role || 'Peserta',
      activityName: saved?.activity_name || event.title || 'Orientasi Mahasiswa',
      periodLabel: saved?.period_label || row.defaultPeriod,
      signedDate: saved?.signed_date || '',
      materials: saved ? [...(saved.materials || []), '', '', '', '', '', '', ''].slice(0, 7) : [...MATERIALS],
      notes: saved?.orientation_notes || '',
    })
    setError('')
    setMessage('')
    setShowList(true)
  }

  const cancelEdit = () => {
    if (saving || issuing) return
    setSelectedSourceId(null)
    setDraft(null)
  }

  const save = async () => {
    if (!canManage || !event || !selectedRow || !draft || saving) return
    if (!draft.activityName.trim() || !draft.periodLabel.trim()) {
      setError('Kegiatan dan Periode/Tanggal wajib diisi.')
      return
    }
    if (!userId) {
      setError('Sesi pengguna tidak ditemukan. Silakan login ulang.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        event_id: event.id,
        participant_type: 'student',
        source_quality_record_id: selectedRow.source.id,
        participant_code: selectedRow.source.id,
        full_name: selectedRow.name,
        institution: selectedRow.campus,
        profession_or_program: selectedRow.profession,
        room_id: 30,
        participant_role: draft.roleType,
        activity_name: draft.activityName.trim(),
        period_label: draft.periodLabel.trim(),
        signed_date: draft.signedDate || null,
        materials: draft.materials.map((item) => item.trim()).filter(Boolean).slice(0, 7),
        orientation_notes: draft.notes.trim(),
        status: 'registered',
      }
      const { data, error: saveError } = await sys().from('education_participants')
        .upsert(payload, { onConflict: 'event_id,source_quality_record_id' })
        .select('id,event_id,participant_type,source_quality_record_id,full_name,institution,profession_or_program,participant_role,activity_name,period_label,signed_date,materials,orientation_notes,status')
        .single()
      if (saveError) throw saveError
      const saved = data as EducationParticipant
      setRows((current) => current.map((row) => row.source.id === selectedRow.source.id ? { ...row, saved, certificate: null } : row))
      setSelectedSourceId(null)
      setDraft(null)
      setMessage('Data orientasi ' + selectedRow.name + ' berhasil disimpan pada register pendidikan AUREKA.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Data orientasi belum dapat disimpan.' }))
    } finally {
      setSaving(false)
    }
  }

  const issueCertificate = async (row: OrientationRow) => {
    if (!canManage || !event || !row.saved || !row.saved.signed_date || !row.saved.materials?.length || issuing) {
      setError('Simpan data orientasi, tanggal tanda tangan, dan sekurang-kurangnya satu materi sebelum menerbitkan sertifikat.')
      return
    }
    const preview = window.open('about:blank', '_blank')
    if (!preview) {
      setError('Jendela sertifikat diblokir browser. Izinkan pop-up untuk AUREKA, lalu ulangi penerbitan.')
      return
    }
    setIssuing(true)
    setError('')
    setMessage('')
    try {
      const layout = await loadCertificateLayout('student_orientation')
      const { data, error: reserveError } = await sys().rpc('reserve_student_orientation_certificate', {
        p_event_id: event.id,
        p_participant_id: row.saved.id,
      })
      if (reserveError) throw reserveError
      const reserved = (Array.isArray(data) ? data[0] : data) as {
        id?: string
        certificate_number?: string
        verification_code?: string
        issue_date?: string
        object_path?: string | null
      } | null
      const certificateId = str(reserved?.id)
      const certificateNumber = str(reserved?.certificate_number)
      const verificationCode = str(reserved?.verification_code)
      if (!certificateId || !certificateNumber) throw new Error('Nomor sertifikat tidak dikembalikan oleh server.')

      // Certificate identity remains in PostgreSQL; PDF is generated locally
      // and never uploaded or archived as a binary object.
      const proposedSnapshot = {
        kind: 'student_orientation', event_id: event.id, participant_id: row.saved.id,
        layout, data: {name:row.name,profession:row.profession,campus:row.campus,saved:row.saved},
      }
      const {data:frozen,error:freezeError} = await sys().rpc('freeze_browser_certificate_snapshot',{
        p_certificate_id: certificateId,p_snapshot:proposedSnapshot
      })
      if(freezeError)throw freezeError
      const snapshot = (frozen?.snapshot || proposedSnapshot) as typeof proposedSnapshot
      const pdf = createCertificatePdf({...row,...snapshot.data}, certificateNumber, verificationCode, snapshot.layout)
      const url = URL.createObjectURL(pdf)
      preview.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)

      const certificate: EducationCertificate = {
        id: certificateId,
        event_id: event.id,
        participant_id: row.saved.id,
        certificate_number: certificateNumber,
        verification_code: verificationCode,
        issue_date: str(reserved?.issue_date) || row.saved.signed_date,
        object_path: null,
        file_sha256: null,
        revoked_at: null,
        render_snapshot: snapshot,
      }
      setRows((current) => current.map((item) => item.source.id === row.source.id ? { ...item, certificate } : item))
      setMessage('Sertifikat ' + certificateNumber + ' diterbitkan sebagai data terstruktur; PDF hanya dibuat sementara di browser.')
    } catch (cause) {
      preview.close()
      setError(toUserFacingError(cause, { fallback: 'Sertifikat belum dapat diterbitkan.' }))
    } finally {
      setIssuing(false)
    }
  }

  return (
    <section className="studentOrientation">
      <style>{styles}</style>
      <section className="soPanel">
        <div className="soHead">
          <div><h2 className="soTitle">Orientasi Mahasiswa</h2></div>
          <div className="soActions">
            <select aria-label="Tahun data orientasi" value={selectedYear} onChange={(event) => { setSelectedYear(Number(event.target.value)); setSelectedSourceId(null); setDraft(null) }}>
              {[2025, 2026, 2027, 2028, 2029].map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            {canManage && <button className="soBtn" type="button" onClick={() => setShowTemplateEditor(true)}>Atur template sertifikat</button>}
            <button className="soBtn" type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
            <button className="soBtn primary" type="button" onClick={() => setShowList((value) => !value)}>{showList ? 'Tutup Daftar' : 'Lihat Orientasi Mahasiswa'}</button>
          </div>
        </div>
      </section>

      <section className="soKpis" aria-label="Ringkasan orientasi mahasiswa">
        <div className="soKpi"><span>Rekam mahasiswa dari logbook</span><strong>{loading ? '…' : rows.length.toLocaleString('id-ID')}</strong></div>
        <div className="soKpi"><span>Mahasiswa unik</span><strong>{loading ? '…' : participantCount.toLocaleString('id-ID')}</strong></div>
        <div className="soKpi"><span>Register tersimpan</span><strong>{savedCount.toLocaleString('id-ID')}</strong></div>
        <div className="soKpi"><span>Sertifikat PDF diterbitkan</span><strong>{certificateCount.toLocaleString('id-ID')}</strong></div>
      </section>

      {error && <div className="soMessage soError" role="alert">{error}</div>}
      {message && <div className="soMessage" role="status">{message}</div>}

      {showTemplateEditor && <CertificateTemplateEditor templateKey="student_orientation" role={role} onClose={() => setShowTemplateEditor(false)} />}

      {showList && (
        <section className="soPanel">
          <div className="soHead">
            <div>
              <div className="soEyebrow">Register</div>
              <h3 className="soTitle">Daftar Orientasi Mahasiswa {selectedYear}</h3>
            </div>
            <span className="soStatus">{event ? event.title + ' · ' + event.status : 'Kegiatan belum diaktifkan'} · {role || 'Pengguna'}</span>
          </div>
          <div className="soToolbar">
            <input className="soSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, kampus, profesi, stase, atau kegiatan…" aria-label="Cari mahasiswa orientasi" />
            <select aria-label="Filter peran" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">Semua peran</option>
              <option value="Peserta">Peserta</option>
              <option value="Narasumber">Narasumber</option>
              <option value="Sumpah Rekam Medik">Sumpah Rekam Medik</option>
            </select>
            <span className="soStatus">{filteredRows.length.toLocaleString('id-ID')} baris</span>
          </div>
          {loading ? <div className="soEmpty">Memuat daftar mahasiswa dari logbook Tim Koordinasi Pendidikan…</div> :
            filteredRows.length === 0 ? <div className="soEmpty">Belum ada mahasiswa dari logbook Tim Koordinasi Pendidikan tahun {selectedYear}</div> :
            <div className="soTableWrap">
              <table className="soTable">
                <thead><tr>
                  <th>No.</th><th>Nama</th><th>Sebagai</th><th>Kegiatan</th><th>Periode/Tanggal</th><th>Tanggal TTD</th>
                  <th>Materi 1</th><th>Materi 2</th><th>Materi 3</th><th>Materi 4</th><th>Materi 5</th><th>Materi 6</th><th>Materi 7</th><th>Aksi</th>
                </tr></thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const materials = row.saved?.materials || []
                    return <tr key={row.source.id}>
                      <td>{index + 1}</td>
                      <td className="soName">{row.name}<span className="soMeta">{[row.profession, row.campus, row.rotation, row.ci ? 'CI: ' + row.ci : ''].filter(Boolean).join(' · ')}</span></td>
                      <td>{row.saved?.participant_role || 'Peserta'}</td>
                      <td>{row.saved?.activity_name || event?.title || 'Orientasi Mahasiswa'}</td>
                      <td>{row.saved?.period_label || row.defaultPeriod}</td>
                      <td>{formatDate(row.saved?.signed_date)}</td>
                      {Array.from({ length: 7 }, (_, i) => <td className="soMaterial" key={i}>{materials[i] || '-'}</td>)}
                      <td>
                        <div className="soActions">
                          <button type="button" className="soBtn" disabled={!canManage || !event || !!row.certificate} onClick={() => beginEdit(row)}>{row.saved ? 'Ubah' : 'Lengkapi'}</button>
                          <button type="button" className="soBtn primary" disabled={!canManage || !event || !row.saved?.signed_date || !row.saved?.materials?.length || issuing} onClick={() => void issueCertificate(row)}>{row.certificate?.certificate_number ? 'Buka PDF' : 'Terbitkan PDF'}</button>
                        </div>
                        {row.certificate?.certificate_number && <span className="soMeta">{row.certificate.certificate_number}</span>}
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          }

          {selectedRow && draft && (
            <div className="soEditor">
              <div className="soEditorHead">
                <div><div className="soEyebrow">Lengkapi register</div><h3 className="soTitle">{selectedRow.name}</h3><p className="soDesc">{[selectedRow.profession, selectedRow.campus, selectedRow.rotation].filter(Boolean).join(' · ')}</p></div>
                <div className="soActions">
                  <button type="button" className="soBtn" onClick={cancelEdit} disabled={saving || issuing}>Batal</button>
                  <button type="button" className="soBtn primary" onClick={() => void save()} disabled={saving || !canManage}>{saving ? 'Menyimpan…' : 'Simpan Orientasi'}</button>
                </div>
              </div>
              <div className="soEditorGrid">
                <div className="soField"><label>Sebagai</label><select value={draft.roleType} onChange={(event) => setDraft((current) => current ? { ...current, roleType: event.target.value as Draft['roleType'] } : current)}><option>Peserta</option><option>Narasumber</option><option>Sumpah Rekam Medik</option></select></div>
                <div className="soField"><label>Kegiatan</label><input value={draft.activityName} onChange={(event) => setDraft((current) => current ? { ...current, activityName: event.target.value } : current)} maxLength={240} required /></div>
                <div className="soField"><label>Periode/Tanggal</label><input value={draft.periodLabel} onChange={(event) => setDraft((current) => current ? { ...current, periodLabel: event.target.value } : current)} maxLength={160} required /></div>
                <div className="soField"><label>Tanggal TTD</label><input type="date" value={draft.signedDate} onChange={(event) => setDraft((current) => current ? { ...current, signedDate: event.target.value } : current)} /></div>
              </div>
              <div className="soField"><label>Materi 1–7</label><div className="soMaterials">
                {Array.from({ length: 7 }, (_, index) => <div className="soMaterialInput" key={index}><span>{index + 1}.</span><input value={draft.materials[index] || ''} onChange={(event) => setDraft((current) => current ? { ...current, materials: Array.from({ length: 7 }, (_, i) => i === index ? event.target.value : (current.materials[i] || '')) } : current)} placeholder={MATERIALS[index]} maxLength={240} aria-label={'Materi ' + (index + 1)} /></div>)}
              </div></div>
              <div className="soField"><label>Catatan internal (opsional)</label><textarea value={draft.notes} onChange={(event) => setDraft((current) => current ? { ...current, notes: event.target.value } : current)} maxLength={1000} /></div>
            </div>
          )}
          <p className="soMeta">Tidak ada tabel mahasiswa baru. Referensi peserta, event, kehadiran, penilaian, dan sertifikat menggunakan domain pendidikan AUREKA yang sudah ada.</p>
        </section>
      )}
    </section>
  )
}
