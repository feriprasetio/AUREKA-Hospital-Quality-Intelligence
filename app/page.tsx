const modules = [
  ['0', 'Overview'],
  ['1', 'Indikator Mutu'],
  ['2', 'Keselamatan Pasien'],
  ['3', 'Manajemen Risiko'],
  ['4', 'Metadata dan Statistik'],
  ['5', 'Pengaturan'],
]

export default function HomePage() {
  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">AUREKA · HOSPITAL QUALITY INTELLIGENCE</div>
        <h1>Clean Rebuild</h1>
        <p className="lead">
          Fondasi aplikasi bersih. Business logic, workflow, data model, dan integrasi akan dibangun bertahap setelah setiap modul dibedah.
        </p>
        <div className="moduleGrid">
          {modules.map(([code, name]) => (
            <div className="moduleCard" key={code}>
              <span>{code}</span>
              <strong>{name}</strong>
              <small>Scaffold · belum ada business logic</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
