'use client'

import { useState } from 'react'
import StaffDirectoryWorkspace from '@/components/StaffDirectoryWorkspace'
import StaffTeamWorkspace from '@/components/StaffTeamWorkspace'
import OppeAuditWorkspace from '@/components/OppeAuditWorkspace'

type WorkforceArea = 'directory' | 'team' | 'oppe'
type LocalRoom = { id: number; name: string }

export default function ClinicalWorkforceWorkspace({
  rooms, initialRoomId, role, isSuperAdmin,
}: {
  rooms: LocalRoom[]
  initialRoomId: number | null
  role: string | null
  isSuperAdmin: boolean
}) {
  const canManageAllRooms = isSuperAdmin || role === 'PMKP'
  const canOpenTeam = ['ADMIN', 'PMKP', 'PIC', 'VALIDATOR'].includes(role || '')
  const canOpenOppe = ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC', 'VALIDATOR'].includes(role || '')
  const [area, setArea] = useState<WorkforceArea>(isSuperAdmin ? 'directory' : canOpenTeam ? 'team' : 'oppe')
  const tabs: { id: WorkforceArea; title: string; description: string }[] = [
    ...(isSuperAdmin ? [{ id: 'directory' as const, title: 'Direktori Tenaga', description: 'Master identitas kanonik lintas modul.' }] : []),
    ...(canOpenTeam ? [{ id: 'team' as const, title: 'Tim & Penugasan', description: 'Pemetaan staf yang terkunci ke unit kerja.' }] : []),
    ...(canOpenOppe ? [{ id: 'oppe' as const, title: 'OPPE / FPPE', description: 'Evaluasi praktik profesional dan tindak lanjut individu.' }] : []),
  ]
  const activeArea = tabs.some((tab) => tab.id === area) ? area : (tabs[0]?.id ?? 'oppe')

  return (
    <section className="cwWorkspace" aria-labelledby="cw-title">
      <header className="cwHeader">
        <div className="cwEyebrow">TENAGA KLINIS · MASTER IDENTITAS & EVALUASI</div>
        <h3 className="cwTitle" id="cw-title">Tenaga Klinis</h3>
        <p className="cwDescription">
          Identitas tenaga, penugasan unit, dan penilaian OPPE/FPPE berada dalam satu ruang kerja.
          Kode identitas kanonik dipertahankan agar riwayat penilaian dan audit tetap dapat ditelusuri.
        </p>
      </header>

      {tabs.length > 0 ? (
        <>
          <div className="cwTabs" role="tablist" aria-label="Area kerja Tenaga Klinis">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" className="cwTab" role="tab"
                aria-selected={activeArea === tab.id} onClick={() => setArea(tab.id)}>
                <span aria-hidden="true">{tab.id === 'directory' ? '▤' : tab.id === 'team' ? '♙' : '✓'}</span>
                <span>{tab.title}</span>
              </button>
            ))}
          </div>
          {activeArea === 'directory' && isSuperAdmin && (
            <div className="cwPanel" role="tabpanel" aria-label="Direktori tenaga">
              <p className="cwHint">Perubahan metadata memengaruhi pemetaan tenaga di modul terkait. Gunakan status verifikasi untuk menahan identitas yang belum pasti; jangan menyatukan orang hanya karena nama serupa.</p>
              <StaffDirectoryWorkspace />
            </div>
          )}
          {activeArea === 'team' && canOpenTeam && (
            <div className="cwPanel" role="tabpanel" aria-label="Tim dan penugasan">
              <StaffTeamWorkspace initialRoomId={initialRoomId} rooms={rooms} isSuperAdmin={isSuperAdmin} canManageAllRooms={canManageAllRooms} />
            </div>
          )}
          {activeArea === 'oppe' && canOpenOppe && (
            <div className="cwPanel" role="tabpanel" aria-label="OPPE dan FPPE">
              <OppeAuditWorkspace initialRoomId={initialRoomId} rooms={rooms} isSuperAdmin={isSuperAdmin} canManage={canManageAllRooms} />
            </div>
          )}
        </>
      ) : (
        <p className="cwHint" role="status">Belum ada area Tenaga Klinis yang dapat diakses oleh role ini.</p>
      )}
    </section>
  )
}
