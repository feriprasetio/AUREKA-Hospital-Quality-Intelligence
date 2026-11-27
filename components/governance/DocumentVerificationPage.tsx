'use client'

import { useEffect, useState } from 'react'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { aurekaSupabase } from '@/lib/aureka/supabase'

type Verification={
  valid?:boolean
  artifact_code?:string
  title?:string
  artifact_type?:string
  sha256?:string
  signer?:string
  signer_role?:string
  signed_at?:string
  signature_type?:string
  note?:string
}

export default function DocumentVerificationPage({verificationCode}:{verificationCode:string}){
  const [data,setData]=useState<Verification|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    let cancelled=false
    setLoading(true);setError('');setData(null)
    aurekaSupabase.rpc('aureka_verify_artifact_signature',{p_verification_code:verificationCode})
      .then(({data,error})=>{
        if(cancelled)return
        if(error)setError(toUserFacingError(error, { fallback: 'Kode verifikasi belum dapat diperiksa.' }))
        else setData((data||null) as Verification|null)
        setLoading(false)
      },(e:unknown)=>{
        if(cancelled)return
        setError(toUserFacingError(e, { fallback: 'Tanda tangan belum dapat diverifikasi.' }))
        setLoading(false)
      })
    return()=>{cancelled=true}
  },[verificationCode,attempt])

  const valid=data?.valid===true
  return <main className="legalVerifyPage">
    <section className="legalVerifyCard" aria-live="polite" aria-busy={loading}>
      <div className="legalVerifyBrand">AUREKA · VERIFIKASI DOKUMEN</div>
      {loading?<><div className="legalVerifyMark">…</div><h1>Memeriksa dokumen</h1></>:error?<><div className="legalVerifyMark legalVerifyInvalid">!</div><h1>Verifikasi gagal</h1><p>{error}</p><button type="button" className="akBtn akBtnPrimary" onClick={()=>{setLoading(true);setAttempt(value=>value+1)}}>Coba lagi</button></>:!valid?<><div className="legalVerifyMark legalVerifyInvalid">×</div><h1>Kode tidak valid atau telah dicabut</h1></>:<><div className="legalVerifyMark legalVerifyValid">✓</div><h1>Persetujuan terverifikasi</h1>
        <dl className="legalVerifyMeta">
          <div><dt>Kode dokumen</dt><dd>{data.artifact_code||'—'}</dd></div>
          <div><dt>Judul dokumen</dt><dd>{data.title||'—'}</dd></div>
          <div><dt>Jenis dokumen</dt><dd>{data.artifact_type||'—'}</dd></div>
          <div><dt>Pejabat yang menyetujui</dt><dd>{data.signer||'—'}</dd></div>
          <div><dt>Role</dt><dd>{data.signer_role||'—'}</dd></div>
          <div><dt>Waktu persetujuan</dt><dd>{data.signed_at?new Date(data.signed_at).toLocaleString('id-ID',{dateStyle:'full',timeStyle:'short'}):'—'}</dd></div>
          <div className="legalVerifyHash"><dt>Hash SHA-256 dokumen</dt><dd>{data.sha256||'—'}</dd></div>
        </dl>
      </>}
      <div className="legalVerifyFoot">{data?.note||'Laman verifikasi ini hanya menampilkan metadata persetujuan yang diizinkan untuk akses publik. Konten dokumen dan file sumber tetap privat. Bukti ini bukan Sertifikat Elektronik atau Tanda Tangan Elektronik Tersertifikasi dari PSrE.'}</div>
    </section>
  </main>
}
