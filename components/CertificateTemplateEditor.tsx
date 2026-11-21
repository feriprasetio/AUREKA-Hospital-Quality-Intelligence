'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import {
  CERTIFICATE_ELEMENTS,
  defaultCertificateLayout,
  normalizeCertificateLayout,
  type CertificateElementId,
  type CertificateLayout,
  type CertificateTemplateKey,
} from '@/lib/aureka/certificate-template'

const managerRoles = ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID']
const AUREKA_LOGO = '/AUREKA-Hospital-Quality-Intelligence/logo-aureka-v2.png'

type Props = {
  templateKey: CertificateTemplateKey
  role: string | null
  onClose: () => void
}

const titles: Record<CertificateTemplateKey, string> = {
  in_house_training: 'Sertifikat In House Training',
  student_orientation: 'Sertifikat Orientasi Mahasiswa',
}

const examples: Record<CertificateElementId, string> = {
  logo_pemkot: 'LOGO PEMKOT',
  logo_rsud: 'LOGO RSUD',
  institution: 'DINAS KESEHATAN KOTA PONTIANAK  ·  UPT RSUD SULTAN SYARIF MOHAMAD ALKADRIE',
  title: 'Sertifikat',
  subtitle: 'IN HOUSE TRAINING',
  recipient_label: 'Diberikan kepada',
  recipient_name: 'Nama Penerima Sertifikat',
  role: 'Sebagai Peserta / Narasumber',
  activity: 'Nama kegiatan pelatihan atau orientasi',
  details: 'Pontianak · Tanggal pelaksanaan · Penyelenggara',
  materials: 'Daftar materi kegiatan',
  program_info: 'Program / Profesi · Institusi',
  issue_date: 'Pontianak, 21 November 2026',
  signature_left: 'Direktur',
  signature_right: 'Ketua Penyelenggara',
  verification: 'QR VERIFIKASI',
  footer: 'AUREKA DOCUMENT INTELLIGENCE',
}

const fontFor = (id: CertificateElementId) => id === 'title'
  ? 'Georgia, "Times New Roman", serif'
  : 'var(--font-aureka, "Plus Jakarta Sans"), Arial, sans-serif'

