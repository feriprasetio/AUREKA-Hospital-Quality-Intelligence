'use client'

import { createRoot } from 'react-dom/client'
import AurekaModal from '@/components/ui/AurekaModal'

let confirmationOpen = false

/**
 * Pengganti window.confirm() bawaan browser: pop-up konfirmasi bergaya AUREKA.
 * Pemakaian: if (!(await aurekaConfirm('Hapus data ini?', { danger: true }))) return
 */
export function aurekaConfirm(
  message: string,
  opts: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  if (typeof document === 'undefined' || confirmationOpen) return Promise.resolve(false)
  confirmationOpen = true
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      window.setTimeout(() => {
        root.unmount()
        host.remove()
        confirmationOpen = false
        resolve(value)
      }, 0)
    }
    root.render(
      <AurekaModal
        open
        role="alertdialog"
        size="md"
        title={opts.title || (opts.danger ? 'Konfirmasi tindakan' : 'Konfirmasi')}
        subtitle={message}
        onClose={() => finish(false)}
        footer={<>
          <button type="button" className="akBtn akBtnGhost" data-dialog-autofocus onClick={() => finish(false)}>{opts.cancelLabel || 'Batal'}</button>
          <button type="button" className={opts.danger ? 'akBtn akBtnDanger' : 'akBtn akBtnPrimary'} onClick={() => finish(true)}>{opts.confirmLabel || (opts.danger ? 'Ya, lanjutkan' : 'Ya')}</button>
        </>}
      >
        {null}
      </AurekaModal>,
    )
  })
}
