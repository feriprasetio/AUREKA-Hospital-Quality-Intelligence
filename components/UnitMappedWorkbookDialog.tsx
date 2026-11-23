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
.qimuMappedLayout .qimuIntro{margin:0;padding:12px 14px;border:1px solid #dbe6ee;border-radius:11px;background:#f3f8fc;color:#29475d;font-size:12px;line-height:1.65}
.qimuMappedLayout .qimuIntro strong{display:block;margin-bottom:4px;font-size:13px}
.qimuMappedLayout :is(.qwiPreview,.qwiPreviewScroll){min-width:0;max-width:100%}
@media(max-width:940px){.qimuMappedLayout .qimuMappedMain{grid-column:1}}
`

export default function UnitMappedWorkbookDialog({
  open, roomId, roomName, year, role, activeProfiles, onClose, onImported,
}: Props) {
  const unitKey = roomId === 8 ? 'hemodialysis' : 'radiology'
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
      <QualityWorkbookImportSidebar unitKey={unitKey} year={year} unitName={roomName} />
      <div className="qimuMappedMain">
        <p className="qimuIntro" role="note">
          <strong>Periksa struktur workbook sebelum menyimpan</strong>
          Pilih worksheet, baris header, dan kolom respons sesuai file yang diunggah.
          Pemetaan ini hanya menyimpan data yang lulus validasi impor; respons yang
          membutuhkan penilaian klinis tetap harus ditinjau oleh petugas berwenang.
        </p>
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
