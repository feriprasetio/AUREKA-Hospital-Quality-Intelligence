'use client'

import { useEffect, useState } from 'react'
import { isTrainingMode, setTrainingMode, TRAINING_EVENT } from '@/lib/aureka/training-mode'

/** Pita oranye yang selalu tampil selama mode latihan aktif. */
export default function TrainingBanner() {
  const [on, setOn] = useState(false)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    setOn(isTrainingMode())
    const onChange = () => setOn(isTrainingMode())
    let t = 0
    const onWrite = () => { setPulse(true); window.clearTimeout(t); t = window.setTimeout(() => setPulse(false), 2600) }
    window.addEventListener(TRAINING_EVENT, onChange)
    window.addEventListener('aureka-training-write', onWrite)
    window.addEventListener('storage', onChange)
    return () => { window.removeEventListener(TRAINING_EVENT, onChange); window.removeEventListener('aureka-training-write', onWrite); window.removeEventListener('storage', onChange); window.clearTimeout(t) }
  }, [])
  if (!on) return null
  return <div className={'akTraining' + (pulse ? ' pulse' : '')} role="status">
    <b>Mode latihan</b>
    {pulse && <span>Simulasi selesai</span>}
    <button type="button" onClick={() => { setTrainingMode(false); window.location.reload() }}>Selesai latihan</button>
  </div>
}
