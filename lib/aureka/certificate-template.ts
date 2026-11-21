import { aurekaSupabase } from '@/lib/aureka/supabase'

export type CertificateTemplateKey = 'in_house_training' | 'student_orientation'
export type CertificateElementId =
  | 'logo_pemkot' | 'logo_rsud' | 'institution' | 'title' | 'subtitle'
  | 'recipient_label' | 'recipient_name' | 'role' | 'activity' | 'details'
  | 'materials' | 'issue_date' | 'signature_left' | 'signature_right' | 'verification' | 'footer'

export type CertificatePoint = { x: number; y: number }
export type CertificateLayout = Record<CertificateElementId, CertificatePoint>

export const CERTIFICATE_ELEMENTS: Array<{ id: CertificateElementId; label: string }> = [
  { id: 'logo_pemkot', label: 'Logo Pemerintah Kota' },
  { id: 'logo_rsud', label: 'Logo RSUD' },
  { id: 'institution', label: 'Kop institusi' },
  { id: 'title', label: 'Judul sertifikat' },
  { id: 'subtitle', label: 'Jenis sertifikat' },
  { id: 'recipient_label', label: 'Label penerima' },
  { id: 'recipient_name', label: 'Nama penerima' },
  { id: 'role', label: 'Peran penerima' },
  { id: 'activity', label: 'Nama kegiatan' },
  { id: 'details', label: 'Keterangan kegiatan' },
  { id: 'materials', label: 'Daftar materi' },
  { id: 'issue_date', label: 'Tanggal penerbitan' },
  { id: 'signature_left', label: 'Area pengesahan kiri' },
  { id: 'signature_right', label: 'Area pengesahan kanan' },
  { id: 'verification', label: 'Identitas verifikasi' },
  { id: 'footer', label: 'AUREKA Document Intelligence' },
]

const sharedDefaults: CertificateLayout = {
  logo_pemkot: { x: 10, y: 13 },
  logo_rsud: { x: 90, y: 13 },
  institution: { x: 50, y: 12 },
  title: { x: 50, y: 25 },
  subtitle: { x: 50, y: 31 },
  recipient_label: { x: 50, y: 38 },
  recipient_name: { x: 50, y: 45 },
  role: { x: 50, y: 52 },
  activity: { x: 50, y: 59 },
  details: { x: 50, y: 65 },
  materials: { x: 25, y: 72 },
  issue_date: { x: 77, y: 79 },
  signature_left: { x: 24, y: 86 },
  signature_right: { x: 76, y: 86 },
  verification: { x: 91, y: 91 },
  footer: { x: 50, y: 96 },
}

export function defaultCertificateLayout(key: CertificateTemplateKey): CertificateLayout {
  const layout = Object.fromEntries(
    Object.entries(sharedDefaults).map(([id, point]) => [id, { ...point }]),
  ) as CertificateLayout
  if (key === 'student_orientation') {
    layout.materials = { x: 22, y: 69 }
    layout.details = { x: 50, y: 62 }
  }
  return layout
}

export function normalizeCertificateLayout(value: unknown, key: CertificateTemplateKey): CertificateLayout {
  const defaults = defaultCertificateLayout(key)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const source = value as Record<string, unknown>
  for (const element of CERTIFICATE_ELEMENTS) {
    const candidate = source[element.id]
    if (!candidate || typeof candidate !== 'object') continue
    const point = candidate as Record<string, unknown>
    const x = Number(point.x)
    const y = Number(point.y)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      defaults[element.id] = {
        x: Math.min(98, Math.max(2, x)),
        y: Math.min(98, Math.max(2, y)),
      }
    }
  }
  return defaults
}

export async function loadCertificateLayout(key: CertificateTemplateKey): Promise<CertificateLayout> {
  const { data, error } = await aurekaSupabase.schema('aureka_system')
    .from('education_certificate_templates')
    .select('layout')
    .eq('template_key', key)
    .maybeSingle()
  if (error) throw new Error('Template sertifikat tidak dapat dimuat: ' + error.message)
  return normalizeCertificateLayout(data?.layout, key)
}

export function pdfPoint(
  layout: CertificateLayout,
  id: CertificateElementId,
  fallback: { x: number; y: number },
  width = 842,
  height = 595,
): { x: number; y: number } {
  const point = layout[id] || fallback
  return {
    x: Math.round((Math.min(100, Math.max(0, point.x)) / 100) * width),
    y: Math.round(height - (Math.min(100, Math.max(0, point.y)) / 100) * height),
  }
}
