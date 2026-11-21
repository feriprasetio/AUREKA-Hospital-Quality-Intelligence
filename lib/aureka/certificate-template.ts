import { aurekaSupabase } from '@/lib/aureka/supabase'
import type { CertificateTemplateKey, CertificateLayout } from '@/lib/aureka/certificate-template-layout'
import { defaultCertificateLayout, normalizeCertificateLayout } from '@/lib/aureka/certificate-template-layout'

export * from '@/lib/aureka/certificate-template-layout'

export async function loadCertificateLayout(key: CertificateTemplateKey): Promise<CertificateLayout> {
  const { data, error } = await aurekaSupabase.schema('aureka_system')
    .from('education_certificate_templates')
    .select('layout')
    .eq('template_key', key)
    .maybeSingle()
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return defaultCertificateLayout(key)
    throw new Error('Template sertifikat tidak dapat dimuat: ' + error.message)
  }
  return normalizeCertificateLayout(data?.layout, key)
}
