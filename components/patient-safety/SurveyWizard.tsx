'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Item = { code: string; text: string }
type Dimension = { title: string; code: string; items: Item[] }
type Option = { value: string; label: string; hint?: string }

type Meta = {
  period: string; setPeriod: (v: string) => void
  unit: string; setUnit: (v: string) => void
  profession: string; setProfession: (v: string) => void
  hospitalTenure: string; setHospitalTenure: (v: string) => void
  unitTenure: string; setUnitTenure: (v: string) => void
  shift: string; setShift: (v: string) => void
  role: string; setRole: (v: string) => void
  patientContact: string; setPatientContact: (v: string) => void
}

type Props = {
  meta: Meta
  roomOptions: string[]
  respondentOptions: { id: string; label: string }[]
  professionFromRespondent: string
  selectedRespondentId: string
  onRespondentChange: (value: string) => void
  identityConfirmed: boolean
  onIdentityConfirmedChange: (value: boolean) => void
  dimensions: Dimension[]
  whoItems: Item[]
  required: string[]
  answers: Record<string, string>
  setAnswer: (code: string, value: string) => void
  saving: boolean
  error: string
  lastResponseCode: string
  onSubmit: () => Promise<void> | void
  onReset: () => void
}

const LIKERT: Option[] = [
  { value: '1', label: '1', hint: 'Sangat tidak setuju' },
  { value: '2', label: '2', hint: 'Tidak setuju' },
  { value: '3', label: '3', hint: 'Netral' },
  { value: '4', label: '4', hint: 'Setuju' },
  { value: '5', label: '5', hint: 'Sangat setuju' },
]
const WHO_SCALE: Option[] = [
  { value: '0', label: '0', hint: 'Tidak pernah' },
  { value: '1', label: '1', hint: 'Kadang-kadang' },
  { value: '2', label: '2', hint: 'Kurang dari separuh waktu' },
  { value: '3', label: '3', hint: 'Lebih dari separuh waktu' },
  { value: '4', label: '4', hint: 'Sebagian besar waktu' },
  { value: '5', label: '5', hint: 'Sepanjang waktu' },
]
const B26_OPTIONS: Option[] = [
  { value: '0', label: 'Tidak pernah' }, { value: '1', label: '1–2 kali' },
  { value: '2', label: '3–5 kali' }, { value: '3', label: 'Lebih dari 5 kali' },
]
const E1_OPTIONS: Option[] = [
  { value: '1', label: 'Buruk' }, { value: '2', label: 'Kurang' }, { value: '3', label: 'Cukup' },
  { value: '4', label: 'Baik' }, { value: '5', label: 'Sangat baik' },
]
const E2_OPTIONS: Option[] = [
  { value: '0', label: 'Tidak pernah' }, { value: '1', label: '1–2 kali' }, { value: '2', label: '3–5 kali' },
  { value: '3', label: '6–10 kali' }, { value: '4', label: '> 10 kali' },
]
const BURNOUT = [
  'Saya menikmati pekerjaan saya. Saya tidak mengalami gejala burnout (kelelahan kerja).',
  'Saya terkadang merasa stres, tetapi saya tidak memiliki gejala burnout.',
  'Saya mulai mengalami burnout. Saya memiliki satu atau lebih gejala, seperti kelelahan fisik/emosional, namun masih bisa mengatasinya.',
  'Gejala burnout yang saya alami sudah mulai mengganggu, sehingga sulit bagi saya untuk tidak memikirkannya bahkan saat sedang tidak bekerja.',
  'Saya merasa sepenuhnya kehabisan tenaga (burnout berat) dan sering berpikir bahwa saya tidak sanggup lagi melakukan pekerjaan ini.',
]
const PERIODS = ['2026-Q4', '2027-Q1', '2027-Q2', '2027-Q3', '2027-Q4', '2028-Q1']
const PROFESSIONS = ['Medis / Dokter', 'Perawat / Bidan', 'Farmasi', 'Penunjang Medis', 'Manajemen / Administrasi', 'Lainnya']
const TENURE = ['< 1 tahun', '1–5 tahun', '6–10 tahun', '> 10 tahun']
const SHIFTS = ['Non-shift (jam kerja reguler)', 'Shift tanpa dinas malam', 'Shift dengan dinas malam / rotasi']
const ROLES = ['Staf pelaksana (klinis / non-klinis)', 'Penyelia / Kepala Ruangan / Manajerial']

