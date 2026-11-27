'use client'

import { useEffect, useState } from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
import { exitLegacyTrainingMode, isLegacyTrainingMode } from '@/lib/aureka/training-mode'

export default function TrainingBanner() {
  const [legacyMode, setLegacyMode] = useState(false)

  useEffect(() => {
    const refresh = () => setLegacyMode(isLegacyTrainingMode())
    refresh()
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  return <AurekaModal
    open={legacyMode}
    title="Mode latihan lama dihentikan"
    subtitle="AUREKA menghentikan akses data selama mode lama aktif. Jika Anda keluar dari mode ini, tindakan selanjutnya memakai lingkungan aktif."
    closeDisabled
    role="alertdialog"
    onClose={() => {}}
    footer={<button type="button" className="akBtn akBtnPrimary" data-dialog-autofocus onClick={() => {
      exitLegacyTrainingMode()
      window.location.reload()
    }}>Keluar dari mode latihan</button>}
  >{null}</AurekaModal>
}
