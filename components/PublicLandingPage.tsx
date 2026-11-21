'use client'

import { useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { setAurekaMode, useAurekaMode } from '@/lib/ui/aureka-mode'
import { NATIONAL_INDICATORS } from '@/lib/aureka/national-indicators'

type Indicator = {
  code?: string; title?: string; actual?: number | null; target?: number | null
  unit?: string; operator?: string; period?: string; numerator?: number | null
  denominator?: number | null; status?: string; definition?: string; source?: string
  trend?: Array<{period: string; actual: number | null; target?: number | null}>
}
type Aggregate = { label?: string; category?: string; period?: string; count?: number; total?: number; closed?: number }
type Publication = {
  period: string
  published_at: string
  payload: { indicators?: Indicator[]; classifications?: Aggregate[]; monthly?: Aggregate[]; actions?: Aggregate[]; levels?: Aggregate[]; controls?: Aggregate[] }
}
type PortalFeed = { inm?: Publication | null; safety?: Publication | null; risk?: Publication | null }
type CertificateResult = {
  status: 'valid' | 'revoked' | 'not_ready' | 'not_found'
  valid?: boolean; certificate_number?: string; recipient_name?: string
  event_title?: string; event_type?: string; event_date?: string
  issue_date?: string; issued_at?: string; manifest_sha256?: string
  issuer?: string; signature_type?: string
}

const normalize = (input: string) => input.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const display = (value: unknown, unit = '') => {
  if (value === null || value === undefined || value === '') return 'Belum tersedia'
  return (typeof value === 'number' ? value.toLocaleString('id-ID',{maximumFractionDigits:2}) : String(value)) + (unit ? ' ' + unit : '')
}
const dateText = (value?: string) => {
  if (!value) return 'Belum tersedia'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Pontianak'})
}
const safeAggregates = (rows?: Aggregate[]) => Array.isArray(rows) ? rows.filter(row => row && typeof row==='object').slice(0,60) : []
const publishedItems = (feed:PortalFeed|null) => Array.isArray(feed?.inm?.payload?.indicators) ? feed.inm.payload.indicators : []

function EmptyData({message}:{message:string}) {
  return <div className="aurekaPublicEmpty" role="status"><span aria-hidden="true">○</span><strong>Belum ada data terpublikasi</strong><p>{message}</p></div>
}
function DomainHeader({kicker,title,description,id}:{kicker:string;title:string;description:string;id:string}){
  return <div className="aurekaPublicSectionHead" id={id}>
    <p className="aurekaPublicEyebrow">{kicker}</p><h2>{title}</h2><p>{description}</p>
  </div>
}
function AggregatePanel({title,rows,privacy=false}:{title:string;rows?:Aggregate[];privacy?:boolean}){
  const records = safeAggregates(rows).filter(row=>!privacy || number(row.count)===0 || (number(row.count)!==null && Number(row.count)>=5))
  const max = Math.max(1,...records.map(row => Math.max(0,number(row.count)??number(row.total)??0)))
  return <div className="aurekaPublicPanel">
    <h3>{title}</h3>
    {records.length===0?<p className="aurekaPublicMuted">Belum tersedia agregat yang disetujui untuk ditampilkan.</p>:
      <div className="aurekaPublicBars">
        {records.map((row,index)=>{
          const value=Math.max(0,number(row.count)??number(row.total)??0)
          return <div className="aurekaPublicBarRow" key={(row.label||row.period||row.category||'row')+index}>
            <div><span>{row.label||row.period||row.category||'Kategori'}</span><strong>{display(value)}</strong></div>
            <div className="aurekaPublicBarTrack"><span style={{width:(100*value/max)+'%'}}/></div>
          </div>
        })}
      </div>}
  </div>
}
function CertificateVerification({code,logoSrc}:{code:string;logoSrc:string}){
  const [result,setResult]=useState<CertificateResult|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    setLoading(true);setError('');setResult(null)
    aurekaSupabase.rpc('aureka_verify_education_certificate',{p_verification_code:code}).then(({data,error})=>{
      if(!active)return
      if(error)setError('Layanan verifikasi tidak dapat dihubungi. Periksa koneksi lalu coba kembali.')
      else setResult((data||{status:'not_found'}) as CertificateResult)
      setLoading(false)
    },()=>{
      if(active){setLoading(false);setError('Layanan verifikasi tidak dapat dihubungi. Coba kembali.')}
    })
    return ()=>{active=false}
  },[code])
  const goBack=()=>{window.location.hash=''}
  const valid=result?.status==='valid' && result?.valid===true
  return <main className="aurekaPublic aurekaPublicVerification">
    <header className="aurekaPublicHeader"><div className="aurekaPublicContainer aurekaPublicHeaderInner">
      <a href="#" className="aurekaPublicBrand" onClick={event=>{event.preventDefault();goBack()}}>
        <img src={logoSrc} alt="" width={160} height={136}/><span><strong>AUREKA</strong><small>Certificate Trust Center</small></span>
      </a>
      <button className="aurekaPublicSecondary" type="button" onClick={goBack}>Kembali ke portal</button>
    </div></header>
    <section className="aurekaPublicVerifyWrap" aria-live="polite">
      <div className="aurekaPublicVerifyCard">
        <div className="aurekaPublicVerificationSymbol" aria-hidden="true">{loading?'…':error?'!':valid?'✓':'!'}</div>
        <p className="aurekaPublicEyebrow">PENGESAHAN SERTIFIKAT · AUREKA</p>
        {loading?<><h1>Memeriksa sertifikat</h1><p>Memastikan status melalui register penerbitan resmi.</p></>:
          error?<><h1>Pemeriksaan belum tersedia</h1><p>{error}</p><button type="button" className="aurekaPublicPrimary" onClick={()=>window.location.reload()}>Coba lagi</button></>:
          result?.status==='revoked'?<><h1>Sertifikat telah dicabut</h1><p>Nomor {result.certificate_number||'-'} tidak lagi berstatus aktif dalam register Aureka.</p></>:
          result?.status==='not_ready'?<><h1>Pengesahan belum lengkap</h1><p>Manifest penerbitan sertifikat belum tersedia untuk divalidasi.</p></>:
          !valid?<><h1>Sertifikat tidak ditemukan</h1><p>Kode verifikasi tidak dikenali. Periksa bahwa QR atau nomor verifikasi berasal dari sertifikat yang diterbitkan melalui Aureka.</p></>:
          <><h1>Sertifikat terverifikasi</h1><p>Metadata penerbitan ditemukan dan sertifikat belum tercatat sebagai dicabut.</p>
            <dl className="aurekaPublicVerifyDetails">
              <div><dt>Nomor sertifikat</dt><dd>{result.certificate_number||'-'}</dd></div>
              <div><dt>Penerima</dt><dd>{result.recipient_name||'-'}</dd></div>
              <div><dt>Kegiatan</dt><dd>{result.event_title||'-'}</dd></div>
              <div><dt>Jenis kegiatan</dt><dd>{result.event_type==='student_orientation'?'Orientasi Mahasiswa':'In House Training'}</dd></div>
              <div><dt>Tanggal terbit</dt><dd>{dateText(result.issue_date)}</dd></div>
              <div><dt>Penerbit</dt><dd>{result.issuer||'-'}</dd></div>
              <div><dt>Integritas manifest</dt><dd className="aurekaPublicHash">{result.manifest_sha256||'-'}</dd></div>
            </dl>
          </>}
        <p className="aurekaPublicVerifyDisclaimer">Verifikasi ini memastikan status pencatatan dalam register Aureka. QR bukan tanda tangan elektronik tersertifikasi dan halaman ini tidak menggantikan verifikasi tanda tangan kriptografis pada berkas PDF.</p>
      </div>
    </section>
  </main>
}