export default function CertificateTemplateEditor({ templateKey, role, onClose }: Props) {
  const canManage = managerRoles.includes(role || '')
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<CertificateElementId | null>(null)
  const [layout, setLayout] = useState<CertificateLayout>(() => defaultCertificateLayout(templateKey))
  const [selected, setSelected] = useState<CertificateElementId>('title')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedLabel = useMemo(
    () => CERTIFICATE_ELEMENTS.find((item) => item.id === selected)?.label || selected,
    [selected],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: readError } = await aurekaSupabase.schema('aureka_system')
        .from('education_certificate_templates')
        .select('layout')
        .eq('template_key', templateKey)
        .maybeSingle()
      if (readError) throw readError
      setLayout(normalizeCertificateLayout(data?.layout, templateKey))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template belum dapat dibaca.')
    } finally {
      setLoading(false)
    }
  }, [templateKey])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const moveToPointer = (event: PointerEvent<HTMLDivElement>) => {
    const id = dragRef.current
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!id || !bounds || bounds.width <= 0 || bounds.height <= 0) return
    const x = Math.min(98, Math.max(2, ((event.clientX - bounds.left) / bounds.width) * 100))
    const y = Math.min(98, Math.max(2, ((event.clientY - bounds.top) / bounds.height) * 100))
    setLayout((current) => ({ ...current, [id]: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } }))
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: CertificateElementId) => {
    if (!canManage || loading || saving) return
    event.preventDefault()
    dragRef.current = id
    setSelected(id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const finishDrag = () => { dragRef.current = null }

  const nudge = (dx: number, dy: number) => {
    setLayout((current) => {
      const point = current[selected]
      return {
        ...current,
        [selected]: {
          x: Math.min(98, Math.max(2, Math.round((point.x + dx) * 10) / 10)),
          y: Math.min(98, Math.max(2, Math.round((point.y + dy) * 10) / 10)),
        },
      }
    })
  }

  const setCoordinate = (axis: 'x' | 'y', value: string) => {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    setLayout((current) => ({
      ...current,
      [selected]: { ...current[selected], [axis]: Math.min(98, Math.max(2, next)) },
    }))
  }

  const save = async () => {
    if (!canManage || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data: auth, error: authError } = await aurekaSupabase.auth.getUser()
      if (authError || !auth.user) throw authError || new Error('Sesi login tidak ditemukan.')
      const { error: writeError } = await aurekaSupabase.schema('aureka_system')
        .from('education_certificate_templates')
        .upsert({
          template_key: templateKey,
          display_label: titles[templateKey],
          layout,
          updated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'template_key' })
      if (writeError) throw writeError
      setNotice('Tata letak berhasil disimpan sebagai template default.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template belum dapat disimpan.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setLayout(defaultCertificateLayout(templateKey))
    setSelected('title')
    setNotice('Posisi dikembalikan ke tata letak awal. Simpan untuk menjadikannya default.')
  }

  if (!canManage) return null

  return (
    <div className="certificateEditorBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="certificateEditorDialog" role="dialog" aria-modal="true" aria-labelledby="certificate-editor-title">
        <header className="certificateEditorHeader">
          <div>
            <span className="certificateEditorEyebrow">PENGATURAN TEMPLATE DOKUMEN</span>
            <h2 id="certificate-editor-title">Certificate Layout Editor</h2>
            <p>{titles[templateKey]} · Geser objek pada lembar untuk mengatur posisinya. Isi dan desain elemen tetap.</p>
          </div>
          <button className="certificateEditorClose" type="button" onClick={onClose} disabled={saving} aria-label="Tutup editor">×</button>
        </header>

        {error && <div className="certificateEditorMessage error" role="alert">{error}</div>}
        {notice && <div className="certificateEditorMessage" role="status">{notice}</div>}

        <div className="certificateEditorBody">
          <div className="certificateEditorStagePanel">
            <div className="certificateEditorStageToolbar">
              <span>A4 Landscape · Pratinjau posisi</span>
              <span>{loading ? 'Memuat template…' : 'Drag & drop aktif'}</span>
            </div>
            <div className="certificateEditorStageViewport">
              <div
                className="certificateEditorStage"
                ref={stageRef}
                onPointerMove={moveToPointer}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
              >
                <div className="certificateEditorBorder" />
                <div className="certificateEditorCorner topLeft" />
                <div className="certificateEditorCorner bottomRight" />

                {CERTIFICATE_ELEMENTS.map((element) => {
                  const point = layout[element.id]
                  const active = selected === element.id
                  const style: CSSProperties = {
                    left: point.x + '%',
                    top: point.y + '%',
                    fontFamily: fontFor(element.id),
                  }
                  const isLogo = element.id === 'logo_pemkot' || element.id === 'logo_rsud'
                  const isSignature = element.id === 'signature_left' || element.id === 'signature_right'
                  const isQr = element.id === 'verification'
                  return (
                    <button
                      key={element.id}
                      type="button"
                      className={'certificateEditorElement' + (active ? ' selected' : '') + (isLogo ? ' logo' : '') + (isSignature ? ' signature' : '') + (isQr ? ' qr' : '')}
                      style={style}
                      onPointerDown={(event) => startDrag(event, element.id)}
                      onPointerUp={finishDrag}
                      onClick={() => setSelected(element.id)}
                      aria-label={'Pilih dan geser ' + element.label}
                    >
                      {isLogo ? <span className="certificateEditorLogoMark">{element.id === 'logo_pemkot' ? 'PEM' : 'RS'}</span>
                        : isSignature ? <><span className="certificateEditorSignLine" /><span>{examples[element.id]}</span></>
                        : isQr ? <span className="certificateEditorQrMark">QR</span>
                        : element.id === 'footer' ? <span className="certificateEditorFooterMark"><img src={AUREKA_LOGO} alt="" />{examples[element.id]}</span>
                        : <span>{examples[element.id]}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="certificateEditorHint">Pilih elemen lalu seret. Posisi tersimpan sebagai persentase bidang A4 sehingga proporsinya tetap saat dicetak.</p>
          </div>

          <aside className="certificateEditorControls">
            <div className="certificateEditorControlHeading">
              <span>Elemen terpilih</span>
              <b>{selectedLabel}</b>
            </div>
            <label className="certificateEditorField">Posisi horizontal (X %)
              <input type="number" min="2" max="98" step="0.5" value={layout[selected].x} onChange={(event) => setCoordinate('x', event.target.value)} disabled={loading || saving} />
            </label>
            <label className="certificateEditorField">Posisi vertikal (Y %)
              <input type="number" min="2" max="98" step="0.5" value={layout[selected].y} onChange={(event) => setCoordinate('y', event.target.value)} disabled={loading || saving} />
            </label>
            <div className="certificateEditorNudge" aria-label="Atur posisi halus">
              <span>Geser halus</span>
              <div>
                <button type="button" onClick={() => nudge(0, -1)} disabled={loading || saving}>Atas</button>
                <button type="button" onClick={() => nudge(-1, 0)} disabled={loading || saving}>Kiri</button>
                <button type="button" onClick={() => nudge(1, 0)} disabled={loading || saving}>Kanan</button>
                <button type="button" onClick={() => nudge(0, 1)} disabled={loading || saving}>Bawah</button>
              </div>
            </div>
            <div className="certificateEditorElementList">
              <span>Semua elemen</span>
              {CERTIFICATE_ELEMENTS.map((element) => (
                <button key={element.id} type="button" className={selected === element.id ? 'active' : ''} onClick={() => setSelected(element.id)}>
                  {element.label}
                  <small>{layout[element.id].x.toFixed(1)}%, {layout[element.id].y.toFixed(1)}%</small>
                </button>
              ))}
            </div>
            <div className="certificateEditorActions">
              <button type="button" onClick={reset} disabled={loading || saving}>Reset posisi</button>
              <button type="button" className="primary" onClick={() => void save()} disabled={loading || saving}>{saving ? 'Menyimpan…' : 'Simpan sebagai default'}</button>
            </div>
          </aside>
        </div>
      </section>

      <style>{`
        .certificateEditorBackdrop{position:fixed;inset:0;z-index:1400;background:rgba(7,20,34,.68);display:grid;place-items:center;padding:14px}
        .certificateEditorDialog{width:min(1460px,100%);max-height:96vh;overflow:auto;border:1px solid var(--border,rgba(100,125,150,.25));border-radius:18px;background:var(--surface,#f4f8fc);color:var(--text,#0b1f33);box-shadow:0 24px 70px rgba(0,0,0,.28)}
        .certificateEditorHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border,rgba(100,125,150,.2));background:var(--panel,rgba(255,255,255,.75))}
        .certificateEditorEyebrow{font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--muted,#58718a)}
        .certificateEditorHeader h2{margin:4px 0;font-size:20px;letter-spacing:-.03em}
        .certificateEditorHeader p{margin:0;color:var(--muted,#58718a);font-size:12px;line-height:1.5}
        .certificateEditorClose{width:40px;height:40px;border:1px solid var(--border,rgba(100,125,150,.24));border-radius:10px;background:transparent;color:inherit;font-size:24px;cursor:pointer}
        .certificateEditorMessage{margin:12px 18px 0;padding:10px 12px;border-radius:9px;background:rgba(22,80,122,.08);font-size:12px}
        .certificateEditorMessage.error{background:rgba(185,28,28,.08);color:#991b1b}
        .certificateEditorBody{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px;padding:16px;align-items:start}
        .certificateEditorStagePanel{min-width:0}
        .certificateEditorStageToolbar{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;color:var(--muted,#58718a);font-size:11px;font-weight:750}
        .certificateEditorStageViewport{overflow:auto;padding:4px}
        .certificateEditorStage{position:relative;width:100%;aspect-ratio:842/595;min-width:650px;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#fff 0%,#eff7fd 65%,#e5f1fa 100%);border:1px solid #b4cddd;box-shadow:0 8px 22px rgba(15,42,68,.10);touch-action:none}
        .certificateEditorBorder{position:absolute;inset:1.2%;border:2px solid #0f2a44;pointer-events:none}
        .certificateEditorBorder:after{content:"";position:absolute;inset:7px;border:1px solid #71b4db}
        .certificateEditorCorner{position:absolute;width:15%;height:14%;background:linear-gradient(135deg,#0f2a44 0%,#16507a 68%,#38a9d4 68%,#80cde9 100%);opacity:.95;pointer-events:none}
        .certificateEditorCorner.topLeft{top:0;left:0;clip-path:polygon(0 0,100% 0,0 100%)}
        .certificateEditorCorner.bottomRight{right:0;bottom:0;clip-path:polygon(100% 0,100% 100%,0 100%)}
        .certificateEditorElement{position:absolute;z-index:2;transform:translate(-50%,-50%);max-width:45%;padding:4px 7px;border:1px dashed transparent;border-radius:5px;background:rgba(255,255,255,.40);color:#0b1f33;font-size:clamp(8px,.72vw,12px);line-height:1.2;white-space:nowrap;text-align:center;cursor:grab;touch-action:none;user-select:none}
        .certificateEditorElement.selected{border:1px solid #1682bd;background:rgba(222,244,255,.94);box-shadow:0 0 0 3px rgba(22,130,189,.14);z-index:4}
        .certificateEditorElement.logo{width:70px;height:70px;white-space:normal;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.72);border:1px dashed #6b9fbd;font-size:9px}
        .certificateEditorLogoMark{display:grid;place-items:center;width:38px;height:38px;border:2px solid #16507a;border-radius:50%;font-weight:850;color:#16507a}
        .certificateEditorElement.signature{display:grid;gap:5px;width:160px;white-space:normal;font-size:10px;background:transparent}
        .certificateEditorSignLine{display:block;width:100%;height:1px;border-top:1px solid #2e4a66}
        .certificateEditorElement.qr{width:54px;height:54px;display:grid;place-items:center;border:1px dashed #16507a;background:rgba(255,255,255,.7);font-size:10px;font-weight:850}
        .certificateEditorQrMark{border:3px solid #16507a;padding:5px}
        .certificateEditorFooterMark{display:inline-flex;align-items:center;gap:6px;color:#16507a;font-size:9px;font-weight:850}
        .certificateEditorFooterMark img{height:25px;width:auto;max-width:70px;object-fit:contain}
        .certificateEditorHint{margin:9px 0 0;color:var(--muted,#58718a);font-size:11px;line-height:1.5}
        .certificateEditorControls{display:grid;gap:12px;min-width:0}
        .certificateEditorControlHeading{display:grid;gap:4px;padding:11px 12px;border:1px solid var(--border,rgba(100,125,150,.2));border-radius:10px;background:var(--panel,rgba(255,255,255,.65))}
        .certificateEditorControlHeading span,.certificateEditorNudge>span,.certificateEditorElementList>span{font-size:11px;color:var(--muted,#58718a);font-weight:750}
        .certificateEditorControlHeading b{font-size:13px}
        .certificateEditorField{display:grid;gap:5px;font-size:11px;font-weight:750;color:var(--muted,#58718a)}
        .certificateEditorField input{width:100%;box-sizing:border-box;min-height:38px;padding:8px 10px;border:1px solid var(--border,rgba(100,125,150,.3));border-radius:8px;background:var(--panel,#fff);color:var(--text,#0b1f33);font:inherit;font-size:13px}
        .certificateEditorNudge{display:grid;gap:7px}
        .certificateEditorNudge>div{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
        .certificateEditorNudge button,.certificateEditorActions button{min-height:38px;padding:7px;border:1px solid var(--border,rgba(100,125,150,.25));border-radius:8px;background:var(--panel,#fff);color:var(--text,#0b1f33);font:inherit;font-size:11px;font-weight:750;cursor:pointer}
        .certificateEditorElementList{display:grid;gap:4px;max-height:245px;overflow:auto}
        .certificateEditorElementList>span{margin-bottom:3px}
        .certificateEditorElementList button{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 8px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text,#0b1f33);text-align:left;font:inherit;font-size:11px;cursor:pointer}
        .certificateEditorElementList button.active{border-color:rgba(22,80,122,.25);background:rgba(22,80,122,.08)}
        .certificateEditorElementList small{font-size:10px;color:var(--muted,#58718a);white-space:nowrap}
        .certificateEditorActions{display:grid;grid-template-columns:1fr 1.4fr;gap:7px}
        .certificateEditorActions button.primary{background:#0f2a44;border-color:#0f2a44;color:#fff}
        .certificateEditorActions button:disabled,.certificateEditorNudge button:disabled{opacity:.5;cursor:not-allowed}
        @media(max-width:900px){.certificateEditorBody{grid-template-columns:1fr}.certificateEditorControls{grid-template-columns:repeat(2,minmax(0,1fr))}.certificateEditorElementList{grid-column:1/-1;max-height:180px}.certificateEditorActions{grid-column:1/-1}}
        @media(max-width:560px){.certificateEditorBackdrop{padding:5px}.certificateEditorDialog{max-height:99vh;border-radius:12px}.certificateEditorHeader{padding:13px}.certificateEditorBody{padding:10px}.certificateEditorControls{grid-template-columns:1fr}.certificateEditorStage{min-width:620px}}
      `}</style>
    </div>
  )
}
