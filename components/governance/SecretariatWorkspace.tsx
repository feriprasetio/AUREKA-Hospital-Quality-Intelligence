'use client'

import AsyncStatePanel from '@/components/AsyncStatePanel'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import type { SecretariatSection } from '@/lib/aureka/module-registry'

type SecretariatArea = {
  title: string
  description: string
}

const AREAS: Record<SecretariatSection, SecretariatArea> = {
  register: {
    title: 'Register Kegiatan',
    description: 'Halaman register untuk menyimpan daftar kegiatan dan nomor surat. Ketika nama kegiatan dipilih, detail UMANG (Undangan, Materi, Absensi Digital, Notulensi, dan Gambar) ditampilkan sebagai bagian dari kegiatan yang sama melalui satu Meeting ID.',
  },
  invitations: {
    title: 'Kirim Undangan',
    description: 'Ruang kerja untuk menyiapkan undangan, agenda, jadwal, tempat, dan peserta, kemudian mengirimkan undangan langsung kepada user PIC unit. Setiap undangan terhubung ke kegiatan dan Meeting ID yang sama.',
  },
}
export default function SecretariatWorkspace({ section }: { section: SecretariatSection }) {
  const area = AREAS[section]

  return (
    <section className="govWorkspace" aria-label="Sekretariat">
      <WorkspaceModuleHeader
        eyebrow="Governance & Organization"
        title="Sekretariat"
        description="Administrasi rapat terintegrasi. Undangan, materi, absensi, notulensi, dokumentasi, rekomendasi, dan tindak lanjut dirancang terhubung melalui satu Meeting ID."
      />

      <section className="rmPanel govWorkspace" aria-labelledby="secretariat-area-title">
        <div className="rmSectionHead">
          <div>
            <span className="rmEyebrow">Sekretariat</span>
            <h3 id="secretariat-area-title">{area.title}</h3>
            <p>{area.description}</p>
          </div>
        </div>

        <AsyncStatePanel
          state="empty"
          title="Pencatatan Sekretariat belum diaktifkan"
          description="Struktur menu dan navigasi sudah tersedia, tetapi penyimpanan undangan, berkas materi, absensi, notulensi, dan foto belum terhubung ke backend. Tidak ada data contoh atau catatan rapat fiktif yang ditampilkan. Aktivasi pencatatan memerlukan desain tabel, penyimpanan berkas, hak akses, serta audit trail khusus."
        />

        <div className="workspaceClinicalDisclaimer" role="note">
          <strong>Prinsip integrasi data.</strong> Satu kegiatan rapat menggunakan satu Meeting ID untuk menghubungkan undangan, materi, absensi, notulensi, dokumentasi, rekomendasi, dan tindak lanjut. Dokumen terkendali seperti SK, SPO, pedoman, kebijakan, dan formulir tetap berada pada kelompok Dokumen Terkendali, bukan di Sekretariat.
        </div>
      </section>
    </section>
  )
}