export default function PublicLandingPage({logoSrc,onLogin,verificationCode}:{logoSrc:string;onLogin:()=>void;verificationCode?:string}){
  const mode=useAurekaMode()
  const [feed,setFeed]=useState<PortalFeed|null>(null)
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState(false)
  const [certificateInput,setCertificateInput]=useState('')
  useEffect(()=>{
    let active=true
    if(verificationCode)return
    aurekaSupabase.rpc('aureka_public_intelligence').then(({data,error})=>{
      if(!active)return
      if(error){setLoadError(true);setFeed(null)}
      else{setFeed((data||null) as PortalFeed|null);setLoadError(false)}
      setLoading(false)
    },()=>{if(active){setLoadError(true);setLoading(false)}})
    return ()=>{active=false}
  },[verificationCode])
  const indicators=useMemo(()=>publishedItems(feed),[feed])
  const measured=indicators.filter(item=>number(item.actual)!==null)
  const available=Object.values(feed||{}).filter(Boolean).length
  const updated=Object.values(feed||{}).filter(Boolean).map(x=>x?.published_at).filter((x):x is string=>Boolean(x)).sort().at(-1)
  if(verificationCode)return <CertificateVerification code={verificationCode} logoSrc={logoSrc}/>
  const submitCertificate=()=>{const code=certificateInput.trim().toUpperCase();if(code)window.location.hash='cert/'+encodeURIComponent(code)}
  return <main className="aurekaPublic" id="beranda">
    <a className="aurekaPublicSkip" href="#konten">Lewati ke konten</a>
    <header className="aurekaPublicHeader">
      <div className="aurekaPublicContainer aurekaPublicHeaderInner">
        <a className="aurekaPublicBrand" href="#beranda"><img src={logoSrc} alt="" width={160} height={136}/><span><strong>AUREKA</strong><small>Hospital Quality Intelligence</small></span></a>
        <nav className="aurekaPublicNav" aria-label="Navigasi publik">
          <a href="#inm">Indikator Mutu</a><a href="#safety">Keselamatan Pasien</a><a href="#risk">Manajemen Risiko</a><a href="#trust">Verifikasi</a>
        </nav>
        <div className="aurekaPublicHeaderActions">
          <button type="button" className="aurekaPublicTheme" aria-label={mode==='gelap'?'Ganti tema terang':'Ganti tema gelap'} onClick={()=>setAurekaMode(mode==='gelap'?'terang':'gelap')}>{mode==='gelap'?'☀':'◐'}</button>
          <button type="button" className="aurekaPublicPrimary" onClick={onLogin}>Masuk Workspace</button>
        </div>
      </div>
    </header>

    <div id="konten">
      <section className="aurekaPublicHero">
        <div className="aurekaPublicContainer aurekaPublicHeroGrid">
          <div>
            <p className="aurekaPublicEyebrow">PORTAL INFORMASI PUBLIK RUMAH SAKIT</p>
            <h1>Transparansi mutu. <em>Keselamatan yang dapat dipahami.</em></h1>
            <p className="aurekaPublicLead">Jelajahi indikator mutu nasional, upaya keselamatan pasien, manajemen risiko, serta pengesahan sertifikat melalui satu portal institusional.</p>
            <div className="aurekaPublicHeroButtons"><a className="aurekaPublicPrimary" href="#inm">Lihat capaian mutu</a><a className="aurekaPublicSecondary" href="#trust">Verifikasi sertifikat</a></div>
            <p className="aurekaPublicInstitution">UPT RSUD Sultan Syarif Mohamad Alkadrie · Kota Pontianak</p>
          </div>
          <div className="aurekaPublicHeroPanel" aria-label="Ikhtisar data publik">
            <div className="aurekaPublicPanelTitle"><span>Public intelligence overview</span><span className="aurekaPublicPill">Data terotorisasi</span></div>
            <div className="aurekaPublicHighlights">
              <div><span>Indikator dengan capaian</span><strong>{loading?'…':indicators.length?String(measured.length)+' / '+String(indicators.length):'-'}</strong><small>Dari profil yang terpublikasi</small></div>
              <div><span>Domain terpublikasi</span><strong>{loading?'…':String(available)+' / 3'}</strong><small>INM, keselamatan, risiko</small></div>
            </div>
            <div className="aurekaPublicPreview">
              <div><span>Informasi</span><b>Periode publikasi</b></div>
              <p>{updated?'Pembaruan terakhir '+dateText(updated):'Belum ada dataset yang disetujui untuk tayang di ruang publik.'}</p>
              {loadError&&<p role="alert">Layanan data publik belum dapat dijangkau.</p>}
            </div>
            <div className="aurekaPublicProvenance"><span aria-hidden="true">✓</span> Hanya hasil yang telah disetujui untuk publikasi</div>
          </div>
        </div>
      </section>

      <section className="aurekaPublicSection aurekaPublicContainer">
        <div className="aurekaPublicQuickGrid">
          <a href="#inm"><span>01</span><strong>Indikator Nasional Mutu</strong><small>Capaian, target, tren dan metodologi</small></a>
          <a href="#safety"><span>02</span><strong>Keselamatan Pasien</strong><small>Pelaporan agregat dan pembelajaran</small></a>
          <a href="#risk"><span>03</span><strong>Manajemen Risiko</strong><small>Profil risiko dan pengendalian</small></a>
          <a href="#trust"><span>04</span><strong>Keaslian Sertifikat</strong><small>Pengesahan tanpa login</small></a>
        </div>
      </section>

      <section className="aurekaPublicSection aurekaPublicContainer" aria-labelledby="inm-title">
        <DomainHeader id="inm" kicker="QUALITY INTELLIGENCE" title="Indikator Nasional Mutu" description="Jelajahi 13 indikator mutu rumah sakit. Nilai hanya ditampilkan bila sudah direkonsiliasi dan disetujui untuk publikasi."/>
        <div className="aurekaPublicSectionMeta" id="inm-title"><span>{feed?.inm?'Periode: '+feed.inm.period:'Belum ada periode terpublikasi'}</span><span>{feed?.inm?'Terbit: '+dateText(feed.inm.published_at):'Data tidak direkayasa'}</span></div>
        <div className="aurekaPublicIndicatorGrid">
          {NATIONAL_INDICATORS.map(([code,title],index)=>{
            const item=indicators.find(i=>normalize(i.title||'')===normalize(title)||normalize(i.code||'')===normalize(code))
            return <details className="aurekaPublicIndicator" key={code}>
              <summary><span className="aurekaPublicIndex">{String(index+1).padStart(2,'0')}</span><span className="aurekaPublicIndicatorInfo"><strong>{title}</strong><small>{item?.period||feed?.inm?.period||'Belum ada data resmi'}</small></span><span className="aurekaPublicIndicatorValue">{item&&number(item.actual)!==null?display(item.actual,item.unit):'—'}</span><span className="aurekaPublicChevron" aria-hidden="true">⌄</span></summary>
              <div className="aurekaPublicIndicatorDetail">
                <div><span>Target</span><strong>{item?display(item.target,item.unit):'Belum tersedia'}</strong></div>
                <div><span>Status capaian</span><strong>{item?.status||'Belum dapat dinilai'}</strong></div>
                <div><span>Numerator</span><strong>{display(item?.numerator)}</strong></div>
                <div><span>Denominator</span><strong>{display(item?.denominator)}</strong></div>
                {item?.definition&&<p><b>Definisi:</b> {item.definition}</p>}
                {item?.source&&<p><b>Sumber:</b> {item.source}</p>}
                {item?.trend&&item.trend.length>0&&<div className="aurekaPublicTrend">{item.trend.slice(-12).map((p,i)=><div key={i}><span>{p.period}</span><strong>{display(p.actual,item.unit)}</strong></div>)}</div>}
                {!item&&<p>Data indikator ini belum melewati tahapan validasi dan persetujuan publikasi.</p>}
              </div>
            </details>
          })}
        </div>
        <p className="aurekaPublicFootnote">Catatan metodologis: target, operator pembanding, numerator, denominator, grain pengukuran, dan versi profil wajib mengikuti standar indikator yang disahkan. Belum tersedia bukan berarti capaian nol.</p>
      </section>

      <section className="aurekaPublicSection aurekaPublicTint" aria-labelledby="safety-title"><div className="aurekaPublicContainer">
        <DomainHeader id="safety" kicker="PATIENT SAFETY INTELLIGENCE" title="Keselamatan Pasien" description="Kinerja pelaporan dan tindak lanjut ditampilkan pada tingkat agregat. Identitas pasien, pelapor, kronologi individu, dan rincian investigasi tetap rahasia."/>
        <div className="aurekaPublicSectionMeta" id="safety-title"><span>{feed?.safety?'Periode: '+feed.safety.period:'Belum ada periode terpublikasi'}</span><span>Agregat ditinjau untuk risiko identifikasi ulang</span></div>
        {!feed?.safety?<EmptyData message="Informasi keselamatan akan muncul setelah memenuhi ambang privasi, validasi, dan persetujuan publikasi."/>:
          <div className="aurekaPublicTwoColumns">
            <AggregatePanel title="Komposisi klasifikasi insiden" rows={feed.safety.payload.classifications} privacy/>
            <AggregatePanel title="Tren pelaporan" rows={feed.safety.payload.monthly} privacy/>
            <AggregatePanel title="Status tindak lanjut" rows={feed.safety.payload.actions} privacy/>
          </div>}
        <p className="aurekaPublicFootnote">Peningkatan jumlah laporan tidak otomatis berarti penurunan keselamatan. Data perlu ditafsirkan bersama kematangan budaya pelaporan dan tindakan perbaikan.</p>
      </div></section>

      <section className="aurekaPublicSection aurekaPublicContainer" aria-labelledby="risk-title">
        <DomainHeader id="risk" kicker="RISK INTELLIGENCE" title="Manajemen Risiko" description="Gambaran institusional pengendalian risiko tanpa membuka detail kerentanan operasional, nama penanggung jawab, atau isi risk register internal."/>
        <div className="aurekaPublicSectionMeta" id="risk-title"><span>{feed?.risk?'Periode: '+feed.risk.period:'Belum ada periode terpublikasi'}</span><span>Hanya kategori yang aman diungkapkan</span></div>
        {!feed?.risk?<EmptyData message="Profil risiko akan muncul setelah ringkasan institusional disetujui dan rincian sensitif dikeluarkan."/>:
          <div className="aurekaPublicTwoColumns">
            <AggregatePanel title="Distribusi tingkat risiko" rows={feed.risk.payload.levels}/>
            <AggregatePanel title="Efektivitas pengendalian" rows={feed.risk.payload.controls}/>
            <AggregatePanel title="Perkembangan berkala" rows={feed.risk.payload.monthly}/>
          </div>}
      </section>

      <section className="aurekaPublicSection aurekaPublicTint" aria-labelledby="trust-title"><div className="aurekaPublicContainer">
        <DomainHeader id="trust" kicker="CERTIFICATE TRUST CENTER" title="Verifikasi keaslian sertifikat" description="Penerima In House Training dan Orientasi Mahasiswa dapat memindai QR pada sertifikat atau memasukkan kode verifikasi, tanpa memiliki akun Aureka."/>
        <div className="aurekaPublicTrustGrid">
          <div className="aurekaPublicPanel">
            <h3 id="trust-title">Periksa sertifikat</h3>
            <form onSubmit={event=>{event.preventDefault();submitCertificate()}} className="aurekaPublicVerifyForm">
              <label htmlFor="public-cert-code">Kode verifikasi sertifikat</label>
              <input id="public-cert-code" type="text" autoComplete="off" spellCheck={false} value={certificateInput} onChange={event=>setCertificateInput(event.target.value)} placeholder="CERT-..." maxLength={70} required/>
              <button className="aurekaPublicPrimary" type="submit">Periksa keaslian</button>
            </form>
            <p className="aurekaPublicMuted">Pemindaian QR akan membuka halaman verifikasi langsung. Tidak perlu login atau mengunggah dokumen.</p>
          </div>
          <div className="aurekaPublicPanel"><h3>Bagaimana Aureka mengesahkan?</h3>
            <ol className="aurekaPublicSteps"><li>Sertifikat diterbitkan dari register kegiatan resmi.</li><li>Identitas penerbitan dan manifest dibekukan untuk audit.</li><li>Status diperiksa saat tautan QR diakses.</li><li>Pencabutan sertifikat terlihat melalui sumber resmi.</li></ol>
            <p className="aurekaPublicMuted">Verifikasi register berbeda dengan tanda tangan elektronik tersertifikasi.</p>
          </div>
        </div>
      </div></section>

      <footer className="aurekaPublicFooter"><div className="aurekaPublicContainer">
        <div><strong>AUREKA</strong><p>Hospital Quality Intelligence · RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak</p></div>
        <div><strong>Transparansi yang bertanggung jawab</strong><p>Hanya data agregat yang telah disetujui untuk publikasi. Data operasional, identitas pasien, investigasi dan dokumen sumber tetap berada di lingkungan internal.</p></div>
      </div></footer>
    </div>
    <nav className="aurekaPublicBottomNav" aria-label="Navigasi publik ponsel">
      <a href="#beranda">Beranda</a><a href="#inm">Mutu</a><a href="#safety">Keselamatan</a><a href="#risk">Risiko</a><a href="#trust">Verifikasi</a>
    </nav>
  </main>
}
