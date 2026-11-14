'use client'

/** Kerangka berkilau saat modul dimuat: bentuknya meniru isi (judul, 4 kartu angka, panel). */
export default function WorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div className="wsSkeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="srOnly">Memuat {label}…</span>
      <div className="wsSkHero" aria-hidden="true"><i className="w40" /><i className="w70 tall" /><i className="w30" /></div>
      <div className="wsSkGrid" aria-hidden="true">{[0, 1, 2, 3].map((k) => <div key={k} className="wsSkCard"><i className="w50" /><i className="w30 tall" /></div>)}</div>
      <div className="wsSkPanel" aria-hidden="true">{[0, 1, 2, 3, 4].map((k) => <i key={k} className={k % 2 ? 'w80' : 'w100'} />)}</div>
    </div>
  )
}
