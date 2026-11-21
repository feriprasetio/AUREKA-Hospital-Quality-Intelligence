import { aurekaSupabase } from '@/lib/aureka/supabase'

export type LegalSignatureStamp = {
  signature_id: string
  signer_name: string
  signer_position: string
  signer_role: string
  signed_at: string
  verification_code: string
  image_mime_type: string
  image_data_base64: string
  image_sha256: string
}

/** URL publik untuk barcode/QR pada dokumen terbit. Tidak membawa data pribadi atau isi dokumen. */
export function documentVerificationUrl(verificationCode: string, origin?: string, pathname?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const normalized = path.endsWith('/') ? path : path + '/'
  return base + normalized + '#v/' + encodeURIComponent(verificationCode)
}

/** Mengambil cap tanda tangan terotorisasi untuk ditempel penerbit ke dokumen setelah semua approval selesai. */
export async function getDocumentSignatureStamps(artifactId: string): Promise<LegalSignatureStamp[]> {
  const {data,error}=await aurekaSupabase.rpc('aureka_get_artifact_signature_stamps',{p_artifact_id:artifactId})
  if(error)throw new Error(error.message || 'Aset tanda tangan dokumen tidak dapat dimuat.')
  return (data || []) as LegalSignatureStamp[]
}

/** URL gambar QR eksternal hanya menerima URL verifikasi publik; isi dokumen tetap privat. */
export function documentVerificationQrUrl(verificationCode: string, origin?: string, pathname?: string): string {
  const target=documentVerificationUrl(verificationCode,origin,pathname)
  return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data='+encodeURIComponent(target)
}
