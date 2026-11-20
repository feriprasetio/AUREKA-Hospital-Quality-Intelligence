'use client'

import PatientIndexTab from '@/components/patient-registry/PatientIndexTab'
import PatientRegistryIntelligence from '@/components/PatientRegistryIntelligence'
import PatientMedicalRecordsAnalytics from '@/components/patient-registry/PatientMedicalRecordsAnalytics'

type Room = { id: number; name: string }
type PatientRegistryTab = 'overview' | 'directory' | 'analysis'

type Props = {
  rooms: Room[]
  initialRoomId: number | null
  isAdmin: boolean
  canViewAllRooms: boolean
  lockRoomScope?: boolean
  registryTab?: PatientRegistryTab
  onRegistryTabChange?: (tab: PatientRegistryTab) => void
  onAskNara?: (prompt: string, pageContext: string) => void
}

/**
 * Register Pasien follows the approved information architecture:
 * Direktori Pasien opens its Visual Intelligence landing, then the user opens
 * the directory; Pola Perawatan is a separate module destination. The former
 * Riwayat Episode screen is intentionally not exposed here.
 */
export default function PatientRegistryWorkspace({
  rooms,
  initialRoomId,
  isAdmin,
  canViewAllRooms,
  lockRoomScope = false,
  registryTab = 'overview',
  onRegistryTabChange,
}: Props) {
  const openDirectory = () => onRegistryTabChange?.('directory')

  return (
    <section className="patientRegistry" aria-label="Register Pasien">
      {registryTab === 'directory' ? (
        <PatientIndexTab isAdmin={isAdmin} rooms={rooms} />
      ) : registryTab === 'analysis' ? (
        <PatientMedicalRecordsAnalytics
          rooms={rooms}
          initialRoomId={initialRoomId}
          canViewAllRooms={canViewAllRooms}
          lockRoomScope={lockRoomScope}
        />
      ) : (
        <PatientRegistryIntelligence onOpenDirectory={openDirectory} />
      )}
    </section>
  )
}
