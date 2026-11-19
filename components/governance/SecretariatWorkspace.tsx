'use client'

import AsyncStatePanel from '@/components/AsyncStatePanel'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import type { SecretariatSection } from '@/lib/aureka/module-registry'

type SecretariatArea = {
  title: string
  description: string
}

const AREAS: Record<SecretariatSection, SecretariatArea> = {
  invitations: {
    title: 'Undangan',
    description: 'Ruang kerja untuk menyiapkan undangan rapat, agenda, jadwal, tempat, dan daftar peserta. Setiap undangan nantinya menjadi bagian dari satu kegiatan dengan Meeting ID yang tetap.',
  },
  materials: {
    title: 'Materi',
    description: 'Ruang kerja untuk menghimpun dan menautkan bahan rapat ke kegiatan yang sama. Materi tidak dibuat sebagai arsip terpisah dari undangan dan notulensi.',
  },
  attendance: {
    title: 'Absensi',
    description: 'Ruang kerja untuk mencatat kehadiran peserta berdasarkan daftar undangan dan Meeting ID kegiatan. Riwayat kehadiran harus dapat ditelusuri.',
  },
  minutes: {
    title: 'Notulensi',
    description: 'Ruang kerja untuk mendokumentasikan pembahasan, keputusan, rekomendasi, penanggung jawab, dan tenggat tindak lanjut rapat.',
  },
  documentation: {
    title: 'Dokumentasi Foto',
    description: 'Ruang kerja untuk menghubungkan dokumentasi foto dengan kegiatan rapat, waktu, dan arsip kelembagaan yang sesuai.',
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

        <div className="rmNotice info" role="note">
          <strong>Prinsip integrasi data</strong>
          <p>Satu kegiatan rapat menggunakan satu Meeting ID untuk menghubungkan undangan, materi, absensi, notulensi, dokumentasi, rekomendasi, dan tindak lanjut. Dokumen terkendali seperti SK, SPO, pedoman, kebijakan, dan formulir tetap berada pada kelompok Dokumen Terkendali, bukan di Sekretariat.</p>
        </div>
      </section>
    </section>
  )
}
