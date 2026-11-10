'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import AsyncStatePanel from '@/components/AsyncStatePanel'

const QualitySettings = dynamic(() => import('@/components/QualitySettings'), {
  ssr: false,
  loading: () => <AsyncStatePanel state="loading" title="Memuat profil indikator" compact />,
})
const StaffDirectoryWorkspace = dynamic(() => import('@/components/StaffDirectoryWorkspace'), {
  ssr: false,
  loading: () => <AsyncStatePanel state="loading" title="Memuat daftar tenaga kerja" compact />,
})
const StaffTeamWorkspace = dynamic(() => import('@/components/StaffTeamWorkspace'), {
  ssr: false,
  loading: () => <AsyncStatePanel state="loading" title="Memuat tim dan penugasan" compact />,
})

type Room = { id: number; name: string }
type MetadataTab = 'programs' | 'profiles' | 'directory'
type DirectoryTab = 'directory' | 'team'

export default function MetadataStatisticsWorkspace({
  rooms,
  isSuperAdmin,
  role,
  initialRoomId,
  initialContainer,
  initialDirectoryTab = 'directory',
  showTabs = true,
}: {
  rooms: Room[]
  isSuperAdmin: boolean
  role: string | null
  initialRoomId: number | null
  initialContainer?: MetadataTab
  initialDirectoryTab?: DirectoryTab
  showTabs?: boolean
}) {
  const canOpenTeam = ['ADMIN', 'PMKP', 'PIC', 'VALIDATOR'].includes(role || '')
  const canManageAllRooms = isSuperAdmin || role === 'PMKP'
  const canOpenDirectory = isSuperAdmin

  const [active, setActive] = useState<MetadataTab>(initialContainer || (isSuperAdmin ? 'programs' : 'directory'))
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>(
    initialDirectoryTab || (isSuperAdmin ? 'directory' : 'team'),
  )

  const availableTabs: { id: MetadataTab; label: string; icon: string }[] = [
    ...(isSuperAdmin ? [
      { id: 'programs' as const, label: 'Program Kerja', icon: '▤' },
      { id: 'profiles' as const, label: 'Profil Indikator', icon: '◫' },
    ] : []),
    ...((canOpenDirectory || canOpenTeam) ? [
      { id: 'directory' as const, label: 'Direktori Induk SDM', icon: '♙' },
    ] : []),
  ]

  useEffect(() => {
    const allowed = availableTabs.some((item) => item.id === initialContainer)
    if (initialContainer && allowed) setActive(initialContainer)
    else if (!isSuperAdmin) setActive('directory')
  }, [initialContainer, isSuperAdmin, canOpenDirectory, canOpenTeam])

  useEffect(() => {
    setDirectoryTab(initialDirectoryTab || (isSuperAdmin ? 'directory' : 'team'))
  }, [initialDirectoryTab, isSuperAdmin])

  const activeTab = availableTabs.some((item) => item.id === active) ? active : (availableTabs[0]?.id ?? 'directory')
  const directoryTabs: { id: DirectoryTab; label: string }[] = [
    ...(canOpenDirectory ? [{ id: 'directory' as const, label: 'Daftar Tenaga Kerja' }] : []),
    ...(canOpenTeam ? [{ id: 'team' as const, label: 'Tim & Penugasan' }] : []),
  ]
  const activeDirectoryTab = directoryTabs.some((item) => item.id === directoryTab)
    ? directoryTab
    : (directoryTabs[0]?.id ?? 'team')

  return (
    <section className="msw" aria-label="Metadata">
      <style>{`
        .msw{display:grid;gap:14px;min-width:0}
        .mswHeader{padding:16px 18px;display:grid;gap:14px;background:#fff;border:1px solid var(--line,#e5ebe7);border-radius:14px}
        .mswEyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:var(--accent,#0f7656)}
        .mswTitle{margin:4px 0 0;font-size:clamp(20px,2.5vw,26px);letter-spacing:-.035em;color:var(--text,#21372c)}
        .mswDescription{margin:5px 0 0;max-width:850px;color:var(--muted,#64756b);font-size:12px;line-height:1.6}
        .mswTabs,.mswDirectoryTabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #e8eeea;padding-bottom:8px}
        .mswTab,.mswDirectoryTab{display:inline-flex;align-items:center;gap:8px;border:1px solid #e4ebe6;background:#fff;color:#53665b;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}
        .mswTab:hover,.mswDirectoryTab:hover{background:#f6f9f7;border-color:#cbdcd1;color:#20392b}
        .mswTab[aria-selected="true"],.mswDirectoryTab[aria-selected="true"]{background:#102b42;border-color:#102b42;color:#fff}
        .mswTabIcon{font-size:13px;opacity:.82}
        .mswContent{min-width:0}
        .mswAccessNote{display:flex;align-items:flex-start;gap:10px;margin:0 0 12px;padding:10px 12px;border:1px solid #e5eee8;border-radius:10px;background:#f8fbf9;color:var(--muted,#64756b);font-size:11px;line-height:1.55}
        .mswAccessNote strong{color:var(--text,#21372c)}
        .mswDirectoryPanel{display:grid;gap:12px;min-width:0}
        @media(max-width:640px){.mswHeader{padding:13px}.mswTab,.mswDirectoryTab{flex:1;justify-content:center;padding:9px 8px}.mswDescription{font-size:11px}}
      `}</style>

      {showTabs && (
        <header className="mswHeader">
          <div>
            <div className="mswEyebrow">Tata Kelola · Metadata Rumah Sakit</div>
            <h3 className="mswTitle">Metadata</h3>
            <p className="mswDescription">
              Satu ruang kendali untuk klasifikasi program kerja, definisi profil indikator, dan data induk sumber daya manusia.
            </p>
          </div>
          <div className="mswTabs" role="tablist" aria-label="Bagian Metadata">
            {availableTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeTab === item.id}
                className="mswTab"
                onClick={() => setActive(item.id)}
              >
                <span className="mswTabIcon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </header>
      )}

      {activeTab === 'programs' && isSuperAdmin && (
        <div className="mswContent" role="tabpanel" aria-label="Program Kerja">
          <QualitySettings rooms={rooms} initialTab="programs" showTabs={false} />
        </div>
      )}

      {activeTab === 'profiles' && isSuperAdmin && (
        <div className="mswContent" role="tabpanel" aria-label="Profil Indikator">
          <QualitySettings rooms={rooms} initialTab="profiles" showTabs={false} />
        </div>
      )}

      {activeTab === 'directory' && (canOpenDirectory || canOpenTeam) && (
        <div className="mswDirectoryPanel" role="tabpanel" aria-label="Direktori Induk SDM">
          <div className="mswAccessNote">
            <span><strong>Direktori Induk SDM.</strong> Daftar tenaga kerja merupakan master identitas kanonik. Tim & Penugasan mengelola keterikatan tenaga pada unit kerja tanpa membuat identitas pegawai baru.</span>
          </div>
          {directoryTabs.length > 1 && (
            <div className="mswDirectoryTabs" role="tablist" aria-label="Bagian Direktori Induk SDM">
              {directoryTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDirectoryTab === item.id}
                  className="mswDirectoryTab"
                  onClick={() => setDirectoryTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {activeDirectoryTab === 'directory' && canOpenDirectory && (
            <div className="mswContent" role="tabpanel" aria-label="Daftar Tenaga Kerja">
              <StaffDirectoryWorkspace />
            </div>
          )}
          {activeDirectoryTab === 'team' && canOpenTeam && (
            <div className="mswContent" role="tabpanel" aria-label="Tim dan Penugasan">
              <StaffTeamWorkspace
                initialRoomId={initialRoomId}
                rooms={rooms}
                isSuperAdmin={isSuperAdmin}
                canManageAllRooms={canManageAllRooms}
              />
            </div>
          )}
        </div>
      )}

      {availableTabs.length === 0 && (
        <AsyncStatePanel state="empty" title="Metadata tidak tersedia" description="Akun ini belum memiliki kewenangan untuk membuka fungsi Metadata." compact />
      )}
    </section>
  )
}
