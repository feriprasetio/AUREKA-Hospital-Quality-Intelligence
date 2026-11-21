'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportClientError } from '@/lib/ui/report-client-error'

type Props = { moduleLabel: string; resetKey?: string; onHome: () => void; children: ReactNode }
type State = { error: Error | null }

/**
 * Pengaman per modul: bila satu modul gagal dirender, hanya area modul yang
 * menampilkan pesan dan tombol coba lagi; sidebar, header, dan modul lain tetap jalan.
 * Pindah bagian mereset galat dan mempertahankan state konten yang sehat.
 */
export default class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AUREKA] Modul gagal dimuat:', this.props.moduleLabel, error, info.componentStack)
    if (!/ChunkLoadError|Loading chunk|dynamically imported module/i.test(String(error?.name) + ' ' + String(error?.message))) reportClientError(this.props.moduleLabel || 'Modul', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(String(this.state.error?.name) + ' ' + String(this.state.error?.message))
    return (
      <section className="moduleErrorPanel" role="alert">
        <span className="moduleErrorIcon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5" /><path d="M12 17.2v.3" /></svg>
        </span>
        <h2>{this.props.moduleLabel || 'Bagian ini'} belum dapat ditampilkan</h2>
        <p>{chunk
          ? 'AUREKA baru saja diperbarui. Muat ulang halaman untuk memakai versi terbaru.'
          : 'Terjadi kendala saat memuat bagian ini. Menu lain tetap dapat dipakai. Data yang sudah tersimpan tidak terpengaruh.'}</p>
        <div className="moduleErrorActions">
          {chunk
            ? <button type="button" className="primary" onClick={() => window.location.reload()}>Muat ulang halaman</button>
            : <button type="button" className="primary" onClick={() => this.setState({ error: null })}>Coba lagi</button>}
          <button type="button" onClick={() => { this.setState({ error: null }); this.props.onHome() }}>Kembali ke Beranda</button>
        </div>
      </section>
    )
  }
}
