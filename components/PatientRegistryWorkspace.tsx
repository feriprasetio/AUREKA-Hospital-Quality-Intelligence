'use client'

import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import PatientIndexTab from '@/components/patient-registry/PatientIndexTab'
import PatientRegistryIntelligence from '@/components/PatientRegistryIntelligence'
import PatientMedicalRecordsAnalytics from '@/components/patient-registry/PatientMedicalRecordsAnalytics'

type Room = { id: number; name: string }
type PatientRegistryTab = 'overview' | 'directory' | 'patterns' | 'analysis'

type Props = {
  rooms: Room[]
  initialRoomId: number | null
  isAdmin: boolean
  canViewAllRooms: boolean
  lockRoomScope?: boolean
  registryTab?: PatientRegistryTab
  dataFirst?: boolean
  patternTab?: 'icd' | 'los' | 'readmisi' | 'visite' | 'pemulangan'
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
  dataFirst = false,
  onRegistryTabChange,
  patternTab = 'icd',
}: Props) {
  const openDirectory = () => onRegistryTabChange?.('directory')

  return (
    <section className="patientRegistry" aria-label="Register Pasien">
      {registryTab === 'directory' ? (
        <>
          <WorkspaceModuleHeader title="Daftar Pasien" actions={
            <button type="button" className="prButton" onClick={() => onRegistryTabChange?.('overview')}>Kembali ke Direktori Pasien</button>
          } />
          <PatientIndexTab isAdmin={isAdmin} rooms={rooms} dataFirst={dataFirst} initialRoomId={initialRoomId} lockRoomScope={lockRoomScope} />
        </>
      ) : registryTab === 'patterns' || registryTab === 'analysis' ? (
        <PatientMedicalRecordsAnalytics
          rooms={rooms}
          view={registryTab === 'patterns' ? 'overview' : patternTab}
          onOpenPatterns={() => onRegistryTabChange?.('analysis')}
          onBack={() => onRegistryTabChange?.('patterns')}
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
