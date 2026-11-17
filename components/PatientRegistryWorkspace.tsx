'use client'

import { useEffect, useState } from 'react'
import PatientIndexTab from '@/components/patient-registry/PatientIndexTab'
import PatientRecordAnalytics from '@/components/patient-registry/PatientRecordAnalytics'

type Room = { id: number; name: string }
type PatientView = 'directory' | 'analytics'

export default function PatientRegistryWorkspace({
  rooms,
  initialRoomId,
  isAdmin,
  canViewAllRooms,
  lockRoomScope = false,
  registryTab,
  onRegistryTabChange,
}: {
  rooms: Room[]
  initialRoomId: number | null
  isAdmin: boolean
  canViewAllRooms: boolean
  lockRoomScope?: boolean
  /** Patient module is read-only: the source logbook and episode input live in Indikator Mutu. */
  registryTab?: PatientView
  onRegistryTabChange?: (tab: PatientView) => void
}) {
  const [tab, setTab] = useState<PatientView>(registryTab ?? 'directory')
  useEffect(() => setTab(registryTab ?? 'directory'), [registryTab])

  const visibleRooms = lockRoomScope && initialRoomId != null
    ? rooms.filter((room) => Number(room.id) === Number(initialRoomId))
    : rooms

  return (
    <section className="patientRegistryWorkspace">
      <style>{`
        .patientRegistryWorkspace{display:grid;gap:16px;min-width:0;color:var(--ink,#18372b)}
        .prDomainIntro{margin:0;color:var(--muted,#718078);font-size:12px;line-height:1.55}
      `}</style>
      {tab === 'directory'
        ? <PatientIndexTab isAdmin={isAdmin} rooms={visibleRooms} />
        : <PatientRecordAnalytics
            rooms={visibleRooms}
            initialRoomId={initialRoomId}
            canViewAllRooms={canViewAllRooms}
            lockRoomScope={lockRoomScope}
          />}
    </section>
  )
}