type Step = { key: string; title: string; subtitle: string; codes: string[] }

function Chips({ label, value, options, onChange, optional, name }: { label: string; value: string; options: string[]; onChange: (v: string) => void; optional?: boolean; name: string }) {
  return (
    <fieldset className="svField">
      <legend>{label}{optional ? <small> (opsional)</small> : <span className="svReq" aria-hidden="true"> *</span>}</legend>
      <div className="svChips" role="radiogroup" aria-label={label}>
        {options.map(option => (
          <button key={option} type="button" role="radio" aria-checked={value === option} name={name}
            className={'svChip' + (value === option ? ' on' : '')} onClick={() => onChange(value === option && optional ? '' : option)}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function SurveyWizard(props: Props) {
  const { meta, roomOptions, respondentOptions, professionFromRespondent, selectedRespondentId, onRespondentChange, identityConfirmed, onIdentityConfirmedChange, dimensions, whoItems, required, answers, setAnswer, saving, error, lastResponseCode, onSubmit, onReset } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [done, setDone] = useState(false)
  const submitCodeRef = useRef<string | null>(null)

  const steps: Step[] = useMemo(() => [
    { key: 'profil', title: 'Identitas & Profil Responden', subtitle: 'Survei tahunan bernama dengan pencatatan identitas responden dan akun pengirim secara terpisah.', codes: [] },
    ...dimensions.map(d => ({ key: 'dim-' + d.code, title: d.title, subtitle: 'Dimensi ' + d.code + ' · seberapa setuju Anda?', codes: d.items.map(i => i.code) })),
    { key: 'kesejahteraan', title: 'Kesejahteraan Anda', subtitle: 'Kekerasan verbal 12 bulan terakhir dan perasaan Anda dua minggu terakhir.', codes: ['B26', ...whoItems.map(i => i.code)] },
    { key: 'burnout', title: 'Kondisi kelelahan kerja', subtitle: 'Pilih satu pernyataan yang paling menggambarkan Anda saat ini.', codes: ['D1'] },
    { key: 'hasil', title: 'Penilaian umum', subtitle: 'Dua pertanyaan terakhir sebelum meninjau jawaban.', codes: ['E1', 'E2'] },
    { key: 'tinjau', title: 'Tinjau & kirim', subtitle: 'Periksa kembali profil, konfirmasi identitas, dan kelengkapan jawaban sebelum mengirim.', codes: [] },
  ], [dimensions, whoItems])

  const step = steps[stepIndex]
  const answered = (code: string) => Object.prototype.hasOwnProperty.call(answers, code) && answers[code] !== ''
  const totalAnswered = required.filter(answered).length
  const percent = Math.round((totalAnswered / Math.max(1, required.length)) * 100)
  const profileOk = Boolean(meta.unit && meta.profession && selectedRespondentId && identityConfirmed)
  const stepMissing = (s: Step) => s.codes.filter(c => !answered(c)).length
  const isLast = stepIndex === steps.length - 1

  // Selesai: kode respons baru muncul setelah kirim berhasil
  useEffect(() => {
    if (submitCodeRef.current !== null && lastResponseCode && lastResponseCode !== submitCodeRef.current) {
      setDone(true)
      submitCodeRef.current = null
    }
  }, [lastResponseCode])

  const goTo = (index: number) => {
    setStepIndex(Math.max(0, Math.min(steps.length - 1, index)))
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const pick = (code: string, value: string, codes: string[]) => {
    setAnswer(code, value)
    // gulir halus ke pertanyaan berikutnya yang belum dijawab di bagian ini
    const next = codes.find(c => c !== code && !answered(c))
    if (!next) return
    window.setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-sv-q="${next}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 160)
  }

  const scale = (code: string, options: Option[], codes: string[], withTB: boolean) => (
    <div className="svScaleWrap">
      <div className={'svScale' + (options.length > 6 ? ' many' : '')} role="radiogroup" aria-label={'Jawaban ' + code}>
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={answers[code] === o.value} title={o.hint}
            className={'svDot' + (answers[code] === o.value ? ' on' : '')} onClick={() => pick(code, o.value, codes)}>
            <b>{o.label}</b>{o.hint ? <span className="svSr">{o.hint}</span> : null}
          </button>
        ))}
        {withTB ? (
          <button type="button" role="radio" aria-checked={answers[code] === 'TB'} title="Tidak berlaku"
            className={'svDot tb' + (answers[code] === 'TB' ? ' on' : '')} onClick={() => pick(code, 'TB', codes)}>
            <b>TB</b><span className="svSr">Tidak berlaku</span>
          </button>
        ) : null}
      </div>
      <div className="svScaleEnds" aria-hidden="true"><span>{options[0].hint}</span><span>{options[options.length - 1].hint}</span></div>
    </div>
  )

  const pills = (code: string, options: Option[], codes: string[]) => (
    <div className="svPills" role="radiogroup" aria-label={'Jawaban ' + code}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={answers[code] === o.value}
          className={'svChip' + (answers[code] === o.value ? ' on' : '')} onClick={() => pick(code, o.value, codes)}>{o.label}</button>
      ))}
    </div>
  )

  const question = (code: string, text: string, body: ReactNode, index: number, total: number) => (
    <article key={code} data-sv-q={code} className={'svQ' + (answered(code) ? ' ok' : '')}>
      <header><span className="svQNo">{index + 1}/{total}</span><span className="svQCode">{code}</span>{answered(code) ? <span className="svQDone" aria-label="Sudah dijawab">✓</span> : null}</header>
      <p>{text}</p>
      {body}
    </article>
  )

  if (done) {
    return (
      <div ref={rootRef} className="svWizard">
        <section className="svDone" role="status">
          <div className="svDoneMark" aria-hidden="true">✓</div>
          <h3>Terima kasih, jawaban Anda sudah terkirim.</h3>
          <p>Kode respons: <b>{lastResponseCode}</b>. Identitas responden dan akun pengirim dicatat terpisah untuk audit tata kelola.</p>
          <button type="button" className="svBtn primary" onClick={() => { onReset(); setDone(false); goTo(0) }}>Isi untuk responden berikutnya</button>
        </section>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="svWizard">
      <div className="svTop">
        <div className="svTopRow">
          <span className="svEyebrow">Survei Budaya Keselamatan · bernama</span>
          <span className="svCount">{totalAnswered}/{required.length} terjawab</span>
        </div>
        <div className="svBar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Kemajuan pengisian"><i style={{ width: percent + '%' }} /></div>
        <ol className="svSteps" aria-label="Bagian survei">
          {steps.map((s, i) => {
            const miss = stepMissing(s)
            const state = i === stepIndex ? 'now' : (s.key === 'profil' ? (profileOk ? 'ok' : '') : (s.codes.length && !miss ? 'ok' : ''))
            return <li key={s.key}><button type="button" className={'svStepDot ' + state} aria-current={i === stepIndex ? 'step' : undefined}
              aria-label={`Bagian ${i + 1}: ${s.title}`} onClick={() => (i === 0 || profileOk) && goTo(i)} disabled={i > 0 && !profileOk} /></li>
          })}
        </ol>
      </div>

      <section className="svCard" aria-labelledby="sv-step-title">
        <div className="svHead">
          <span className="svStepNo">Bagian {stepIndex + 1} dari {steps.length}</span>
          <h3 id="sv-step-title">{step.title}</h3>
          <p>{step.subtitle}</p>
        </div>

        {step.key === 'profil' ? (
          <div className="svProfile">
            <div className="svPrivacy"><b>Survei bernama dengan akses terbatas.</b> Identitas responden diambil dari Direktori Induk SDM dan disimpan terpisah dari akun yang mengirim. Jawaban individual dapat ditelusuri oleh petugas berwenang; hasil organisasi dilaporkan secara agregat dan digunakan untuk pembelajaran/perbaikan sistem. Perkiraan waktu 15–20 menit. Untuk pernyataan tidak relevan, pilih <b>TB</b> (tidak berlaku).</div>
            <label className="svField svSelect">
              <span>Unit kerja <span className="svReq" aria-hidden="true">*</span></span>
              <select value={meta.unit} onChange={e => meta.setUnit(e.target.value)}>
                <option value="">Pilih unit kerja</option>
                {roomOptions.map(name => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label className="svField svSelect">
              <span>Nama responden (Direktori Induk SDM) <span className="svReq" aria-hidden="true">*</span></span>
              <select value={selectedRespondentId} onChange={e => onRespondentChange(e.target.value)} disabled={!meta.unit || !respondentOptions.length}>
                <option value="">{!meta.unit ? 'Pilih unit terlebih dahulu' : respondentOptions.length ? 'Pilih nama responden' : 'Tidak ada petugas dengan penugasan aktif pada unit ini'}</option>
                {respondentOptions.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}
              </select>
            </label>
            <div className="svPrivacy" style={{ background: '#fff9eb', borderColor: '#f0dfb3' }}>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={identityConfirmed} onChange={e => onIdentityConfirmedChange(e.target.checked)} />
                <span><b>Konfirmasi identitas responden.</b> Saya telah memeriksa identitas dan sepengetahuan responden melakukan pencatatan ini. Akun login yang mengirim tetap dicatat sebagai submitter; konfirmasi ini bukan bukti biometrik siapa yang secara fisik mengetik jawaban.</span>
              </label>
            </div>
            <div className="svProfileReadonly"><span>Profesi / kelompok jabatan dari Direktori Induk SDM</span><b>{professionFromRespondent || 'Otomatis mengikuti tenaga kerja yang dipilih'}</b></div>
            <Chips name="sv-ht" label="Lama bekerja di RS" value={meta.hospitalTenure} options={TENURE} onChange={meta.setHospitalTenure} optional />
            <Chips name="sv-ut" label="Lama bekerja di unit saat ini" value={meta.unitTenure} options={TENURE} onChange={meta.setUnitTenure} optional />
            <Chips name="sv-shift" label="Pola kerja / shift" value={meta.shift} options={SHIFTS} onChange={meta.setShift} optional />
            <Chips name="sv-role" label="Peran utama" value={meta.role} options={ROLES} onChange={meta.setRole} optional />
            <Chips name="sv-pc" label="Interaksi langsung dengan pasien" value={meta.patientContact} options={['Ya', 'Tidak']} onChange={meta.setPatientContact} optional />
            <details className="svMore"><summary>Periode survei: {meta.period}</summary>
              <Chips name="sv-period" label="Periode survei" value={meta.period} options={PERIODS} onChange={meta.setPeriod} />
            </details>
          </div>
        ) : null}

        {step.key.startsWith('dim-') ? (
          <div className="svList">
            <div className="svLegend" aria-hidden="true"><span>1 Sangat tidak setuju</span><span>3 Netral</span><span>5 Sangat setuju</span><span>TB Tidak berlaku</span></div>
            {dimensions.find(d => 'dim-' + d.code === step.key)!.items.map((item, i, arr) =>
              question(item.code, item.text, scale(item.code, LIKERT, step.codes, true), i, arr.length))}
          </div>
        ) : null}

        {step.key === 'kesejahteraan' ? (
          <div className="svList">
            {question('B26', 'Dalam 12 bulan terakhir, seberapa sering Anda mengalami kekerasan verbal (dibentak / diancam / dihina) dari pasien, keluarga, atau pengunjung di tempat kerja?', pills('B26', B26_OPTIONS, step.codes), 0, step.codes.length)}
            <div className="svLegend solo">Dalam dua minggu terakhir… <span>0 Tidak pernah → 5 Sepanjang waktu</span></div>
            {whoItems.map((item, i) => question(item.code, item.text.replace(/^\.\.\./, 'Dalam dua minggu terakhir, '), scale(item.code, WHO_SCALE, step.codes, false), i + 1, step.codes.length))}
          </div>
        ) : null}

        {step.key === 'burnout' ? (
          <div className="svBurnout" role="radiogroup" aria-label="Kondisi kelelahan kerja">
            {BURNOUT.map((text, i) => (
              <button key={i} type="button" role="radio" aria-checked={answers.D1 === String(i + 1)}
                className={'svBurn' + (answers.D1 === String(i + 1) ? ' on' : '')} onClick={() => setAnswer('D1', String(i + 1))}>
                <span className="svBurnLevel" data-level={i + 1}>{i + 1}</span><span>{text}</span>
              </button>
            ))}
          </div>
        ) : null}

        {step.key === 'hasil' ? (
          <div className="svList">
            {question('E1', 'Beri nilai keseluruhan untuk budaya/kondisi keselamatan pasien di unit kerja Anda saat ini.', pills('E1', E1_OPTIONS, step.codes), 0, 2)}
            {question('E2', 'Dalam 12 bulan terakhir, berapa kali Anda melaporkan insiden atau kejadian nyaris cedera (near-miss)?', pills('E2', E2_OPTIONS, step.codes), 1, 2)}
          </div>
        ) : null}

        {step.key === 'tinjau' ? (
          <div className="svReview">
            <div className="svRing" style={{ ['--p' as string]: percent }} aria-hidden="true"><b>{percent}%</b><small>lengkap</small></div>
            <ul>
              <li className={profileOk ? 'ok' : 'miss'}><button type="button" onClick={() => goTo(0)}><span>Identitas & profil responden</span><em>{profileOk ? 'Lengkap' : 'Unit, profesi, nama & konfirmasi wajib'}</em></button></li>
              {steps.slice(1, -1).map((s, i) => {
                const miss = stepMissing(s)
                return <li key={s.key} className={miss ? 'miss' : 'ok'}><button type="button" onClick={() => goTo(i + 1)}><span>{s.title}</span><em>{miss ? miss + ' belum dijawab' : 'Lengkap'}</em></button></li>
              })}
            </ul>
            {error ? <div className="svError" role="alert">{error}</div> : null}
          </div>
        ) : null}
      </section>

      <nav className="svNav" aria-label="Navigasi survei">
        <button type="button" className="svBtn ghost" disabled={stepIndex === 0 || saving} onClick={() => goTo(stepIndex - 1)}>← Kembali</button>
        <span className="svNavInfo">{step.codes.length ? (stepMissing(step) ? stepMissing(step) + ' belum dijawab' : 'Bagian ini lengkap') : (step.key === 'profil' && !profileOk ? 'Pilih unit & profesi' : '')}</span>
        {isLast ? (
          <button type="button" className="svBtn primary" disabled={saving || !profileOk || totalAnswered < required.length}
            onClick={() => { submitCodeRef.current = lastResponseCode || ''; void onSubmit() }}>{saving ? 'Mengirim…' : 'Kirim respons bernama'}</button>
        ) : (
          <button type="button" className={'svBtn primary' + (step.codes.length && !stepMissing(step) ? ' pulse' : '')}
            disabled={stepIndex === 0 && !profileOk} onClick={() => goTo(stepIndex + 1)}>Lanjut →</button>
        )}
      </nav>
    </div>
  )
}
