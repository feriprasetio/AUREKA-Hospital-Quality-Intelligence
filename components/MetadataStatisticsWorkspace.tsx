'use client'

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import QualitySettings from '@/components/QualitySettings'
import StatisticsWorkspace from '@/components/StatisticsWorkspace'
import StaffDirectoryWorkspace from '@/components/StaffDirectoryWorkspace'

type Room = { id: number; name: string }

type Container = 'metadata' | 'staff' | 'statistics'

export default function MetadataStatisticsWorkspace({
  supabase,
  rooms,
  isSuperAdmin,
  initialContainer,
  showTabs = true,
}: {
  supabase: SupabaseClient
  rooms: Room[]
  isSuperAdmin: boolean
  initialContainer?: Container
  showTabs?: boolean
}) {
  const [active, setActive] = useState<Container>(initialContainer || (isSuperAdmin ? 'metadata' : 'statistics'))
  useEffect(() => { if (initialContainer && (initialContainer !== 'metadata' || isSuperAdmin)) setActive(initialContainer) }, [initialContainer, isSuperAdmin])

  useEffect(() => {
    if (!isSuperAdmin && active === 'metadata') setActive('statistics')
  }, [isSuperAdmin, active])

  return (
    <section className="msw">
      <style>{`
        .msw{display:grid;gap:14px}
        .mswHeader{padding:20px 22px;display:grid;gap:14px}
        .mswEyebrow{font-size:10px;letter-spacing:.17em;text-transform:uppercase;font-weight:900;color:var(--accent,#0f7656)}
        .mswTitle{margin:5px 0 0;font-size:clamp(23px,3vw,31px);letter-spacing:-.045em;color:var(--text,#21372c)}
        .mswDescription{margin:6px 0 0;max-width:800px;color:var(--muted,#64756b);font-size:12px;line-height:1.6}
        .mswTabs{display:flex;gap:8px;flex-wrap:wrap}
        .mswTab{display:inline-flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.74);background:rgba(255,255,255,.3);color:var(--muted,#64756b);border-radius:14px;padding:11px 15px;font-size:12px;font-weight:850;cursor:pointer;transition:all .18s ease}
        .mswTab:hover{background:rgba(255,255,255,.66);color:var(--text,#21372c)}
        .mswTab[aria-selected="true"]{background:linear-gradient(135deg,var(--accent,#0f7656),var(--accent2,#084f3a));border-color:transparent;color:#fff;box-shadow:0 7px 18px rgba(15,118,86,.16)}
        .mswTabIcon{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:9px;background:rgba(255,255,255,.4);font-size:14px}
        .mswTab[aria-selected="true"] .mswTabIcon{background:rgba(255,255,255,.18)}
        .mswContent{min-width:0}
        .mswAccessNote{display:flex;align-items:flex-start;gap:10px;margin:0 0 12px;padding:11px 13px;border:1px solid rgba(15,118,86,.13);border-radius:15px;background:rgba(255,255,255,.34);color:var(--muted,#64756b);font-size:11px;line-height:1.55}
        .mswAccessNote strong{color:var(--text,#21372c)}
        @media(max-width:640px){.mswHeader{padding:16px}.mswTab{flex:1;justify-content:center;padding:10px}.mswDescription{font-size:11px}}
      `}</style>

      <header className="glassPanel mswHeader">
        <div>
          <div className="mswEyebrow">Governance &amp; Analytics</div>
          <h3 className="mswTitle">Metadata dan Statistik</h3>
          <p className="mswDescription">
            Metadata menjadi sumber konfigurasi program kerja dan kamus indikator; Statistik digunakan untuk membaca,
            membandingkan, dan mengekstrak data yang sudah tercatat.
          </p>
        </div>
        {showTabs && <div className="mswTabs" role="tablist" aria-label="Kontainer Metadata dan Statistik">
                  {isSuperAdmin && (
                    <>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active === 'metadata'}
                        className="mswTab"
                        onClick={() => setActive('metadata')}
                      >
                        <span className="mswTabIcon" aria-hidden="true">▤</span>
                        <span>Kamus Indikator</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active === 'staff'}
                        className="mswTab"
                        onClick={() => setActive('staff')}
                      >
                        <span className="mswTabIcon" aria-hidden="true">♙</span>
                        <span>Tenaga Kerja</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active === 'statistics'}
                    className="mswTab"
                    onClick={() => setActive('statistics')}
                  >
                    <span className="mswTabIcon" aria-hidden="true">▥</span>
                    <span>Statistik</span>
                  </button>
                </div>}

      </header>

      {active === 'metadata' && isSuperAdmin ? (
        <div className="mswContent" role="tabpanel" aria-label="Kamus Indikator">
          <div className="mswAccessNote">
            <span aria-hidden="true">🔐</span>
            <span><strong>Kontrol metadata — Superadmin.</strong> Pengelolaan lintas unit tersedia di sini. Indikator yang tidak digunakan sebaiknya dinonaktifkan/dipensiunkan, bukan dihapus permanen, agar jejak historis tetap terjaga.</span>
          </div>
          <QualitySettings rooms={rooms} />
        </div>
      ) : active === 'staff' && isSuperAdmin ? (
        <div className="mswContent" role="tabpanel" aria-label="Direktori Tenaga Kerja">
          <div className="mswAccessNote">
            <span aria-hidden="true">🔐</span>
            <span><strong>Master tenaga kerja — Superadmin.</strong> Data ini menjadi identitas induk lintas modul. Rekam dengan sumber atau ejaan yang belum pasti tetap ditahan. Kesamaan nama saja tidak dianggap duplikasi; kode AUREKA, gelar, profesi, dan jabatan dipertahankan untuk membedakan orang.</span>
          </div>
          <StaffDirectoryWorkspace />
        </div>
      ) : (
        <div className="mswContent" role="tabpanel" aria-label="Statistik">
          <StatisticsWorkspace supabase={supabase} rooms={rooms} />
        </div>
      )}
    </section>
  )
}
