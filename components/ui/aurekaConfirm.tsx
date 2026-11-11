'use client'

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AurekaModal from '@/components/ui/AurekaModal'

/**
 * Pengganti window.confirm() bawaan browser: pop-up konfirmasi bergaya AUREKA.
 * Pemakaian: if (!(await aurekaConfirm('Hapus data ini?', { danger: true }))) return
 */
export function aurekaConfirm(
  message: string,
  opts: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = (value: boolean) => {
      resolve(value)
      window.setTimeout(() => { root.unmount(); host.remove() }, 0)
    }
    function ConfirmDialog() {
      const [open, setOpen] = useState(true)
      const done = (v: boolean) => { setOpen(false); finish(v) }
      return (
        <AurekaModal
          open={open}
          size="md"
          title={opts.title || (opts.danger ? 'Konfirmasi tindakan' : 'Konfirmasi')}
          onClose={() => done(false)}
          footer={<>
            <button type="button" className="akBtn akBtnGhost" onClick={() => done(false)}>{opts.cancelLabel || 'Batal'}</button>
            <button type="button" className={opts.danger ? 'akBtn akBtnDanger' : 'akBtn akBtnPrimary'} autoFocus onClick={() => done(true)}>{opts.confirmLabel || (opts.danger ? 'Ya, lanjutkan' : 'Ya')}</button>
          </>}
        >
          <p className="akConfirmText">{message}</p>
        </AurekaModal>
      )
    }
    root.render(<ConfirmDialog />)
  })
}
