'use client'

import type { ComponentProps } from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
import QualityWorkbookImportSidebar from '@/components/quality/QualityWorkbookImportSidebar'
import QualityWorkbookImportPanel from '@/components/QualityWorkbookImportPanel'

/**
 * Hemodialisa and Radiologi use explicit physical-column mapping because their
 * source formats have not been verified as a fixed clinical episode logbook.
 * Reuses the existing staged, reviewable importer (no new clinical coercion).
 */
type Props = {
  open: boolean
  roomId: 8 | 10
  roomName: string
  year: number
  role: 'ADMIN' | 'PMKP'
  activeProfiles: ComponentProps<typeof QualityWorkbookImportPanel>['activeProfiles']
  onClose: () => void
  onImported: () => void
}

const PRESENTATION = `
.qimuMappedLayout .qimuMappedMain{display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0;max-width:100%;overflow-wrap:anywhere}
.qimuMappedLayout .qimuMappedMain>section{min-width:0;max-width:100%}
.qimuMappedLayout :is(.qwiPreview,.qwiPreviewScroll){min-width:0;max-width:100%}
@media(max-width:940px){.qimuMappedLayout .qimuMappedMain{grid-column:1}}
`

export default function UnitMappedWorkbookDialog({
  open, roomId, roomName, year, role, activeProfiles, onClose, onImported,
}: Props) {
  const label = roomId === 8 ? 'Hemodialisa' : 'Radiologi'
  return <AurekaModal
    open={open}
    title={'Unggah workbook ' + label}
    subtitle={roomName + ' · ' + year + ' · pemetaan terarah'}
    size="xl"
    onClose={onClose}
  >
    <style>{PRESENTATION}</style>
    <div className="episodeWorkbook qiuBody qimuMappedLayout">
      <QualityWorkbookImportSidebar />
      <div className="qimuMappedMain">
        <QualityWorkbookImportPanel
          key={roomId + ':' + year}
          roomId={roomId}
          roomName={roomName}
          year={year}
          importerKey="unit-logbook"
          role={role}
          activeProfiles={activeProfiles}
          dataOnly
          onImported={onImported}
        />
      </div>
    </div>
  </AurekaModal>
}
