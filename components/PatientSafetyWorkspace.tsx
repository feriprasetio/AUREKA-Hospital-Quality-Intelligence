'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type React from 'react'
import { createPortal } from 'react-dom'
import type { SafetyFocus } from '@/lib/aureka/focus'
import { LiquidGlass } from '@/components/LiquidGlass'

type Room = { id: number; name: string }
type StaffOption = {
  id: string
  employee_code: string
  display_name: string
  profession_group: string
  position_title: string
  room_id: number
  room_name: string
}
type StaffEntityAttribution = {
  entity_type: 'patient_safety_incident' | 'patient_safety_investigation'
  entity_id: string
  staff_id: string
  field_key: string
  attribution_type: string
}
type IncidentStatus = 'draft' | 'submitted' | 'under_review' | 'investigation' | 'closed'
type IncidentRow = {
  id: string; incident_code: string; incident_date: string | null; incident_time: string | null
  unit_name: string; incident_type: string; summary: string; status: string
  form_data: Record<string, string>; created_at: string; submitted_at: string | null
}
type InvestigationRow = {
  id: string; investigation_code: string; incident_id: string; status: string
  form_data: Record<string, string>; created_at: string; updated_at: string
}
type CultureResponse = {
  response_id: string; response_code: string; survey_period: string; unit_name: string
  profession_group: string; hospital_tenure: string; unit_tenure: string; shift_pattern: string
  primary_role: string; direct_patient_contact: string; answers: Record<string, string>
  answered_item_count: number; submitted_at: string
}
type IncidentField = { code: string; label: string; type: 'text' | 'date' | 'time' | 'textarea' | 'select' | 'radio'; hint?: string; options?: string[] }

const INCIDENT_SECTIONS: { letter: string; title: string; fields: IncidentField[] }[] = [
  { letter: 'A', title: 'Rincian Insiden', fields: [
    { code: 'A1', label: 'Insiden yang Terjadi', type: 'textarea', hint: 'Uraikan singkat insiden yang terjadi.' },
    { code: 'A2', label: 'Tanggal Insiden', type: 'date' },
    { code: 'A3', label: 'Jam Insiden', type: 'time', hint: 'Perkiraan waktu kejadian' },
    { code: 'A4', label: 'Lokasi Insiden', type: 'text', hint: 'Tempat spesifik insiden terjadi' },
    { code: 'A5', label: 'Ruang Perawatan Pasien', type: 'text', hint: 'Saat pasien mengalami insiden' },
    { code: 'A6', label: 'Diagnosa Pasien', type: 'text', hint: 'Isi angka 0 jika tidak ada diagnosa sementara/tegak' },
    { code: 'A7', label: 'Jenis Insiden', type: 'radio', options: ['Kejadian Sentinel', 'Kejadian Tidak Diharapkan (KTD)', 'Kejadian Nyaris Cedera (KNC)', 'Kejadian Tidak Cedera (KTC)', 'Kejadian Potensial Cedera Signifikan (KPCs)'] },
    { code: 'A8', label: 'Akibat dari Insiden', type: 'textarea', hint: 'Jelaskan secara rinci akibat yang terjadi pada pasien setelah mengalami insiden.' },
  ]},
  { letter: 'B', title: 'Kronologi Kejadian', fields: [
    { code: 'B1', label: 'Kronologi Kejadian', type: 'textarea', hint: 'Jelaskan detail mulai dari sebelum terjadi insiden, saat terjadi insiden, serta setelah terjadi insiden.' },
  ]},
  { letter: 'C', title: 'Identitas Korban', fields: [
    { code: 'C1', label: 'Nama Pasien (Korban)', type: 'text' },
    { code: 'C2', label: 'No. Rekam Medis', type: 'text' },
    { code: 'C3', label: 'Usia', type: 'text', hint: 'Hari atau bulan untuk neonatus; tahun untuk anak atau dewasa.' },
    { code: 'C4', label: 'Jenis Kelamin', type: 'radio', options: ['Laki-Laki', 'Perempuan'] },
    { code: 'C5', label: 'Penanggung Biaya', type: 'radio', options: ['Umum (Pribadi)', 'BPJS Kesehatan (JKN)', 'Jasa Raharja (Laka Lantas)', 'Pemerintah/Bansos', 'Asuransi (Swasta/Tanggungan Perusahaan)', 'Yang lain:'] },
    { code: 'C6', label: 'Tanggal Masuk Rumah Sakit', type: 'date', hint: 'Tanggal awal masuk rumah sakit untuk mendapat pelayanan/perawatan.' },
    { code: 'C7', label: 'Jam Masuk Rumah Sakit', type: 'time' },
  ]},
  { letter: 'D', title: 'Tindak Lanjut', fields: [
    { code: 'D1', label: 'Orang Pertama yang Melaporkan Insiden', type: 'radio', options: ['Tidak ada', 'Petugas Rumah Sakit di Tempat Kejadian', 'Petugas Rumah Sakit dari Luar Tempat Kejadian', 'Kepala Ruangan', 'Pasien', 'Keluarga / Pendamping Pasien', 'Pengunjung', 'Yang lain:'] },
    { code: 'D2', label: 'Petugas yang Pertama Kali Segera Melakukan Tindakan Penyelamatan', type: 'radio', options: ['Tidak ada', 'Medis (Dokter)', 'Paramedis (Perawat)', 'Penunjang Medis (Tenaga Kesehatan Lainnya)'] },
    { code: 'D3', label: 'Tindakan yang Segera Dilakukan', type: 'textarea', hint: 'Oleh petugas yang pertama kali melakukan tindakan penyelamatan saat/setelah insiden terjadi.' },
    { code: 'D4', label: 'Kejadian yang Sama Pernah Terjadi di Ruangan Ini (Likelihood)', type: 'radio', options: ['Sangat Jarang (lebih dari 5 tahun baru 1 kejadian)', 'Jarang (1 kejadian dalam 2 sampai 5 tahun terakhir)', 'Mungkin (1 kejadian dalam 1 sampai 2 tahun terakhir)', 'Sering (beberapa kejadian dalam setahun)', 'Sangat Sering (hampir setiap bulan ada kejadian)'] },
    { code: 'D5', label: 'Kejadian yang Sama Pernah Terjadi di Ruangan Lain', type: 'radio', options: ['Ya', 'Tidak', 'Kurang Tahu'] },
    { code: 'D6', label: 'Langkah Pencegahan', type: 'textarea', hint: 'Yang bisa dilakukan sementara pada tingkat petugas pelayanan.' },
  ]},
  { letter: 'E', title: 'Pembuat Laporan', fields: [
    { code: 'E1', label: 'Nama Pembuat Laporan', type: 'text' },
    { code: 'E2', label: 'Unit Kerja', type: 'select' },
    { code: 'E3', label: 'Finalisasi Laporan', type: 'radio', options: [
      'Laporan sudah cukup valid menurut sudut pandang saya',
      'Memerlukan tambahan/pencocokan informasi terhadap rekan satu ruangan',
      'Memerlukan tambahan/pencocokan informasi terhadap rekan unit lain',
      'Memerlukan investigasi tingkat lanjut agar informasi insiden lebih relevan',
      'Saya memerlukan pertemuan khusus dengan tim Investigasi untuk menyampaikan informasi khusus',
      'Saya merasa ditekan oleh keluarga pasien dalam pemberian informasi',
      'Saya merasa ditekan oleh rekan kerja dalam pemberian informasi',
      'Saya merasa ditekan oleh atasan atau pejabat dalam pemberian informasi',
    ]},
  ]},
]
const INCIDENT_FIELDS = INCIDENT_SECTIONS.flatMap(s => s.fields)
const INCIDENT_REQUIRED = INCIDENT_FIELDS.map(f => f.code)

const INVESTIGATION_FIELDS: IncidentField[] = [
  { code: '1', label: 'Tipe Insiden dan Subtipe Insiden', type: 'text' },
  { code: '2', label: 'Tipe Harm', type: 'text' },
  { code: '3A', label: 'Masalah — Asuhan Pelayanan / Care Management Problem (CMP)', type: 'textarea' },
  { code: '3B', label: 'Masalah — Masalah Pelayanan / Service Delivery Problem (SDP)', type: 'textarea' },
  { code: '4A', label: 'Penyebab Langsung', type: 'textarea' },
  { code: '4B', label: 'Akar Masalah', type: 'textarea' },
  { code: '4C', label: 'Grading Risk', type: 'select', options: ['Rendah', 'Sedang', 'Tinggi', 'Ekstrem'] },
  { code: '5', label: 'Orang yang Terlibat sebagai Penyebab Langsung Insiden', type: 'textarea' },
  { code: '6', label: 'Proses / Fase Pelayanan Saat Terjadi Insiden', type: 'textarea' },
  { code: '7', label: 'Faktor-Faktor Kontributor', type: 'textarea' },
  { code: '8A', label: 'Faktor Mitigasi — Untuk Pasien', type: 'textarea' },
  { code: '8B', label: 'Faktor Mitigasi — Untuk Fasyankes', type: 'textarea' },
  { code: '8C', label: 'Faktor Mitigasi — Untuk Faktor Penyebab Terkait', type: 'textarea' },
  { code: '9', label: 'Cara Mendeteksi Insiden', type: 'textarea' },
  { code: '10', label: 'Dampak pada Fasyankes', type: 'textarea' },
  { code: '11', label: 'Rekomendasi', type: 'textarea' },
  { code: '12', label: 'Tindakan yang Akan Dilakukan', type: 'textarea' },
  { code: '13A', label: 'Tindakan Perbaikan — Kepada Pasien', type: 'textarea' },
  { code: '13B', label: 'Tindakan Perbaikan — Kepada Fasyankes', type: 'textarea' },
  { code: '14A', label: 'Tindakan untuk Mengurangi Risiko — Untuk Pasien', type: 'textarea' },
  { code: '14B', label: 'Tindakan untuk Mengurangi Risiko — Untuk Petugas', type: 'textarea' },
  { code: '14C', label: 'Tindakan untuk Mengurangi Risiko — Untuk Fasyankes', type: 'textarea' },
  { code: '14D', label: 'Tindakan untuk Mengurangi Risiko — Untuk Faktor Penyebab Terkait', type: 'textarea' },
]
const INVESTIGATION_SECTIONS = [
  { title: 'Klasifikasi & Masalah', codes: ['1', '2', '3A', '3B'] },
  { title: 'Analisis Penyebab', codes: ['4A', '4B', '4C', '5', '6', '7'] },
  { title: 'Faktor Mitigasi & Deteksi', codes: ['8A', '8B', '8C', '9', '10'] },
  { title: 'Rekomendasi & Tindakan', codes: ['11', '12', '13A', '13B', '14A', '14B', '14C', '14D'] },
]

const SURVEY_DIMENSIONS: { title: string; code: string; items: { code: string; text: string }[] }[] = [
  { code: 'I', title: 'Kepemimpinan & Dukungan Manajemen', items: [
    { code: 'B1', text: 'Pimpinan rumah sakit menunjukkan melalui tindakan nyata — bukan hanya pernyataan — bahwa keselamatan pasien adalah prioritas utama, bukan hanya menjelang akreditasi.' },
    { code: 'B2', text: 'Atasan/kepala unit saya memberikan apresiasi yang nyata ketika staf menemukan dan melaporkan potensi bahaya sebelum berdampak ke pasien.' },
    { code: 'B3', text: 'Atasan/kepala unit saya mempertimbangkan dengan sungguh-sungguh saran staf untuk memperbaiki keselamatan pasien di unit.' },
    { code: 'B4', text: 'Manajemen rumah sakit menyediakan sumber daya (waktu, anggaran, tenaga) yang memadai untuk program keselamatan pasien.' },
  ]},
  { code: 'II', title: 'Beban Kerja, Kendali, & Fasilitas', items: [
    { code: 'B5', text: 'Jumlah staf di unit kami saat ini cukup untuk menangani beban kerja klinis tanpa harus tergesa-gesa yang membahayakan pasien.' },
    { code: 'B6', text: 'Saya memiliki kendali yang wajar atas seberapa banyak dan seberapa cepat pekerjaan saya harus diselesaikan.' },
    { code: 'B7', text: 'Suasana kerja di unit ini pada umumnya tenang dan teratur, bukan kacau/tergesa-gesa.' },
    { code: 'B8', text: 'Peralatan medis, perlengkapan, dan fasilitas fisik yang tersedia memadai untuk memberikan perawatan yang aman.' },
  ]},
  { code: 'III', title: 'Kerja Sama Tim & Keamanan Psikologis', items: [
    { code: 'B9', text: 'Staf di unit ini saling membantu meskipun area tanggung jawab masing-masing sedang tidak sibuk.' },
    { code: 'B10', text: 'Saya merasa aman untuk mengakui kesalahan atau ketidaktahuan saya di depan rekan kerja di unit ini, tanpa takut dianggap tidak kompeten.' },
    { code: 'B11', text: 'Anggota tim di unit ini dapat mengangkat masalah dan isu sulit secara terbuka tanpa rasa takut.' },
    { code: 'B12', text: 'Keterampilan dan kontribusi unik saya dihargai oleh tim di unit kerja saya.' },
  ]},
  { code: 'IV', title: 'Keterbukaan Komunikasi & Pelaporan Insiden', items: [
    { code: 'B13', text: 'Staf di sini merasa bebas mempertanyakan keputusan/tindakan tenaga kesehatan lain yang memiliki jabatan atau kewenangan lebih tinggi.' },
    { code: 'B14', text: 'Staf di unit ini merasa nyaman melaporkan kesalahan yang mereka lakukan sendiri, sekecil apa pun itu.' },
    { code: 'B15', text: 'Kami menerima umpan balik yang jelas tentang tindak lanjut dari laporan insiden keselamatan pasien yang kami sampaikan.' },
  ]},
  { code: 'V', title: 'Serah Terima & Transisi Perawatan', items: [
    { code: 'B16', text: 'Informasi klinis penting tersampaikan dengan lengkap dan akurat saat pergantian shift.' },
    { code: 'B17', text: 'Informasi penting sering “terlewat begitu saja” saat pasien dipindahkan atau dirujuk antar unit di rumah sakit ini. (R)' },
  ]},
  { code: 'VI', title: 'Respons Adil & Pembelajaran Organisasi (Just Culture)', items: [
    { code: 'B18', text: 'Ketika suatu insiden dilaporkan, fokus unit ini adalah memperbaiki sistem/proses, bukan mencari siapa yang harus disalahkan.' },
    { code: 'B19', text: 'Rumah sakit secara aktif melakukan perubahan nyata pada prosedur kerja setelah terjadinya insiden keselamatan pasien.' },
    { code: 'B20', text: 'Kami mengevaluasi kembali apakah perubahan yang dilakukan setelah suatu insiden benar-benar efektif mencegah pengulangan.' },
  ]},
  { code: 'VII', title: 'Keterlibatan Pasien & Keluarga', items: [
    { code: 'B21', text: 'Staf di unit ini secara aktif melibatkan pasien/keluarga dalam pengambilan keputusan tentang rencana perawatan mereka.' },
    { code: 'B22', text: 'Pasien/keluarga diberi kesempatan yang jelas untuk menyampaikan kekhawatiran terkait keselamatan perawatan mereka.' },
    { code: 'B23', text: 'Staf menjelaskan risiko dan tindakan keselamatan kepada pasien/keluarga dengan bahasa yang mudah dipahami.' },
  ]},
  { code: 'VIII', title: 'Keamanan Lingkungan Kerja', items: [
    { code: 'B24', text: 'Rumah sakit memiliki prosedur yang jelas dan tegas untuk melindungi staf dari ancaman/kekerasan verbal maupun fisik dari pasien atau pengunjung.' },
    { code: 'B25', text: 'Saya yakin dapat melaporkan insiden kekerasan di tempat kerja tanpa menghadapi konsekuensi negatif.' },
  ]},
  { code: 'IX', title: 'Penggerak Burnout Tervalidasi', items: [
    { code: 'C1', text: 'Nilai-nilai pribadi saya sejalan dengan nilai-nilai kepemimpinan di unit/rumah sakit saya.' },
    { code: 'C2', text: 'Waktu yang saya habiskan untuk dokumentasi/administrasi SIMRS terasa wajar dan tidak mengorbankan waktu perawatan langsung ke pasien.' },
  ]},
  { code: 'X', title: 'Beban Psikologis, Cedera Moral, & Kelelahan Welas Asih', items: [
    { code: 'C3', text: '(Pengakuan Dampak Stres) Saya sadar bahwa saat beban kerja sangat tinggi dan saya kelelahan, risiko saya melakukan kesalahan klinis meningkat.' },
    { code: 'C4', text: '(Cedera Moral) Saya sering merasa tertekan karena keterbatasan sistem, sarana, atau aturan kerja memaksa saya memberikan perawatan yang menurut saya kurang optimal.' },
    { code: 'C5', text: '(Kelelahan Welas Asih) Saya merasa empati saya terhadap penderitaan pasien menurun dibandingkan saat pertama kali berkarier.' },
    { code: 'C6', text: '(Beban Kognitif) Saya sering merasa pikiran terlalu penuh/lelah secara mental sehingga sulit fokus penuh saat memberikan asuhan klinis.' },
  ]},
  { code: 'XI', title: 'Kepuasan Kerja, Keseimbangan, & Retensi', items: [
    { code: 'C7', text: 'Secara umum, saya menyukai pekerjaan saya dan merasa bangga menjadi bagian dari unit/rumah sakit ini.' },
    { code: 'C8', text: 'Jadwal dan tuntutan kerja saya memungkinkan saya memiliki waktu dan energi yang cukup untuk kehidupan pribadi/keluarga.' },
    { code: 'C9', text: 'Saya berniat untuk tetap bekerja di rumah sakit ini dalam 1–2 tahun ke depan.' },
  ]},
]
const WHO_ITEMS = [
  { code: 'C10', text: '...saya merasa ceria dan bersemangat' },
  { code: 'C11', text: '...saya merasa tenang dan santai' },
  { code: 'C12', text: '...saya merasa aktif dan penuh energi/tenaga' },
  { code: 'C13', text: '...saya bangun tidur dalam keadaan segar dan cukup istirahat' },
  { code: 'C14', text: '...kehidupan sehari-hari saya dipenuhi hal-hal yang menarik minat saya' },
]
const SURVEY_REQUIRED = [
  ...Array.from({ length: 25 }, (_, i) => 'B' + (i + 1)), 'B26',
  ...Array.from({ length: 9 }, (_, i) => 'C' + (i + 1)),
  ...WHO_ITEMS.map(x => x.code), 'D1', 'E1', 'E2',
]

const CSS = `
.ps{display:grid;gap:14px;min-width:0}.ps .glass{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.54),rgba(255,255,255,.22));border:1px solid rgba(255,255,255,.72);border-radius:26px;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.78);backdrop-filter:blur(24px) saturate(165%);-webkit-backdrop-filter:blur(24px) saturate(165%)}.psHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.psHead h3{font-size:28px;letter-spacing:-.055em;margin:5px 0}.psHead p{margin:0;color:var(--muted);font-size:11px;line-height:1.55;max-width:760px}.psEyebrow{font-size:9px;letter-spacing:.15em;color:#708078;font-weight:900;text-transform:uppercase}.psActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.psBtn{min-height:41px;padding:10px 13px;border:1px solid rgba(255,255,255,.78);border-radius:13px;background:rgba(255,255,255,.44);color:#264237;font-size:10px;font-weight:900}.psBtn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}.psBtn:disabled{opacity:.55;cursor:not-allowed}.psTabs{padding:6px;display:flex;gap:7px;flex-wrap:wrap}.psTab{border:1px solid rgba(255,255,255,.68);background:rgba(255,255,255,.28);color:#52625b;padding:10px 14px;border-radius:14px;font-size:10px;font-weight:850;min-height:40px}.psTab.active{background:linear-gradient(135deg,rgba(255,255,255,.76),rgba(var(--accent-rgb),.13));color:var(--accent2)}.psKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.psKpi{padding:15px 17px}.psKpi span{display:block;font-size:9px;color:#6f7d75;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.psKpi strong{font-size:25px;display:block;margin-top:6px;letter-spacing:-.05em}.psKpi small{display:block;color:var(--muted);font-size:9px;margin-top:4px}.psPanel{padding:19px 20px}.psSectionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:13px;margin-bottom:12px;border-bottom:1px solid rgba(106,124,114,.14)}.psSectionHead h4{font-size:17px;margin:0;letter-spacing:-.035em}.psSectionHead p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.45}.psPill{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#edf1ef;color:#54635c;font-size:8px;font-weight:900}.psPill.green{background:#e1f3eb;color:#0e6748}.psPill.amber{background:#fff0d7;color:#8b651d}.psPill.blue{background:#e7eef9;color:#3d5e8b}.psPill.red{background:#fde8e9;color:#9b2632}.psAlert{padding:12px 14px;border-radius:14px;border:1px solid rgba(var(--accent-rgb),.15);background:rgba(var(--accent-rgb),.06);color:#456057;font-size:10px;line-height:1.5}.psAlert.error{border-color:#f5cbce;background:#fff1f1;color:#8e2632}.psAlert.warn{background:#fff8e7;border-color:#f4e1ae;color:#78591d}.psTableWrap{overflow:auto;max-height:calc(100vh - 390px);border-radius:17px;border:1px solid rgba(106,124,114,.14)}.psTable{width:100%;min-width:850px;border-collapse:separate;border-spacing:0}.psTable th,.psTable td{padding:11px 12px;border-bottom:1px solid rgba(106,124,114,.12);font-size:10px;text-align:left;vertical-align:middle}.psTable th{position:sticky;top:0;background:rgba(248,251,249,.96);z-index:2;color:#738079;text-transform:uppercase;letter-spacing:.06em;font-size:8px}.psTable tr:last-child td{border-bottom:0}.psCode{font-weight:900;color:var(--accent2)}.psMuted{color:var(--muted)}.psEmpty{padding:36px 18px;text-align:center;color:var(--muted);font-size:10px}.psFormSection{padding:18px 0;border-bottom:1px solid rgba(106,124,114,.13)}.psFormSection:first-child{padding-top:0}.psFormSection:last-child{border-bottom:0}.psFormHeading{display:flex;align-items:center;gap:11px;margin-bottom:13px}.psFormLetter{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;font-size:11px;font-weight:950}.psFormHeading h4{margin:0;font-size:15px}.psFormHeading p{margin:3px 0 0;font-size:9px;color:var(--muted)}.psFormGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px}.psField.full{grid-column:1/-1}.psLabel{display:block;font-size:9px;color:#6f7d75;font-weight:900;text-transform:uppercase;letter-spacing:.055em;margin:0 0 6px 2px;line-height:1.45}.psRequired{color:#c32b3c}.psHint{font-size:9px;line-height:1.45;font-style:italic;color:var(--muted);margin:-1px 2px 7px}.psField input,.psField select,.psField textarea,.psFilter input,.psFilter select{width:100%;min-height:44px;border:1px solid rgba(35,63,50,.12);border-radius:13px;background:rgba(255,255,255,.58);padding:10px 12px;color:var(--ink);font-size:11px;outline:none}.psField textarea{min-height:96px;resize:vertical;line-height:1.5}.psField input:focus,.psField select:focus,.psField textarea:focus,.psFilter input:focus,.psFilter select:focus{border-color:rgba(var(--accent-rgb),.38);box-shadow:0 0 0 4px rgba(var(--accent-rgb),.07)}.psField input:disabled,.psField select:disabled,.psField textarea:disabled{opacity:.75;background:rgba(235,239,237,.62)}.psRadioGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.psRadio{display:flex;gap:8px;align-items:flex-start;padding:10px 11px;border:1px solid rgba(35,63,50,.10);border-radius:12px;background:rgba(255,255,255,.56);font-size:10px;line-height:1.4}.psRadio input{width:auto;min-height:0;margin-top:2px;accent-color:var(--accent);flex:0 0 auto}.psFormFooter{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 0 0;margin-top:16px;border-top:1px solid rgba(106,124,114,.14)}.psMetaGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:14px}.psMeta{padding:11px 12px;border:1px solid rgba(106,124,114,.13);background:rgba(255,255,255,.45);border-radius:14px}.psMeta span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;font-weight:900}.psMeta strong{display:block;margin-top:5px;font-size:12px}.psFilterBar{padding:15px 17px}.psFilterGrid{display:grid;grid-template-columns:1.2fr .8fr 1fr auto;align-items:end;gap:9px}.psFilter label{display:block;font-size:8px;color:#718078;text-transform:uppercase;letter-spacing:.06em;font-weight:900;margin:0 0 6px 2px}.psRcaMap{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:16px}.psRcaNode{padding:11px;border:1px solid rgba(106,124,114,.14);border-radius:13px;background:rgba(255,255,255,.42)}.psRcaNode b{font-size:9px;color:var(--accent)}.psRcaNode span{display:block;font-size:9px;line-height:1.45;color:var(--muted);margin-top:4px}.psSurveyIntro{padding:18px}.psSurveyIntro h3{font-size:22px;letter-spacing:-.045em;margin:4px 0 7px}.psSurveyIntro p{font-size:10px;color:var(--muted);line-height:1.5;margin:0}.psPrivacy{padding:11px 13px;margin-top:12px;border-radius:13px;border:1px solid #dcefe7;background:#eef8f4;color:#486056;font-size:9px;line-height:1.55}.psSurveyMeta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}.psSurveyMeta label{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#738079;font-weight:900;margin:0 0 6px}.psSurveyMeta select{width:100%;min-height:40px;border:1px solid rgba(35,63,50,.12);border-radius:11px;background:#fff;padding:8px;font-size:10px}.psDim{padding:18px}.psDimHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:11px;margin-bottom:4px;border-bottom:1px solid rgba(106,124,114,.12)}.psDimHead span{font-size:8px;letter-spacing:.1em;font-weight:950;color:var(--accent)}.psDimHead h4{font-size:15px;margin:3px 0 0}.psDimHead small{font-size:8px;color:var(--muted)}.psQuestion{padding:12px 0;border-bottom:1px solid rgba(106,124,114,.10)}.psQuestion:last-child{border-bottom:0}.psQuestionText{display:flex;gap:10px;font-size:10px;line-height:1.55}.psQCode{min-width:34px;height:23px;border-radius:8px;background:rgba(var(--accent-rgb),.08);color:var(--accent2);display:grid;place-items:center;font-size:8px;font-weight:950}.psScale{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0 0 44px}.psScale button{min-width:39px;min-height:34px;border:1px solid rgba(35,63,50,.12);background:rgba(255,255,255,.72);border-radius:10px;padding:6px 9px;font-size:9px;font-weight:900;color:#52635b}.psScale button span{display:block;font-size:7px;font-weight:650;color:#85928c;margin-top:1px}.psScale button.selected,.psChoiceGrid button.selected,.psBurnout button.selected{background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;border-color:transparent}.psScale button.selected span{color:rgba(255,255,255,.8)}.psChoiceGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:9px 0 0 44px}.psChoiceGrid button{border:1px solid rgba(35,63,50,.12);background:rgba(255,255,255,.72);border-radius:11px;padding:9px 10px;font-size:9px;text-align:left;line-height:1.35}.psChoiceGrid.five{grid-template-columns:repeat(5,minmax(0,1fr))}.psBurnout{display:grid;gap:7px}.psBurnout button{display:grid;grid-template-columns:64px 1fr;gap:10px;text-align:left;border:1px solid rgba(35,63,50,.12);background:rgba(255,255,255,.68);border-radius:12px;padding:10px 12px;font-size:9px;line-height:1.45}.psBurnout button b{color:var(--accent)}.psWhoGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.psWho{padding:12px;border-radius:14px;background:rgba(255,255,255,.35);border:1px solid rgba(106,124,114,.12)}.psWho b{font-size:8px;color:var(--accent)}.psWho span{display:block;font-size:9px;line-height:1.45;margin-top:3px}.psResults{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.psResult{padding:12px;border-radius:14px;border:1px solid rgba(106,124,114,.13);background:rgba(255,255,255,.5)}.psResult span{font-size:8px;color:var(--muted);display:block}.psResult strong{font-size:18px;display:block;margin-top:5px}.psBars{display:grid;gap:8px}.psBarRow{display:grid;grid-template-columns:145px 1fr 36px;gap:8px;align-items:center}.psBarRow span,.psBarRow b{font-size:8px}.psBar{height:8px;border-radius:99px;background:#e8eeeb;overflow:hidden}.psBar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),#71baa0)}.psToast{position:fixed;right:18px;bottom:18px;z-index:120;padding:12px 14px;border-radius:14px;background:rgba(14,39,29,.93);color:#fff;font-size:10px;box-shadow:0 18px 48px rgba(0,0,0,.22)}@media(max-width:1100px){.psKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.psFilterGrid{grid-template-columns:1fr 1fr}.psSurveyMeta{grid-template-columns:1fr 1fr}.psRcaMap{grid-template-columns:repeat(3,1fr)}.psMetaGrid{grid-template-columns:1fr 1fr}.psChoiceGrid.five{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.psHead{display:block}.psHead h3{font-size:24px}.psHead p{max-width:none}.psActions{margin-top:12px}.psKpis{grid-template-columns:1fr 1fr}.psFormGrid{grid-template-columns:1fr}.psField.full{grid-column:auto}.psRadioGrid{grid-template-columns:1fr}.psFormFooter{display:block}.psFormFooter .psActions{margin-top:9px;justify-content:flex-start}.psRcaMap{grid-template-columns:1fr 1fr}.psSurveyMeta{grid-template-columns:1fr 1fr}.psWhoGrid{grid-template-columns:1fr}.psResults{grid-template-columns:1fr 1fr}.psChoiceGrid,.psChoiceGrid.five{grid-template-columns:1fr 1fr}.psScale{margin-left:0}.psChoiceGrid{margin-left:0}.psTableWrap{max-height:none}.psBarRow{grid-template-columns:115px 1fr 34px}}@media(max-width:480px){.psKpis{grid-template-columns:1fr}.psSurveyMeta,.psMetaGrid{grid-template-columns:1fr}.psChoiceGrid,.psChoiceGrid.five{grid-template-columns:1fr}.psResults{grid-template-columns:1fr 1fr}.psHead{padding:17px}.psPanel,.psDim{padding:15px}.psFormFooter .psActions{display:grid;grid-template-columns:1fr 1fr}.psBurnout button{grid-template-columns:1fr}}
`

function emptyRecord() { return {} as Record<string, string> }
function safeString(value: unknown) { return value == null ? '' : String(value) }
function xmlEscape(value: unknown) {
  return safeString(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
function spreadsheetCell(value: unknown) {
  const isNumber = typeof value === 'number' && Number.isFinite(value)
  return '<Cell><Data ss:Type="' + (isNumber ? 'Number' : 'String') + '">' + xmlEscape(value) + '</Data></Cell>'
}
function spreadsheetSheet(name: string, rows: unknown[][]) {
  return '<Worksheet ss:Name="' + xmlEscape(name) + '"><Table>' +
    rows.map(row => '<Row>' + row.map(spreadsheetCell).join('') + '</Row>').join('') +
    '</Table></Worksheet>'
}
function makeWorkbook(summaries: unknown[][], details: unknown[][]) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">' +
    spreadsheetSheet('Rekap Respons', summaries) + spreadsheetSheet('Jawaban Item', details) + '</Workbook>'
}
function makeResponseIdentity() {
  const raw = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const d = new Date()
  const date = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
  return { id: raw.slice(0, 8) + '-' + raw.slice(8, 12) + '-4' + raw.slice(13, 16) + '-a' + raw.slice(17, 20) + '-' + raw.slice(20, 32), code: 'SC-' + date + '-' + raw.slice(0, 12).toUpperCase() }
}

// Formulir laporan tampil sebagai jendela di atas daftar agar tidak perlu scroll ke bawah,
// dengan tombol kembali yang selalu terlihat di bagian atas.
function PsFormModal({ label, children }: { label: string; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  // Dirender ke <body> agar latar menutup seluruh layar termasuk sidebar.
  return createPortal(<div className="psModalBackdrop" role="dialog" aria-modal="true" aria-label={label}><div className="psModalSheet">{children}</div></div>, document.body)
}

export default function PatientSafetyWorkspace({
  supabase,
  rooms,
  initialRoomId,
  isSuperAdmin,
  canManageWorkflow,
  focus,
}: {
  supabase: SupabaseClient
  rooms: Room[]
  initialRoomId: number | null
  isSuperAdmin: boolean
  canManageWorkflow: boolean
  focus?: SafetyFocus | null
}) {
  const db = useMemo(() => (supabase as any).schema('aureka_patient_safety'), [supabase])
  const qualityDb = useMemo(() => (supabase as any).schema('aureka_quality'), [supabase])
  const [tab, setTab] = useState<'overview' | 'incidents' | 'investigation' | 'survey' | 'responses'>('overview')
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [investigations, setInvestigations] = useState<InvestigationRow[]>([])
  const [responses, setResponses] = useState<CultureResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [unitFilter, setUnitFilter] = useState('all')

  const [incidentId, setIncidentId] = useState('')
  const [incidentCode, setIncidentCode] = useState('')
  const [incidentStatus, setIncidentStatus] = useState<IncidentStatus>('draft')
  const [incidentData, setIncidentData] = useState<Record<string, string>>(emptyRecord())
  const incidentLocked = incidentStatus !== 'draft' && !canManageWorkflow

  const [investigationId, setInvestigationId] = useState('')
  const [investigationCode, setInvestigationCode] = useState('')
  const [investigationIncidentId, setInvestigationIncidentId] = useState('')
  const [investigationStatus, setInvestigationStatus] = useState('draft')
  const [investigationData, setInvestigationData] = useState<Record<string, string>>(emptyRecord())
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [staffEntityLinks, setStaffEntityLinks] = useState<StaffEntityAttribution[]>([])
  const [incidentStaffId, setIncidentStaffId] = useState('')
  const [investigationStaffIds, setInvestigationStaffIds] = useState<string[]>([])
  const [investigationStaffToAdd, setInvestigationStaffToAdd] = useState('')

  const [surveyPeriod, setSurveyPeriod] = useState('2026-Q4')
  const [surveyUnit, setSurveyUnit] = useState('')
  const [surveyProfession, setSurveyProfession] = useState('')
  const [surveyHospitalTenure, setSurveyHospitalTenure] = useState('')
  const [surveyUnitTenure, setSurveyUnitTenure] = useState('')
  const [surveyShift, setSurveyShift] = useState('')
  const [surveyRole, setSurveyRole] = useState('')
  const [surveyPatientContact, setSurveyPatientContact] = useState('')
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>(emptyRecord())
  const [lastResponseCode, setLastResponseCode] = useState('')
  const [responsePeriodFilter, setResponsePeriodFilter] = useState('')
  const [responseUnitFilter, setResponseUnitFilter] = useState('')
  const [responseSearch, setResponseSearch] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const incidentQuery = db.from('incidents').select('id,incident_code,incident_date,incident_time,unit_name,incident_type,summary,status,form_data,created_at,submitted_at').order('created_at', { ascending: false }).limit(500)
      const [incidentResult, investigationResult] = await Promise.all([
        incidentQuery,
        db.from('investigations').select('id,investigation_code,incident_id,status,form_data,created_at,updated_at').order('updated_at', { ascending: false }).limit(500),
      ])
      if (incidentResult.error) throw incidentResult.error
      const nextIncidents = (incidentResult.data || []) as IncidentRow[]
      setIncidents(nextIncidents)
      if (investigationResult.error) {
        if (canManageWorkflow) setError('Daftar investigasi belum dapat dimuat: ' + investigationResult.error.message)
      } else {
        setInvestigations((investigationResult.data || []) as InvestigationRow[])
      }

      // Cross-module personnel identities come from the active locked roster, restricted by RLS to accessible rooms.
      try {
        const { data: assignmentRows, error: assignmentError } = await qualityDb
          .from('staff_team_assignments')
          .select('staff_id,room_id')
          .eq('assignment_status', 'active')
          .eq('is_locked', true)
        if (assignmentError) throw assignmentError
        const assignments = (assignmentRows || []) as Array<{ staff_id: string; room_id: number }>
        const roomById = new Map(rooms.map((room) => [Number(room.id), room.name]))
        const roomByStaff = new Map(assignments.map((assignment) => [String(assignment.staff_id), Number(assignment.room_id)]))
        const staffIds = Array.from(roomByStaff.keys())
        const nextStaff: StaffOption[] = []
        for (let offset = 0; offset < staffIds.length; offset += 100) {
          const batch = staffIds.slice(offset, offset + 100)
          const { data: directoryRows, error: directoryError } = await qualityDb
            .from('staff_directory')
            .select('id,employee_code,display_name,profession_group,position_title,directory_status')
            .eq('directory_status', 'available')
            .in('id', batch)
            .order('display_name')
          if (directoryError) throw directoryError
          nextStaff.push(...(directoryRows || []).map((row: any) => ({
            id: String(row.id),
            employee_code: String(row.employee_code || ''),
            display_name: String(row.display_name || ''),
            profession_group: String(row.profession_group || ''),
            position_title: String(row.position_title || ''),
            room_id: Number(roomByStaff.get(String(row.id))),
            room_name: roomById.get(Number(roomByStaff.get(String(row.id)))) || '',
          })))
        }
        setStaffOptions(nextStaff.filter((staff) => staff.room_name))
      } catch (staffLoadError) {
        setStaffOptions([])
        setMessage('Direktori tenaga belum dapat dimuat; penautan identitas staf dinonaktifkan sementara. Periksa akses Metadata / Tim Tenaga Kerja.')
      }

      try {
        const entityIds = [
          ...nextIncidents.map((row) => String(row.id)),
          ...(((investigationResult.data || []) as InvestigationRow[]).map((row) => String(row.id))),
        ]
        const links: StaffEntityAttribution[] = []
        for (let offset = 0; offset < entityIds.length; offset += 100) {
          const batch = entityIds.slice(offset, offset + 100)
          const { data: linkRows, error: linkError } = await qualityDb
            .from('staff_entity_attributions')
            .select('entity_type,entity_id,staff_id,field_key,attribution_type')
            .in('entity_id', batch)
          if (linkError) throw linkError
          links.push(...((linkRows || []) as StaffEntityAttribution[]))
        }
        setStaffEntityLinks(links)
      } catch {
        setStaffEntityLinks([])
      }

      if (isSuperAdmin) {
        const allResponses: CultureResponse[] = []
        let start = 0
        while (true) {
          const result = await db.from('culture_responses').select('*').order('submitted_at', { ascending: false }).range(start, start + 499)
          if (result.error) throw result.error
          const batch = (result.data || []) as CultureResponse[]
          allResponses.push(...batch)
          if (batch.length < 500) break
          start += 500
        }
        setResponses(allResponses)
      } else {
        setResponses([])
      }
    } catch (e) {
      setError('Backend Keselamatan Pasien belum siap atau akses ditolak. Pastikan migration patient safety sudah dijalankan di Supabase. ' + (e instanceof Error ? e.message : 'Kesalahan tidak diketahui.'))
    } finally {
      setLoading(false)
    }
  }, [db, qualityDb, rooms, canManageWorkflow, isSuperAdmin])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => {
    const defaultRoom = rooms.find(room => room.id === initialRoomId)?.name || ''
    if (defaultRoom) {
      setIncidentData(current => current.E2 ? current : { ...current, E2: defaultRoom })
      setSurveyUnit(current => current || defaultRoom)
    }
  }, [rooms, initialRoomId])

  const filteredIncidents = useMemo(() => incidents.filter(row => {
    const matchesStatus = statusFilter === 'all' || row.status === statusFilter
    const matchesUnit = unitFilter === 'all' || row.unit_name === unitFilter
    const needle = search.toLowerCase().trim()
    const matchesSearch = !needle || [row.incident_code, row.unit_name, row.incident_type, row.summary].join(' ').toLowerCase().includes(needle)
    return matchesStatus && matchesUnit && matchesSearch
  }), [incidents, statusFilter, unitFilter, search])

  const openInvestigations = useMemo(() => investigations.filter(row => row.status !== 'closed'), [investigations])
  const responseRows = useMemo(() => responses.filter(row =>
    (!responsePeriodFilter || row.survey_period === responsePeriodFilter) &&
    (!responseUnitFilter || row.unit_name === responseUnitFilter) &&
    (!responseSearch || row.response_code.toLowerCase().includes(responseSearch.toLowerCase().trim()))
  ), [responses, responsePeriodFilter, responseUnitFilter, responseSearch])
  const meanSafetyRating = useMemo(() => {
    const values = responses.map(row => Number(row.answers?.E1)).filter(value => Number.isFinite(value) && value >= 1 && value <= 5)
    return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2) : '—'
  }, [responses])
  const missingIncident = useMemo(() => INCIDENT_REQUIRED.filter(code => !String(incidentData[code] || '').trim()), [incidentData])
  const missingSurvey = useMemo(() => SURVEY_REQUIRED.filter(code => !Object.prototype.hasOwnProperty.call(surveyAnswers, code) || surveyAnswers[code] === ''), [surveyAnswers])
  const roomOptions = rooms.length ? rooms.map(room => room.name) : ['Instalasi Gawat Darurat', 'Rawat Inap', 'Instalasi Farmasi', 'Instalasi Bedah Sentral', 'Laboratorium', 'Radiologi']

  const [formOpen, setFormOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const formSnapshot = useRef('')
  const formDirty = formOpen && JSON.stringify({ data: incidentData, staffId: incidentStaffId }) !== formSnapshot.current
  const closeForm = (force = false) => {
    if (!force && formDirty) { setConfirmClose(true); return }
    setConfirmClose(false); setFormOpen(false); setError('')
  }
  const notify = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(current => current === text ? '' : current), 4500)
  }
  const setIncidentValue = (code: string, value: string) => setIncidentData(current => ({ ...current, [code]: value }))
  const setInvestigationValue = (code: string, value: string) => setInvestigationData(current => ({ ...current, [code]: value }))
  const syncStaffEntityAttributions = async (
    entityType: StaffEntityAttribution['entity_type'], entityId: string, fieldKey: string, selectedIds: string[],
    attributionType: StaffEntityAttribution['attribution_type'], unitName: string,
  ): Promise<string> => {
    const uniqueIds = Array.from(new Set(selectedIds.filter(Boolean))).sort()
    const oldIds = staffEntityLinks.filter(link => link.entity_type === entityType && link.entity_id === entityId && link.field_key === fieldKey).map(link => link.staff_id).sort()
    if (oldIds.length === uniqueIds.length && oldIds.every((id, index) => id === uniqueIds[index])) return ''
    const allowedIds = new Set(staffOptions.filter(staff => staff.room_name === unitName).map(staff => staff.id))
    if (uniqueIds.some(id => !allowedIds.has(id))) return 'Data tersimpan, tetapi tautan identitas tidak diubah karena tenaga tidak lagi berada pada roster terkunci unit. Minta Admin/PMKP meninjau pemetaan tim.'
    const { error: deleteError } = await qualityDb.from('staff_entity_attributions').delete().eq('entity_type', entityType).eq('entity_id', entityId).eq('field_key', fieldKey)
    if (deleteError) return 'Data form tersimpan, tetapi tautan identitas lama tidak dapat diperbarui: ' + deleteError.message
    if (!uniqueIds.length) return ''
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) return 'Data form tersimpan, tetapi sesi login tidak tersedia untuk mencatat atribusi identitas.'
    const payload = uniqueIds.map(staffId => ({ entity_type: entityType, entity_id: entityId, staff_id: staffId, field_key: fieldKey, attribution_type: attributionType, created_by: authData.user.id, updated_by: authData.user.id }))
    const { error: insertError } = await qualityDb.from('staff_entity_attributions').insert(payload)
    return insertError ? 'Data form tersimpan, tetapi atribusi identitas gagal disimpan: ' + insertError.message : ''
  }
  const openIncident = (row: IncidentRow) => {
    setIncidentId(row.id)
    setIncidentCode(row.incident_code)
    setIncidentStatus(row.status as IncidentStatus)
    setIncidentData({ ...(row.form_data || {}) })
    const reporterLink = staffEntityLinks.find((link) => link.entity_type === 'patient_safety_incident' && link.entity_id === row.id && link.field_key === 'E1')
    setIncidentStaffId(reporterLink?.staff_id || '')
    formSnapshot.current = JSON.stringify({ data: { ...(row.form_data || {}) }, staffId: reporterLink?.staff_id || '' })
    setTab('incidents')
    setError('')
    setMessage('')
    setConfirmClose(false)
    setFormOpen(true)
  }
  const appliedFocus = useRef(0)
  useEffect(() => {
    if (!focus || appliedFocus.current === focus.nonce) return
    if (focus.incidentId) {
      const row = incidents.find(r => r.id === focus.incidentId)
      if (!row) return // tunggu data insiden termuat
      appliedFocus.current = focus.nonce
      openIncident(row)
      return
    }
    appliedFocus.current = focus.nonce
    if (focus.tab) setTab(focus.tab)
  }, [focus, incidents])
  const newIncident = () => {
    setIncidentId('')
    setIncidentCode('')
    setIncidentStatus('draft')
    const initial = { E2: rooms.find(room => room.id === initialRoomId)?.name || '' }
    setIncidentData(initial)
    setIncidentStaffId('')
    formSnapshot.current = JSON.stringify({ data: initial, staffId: '' })
    setTab('incidents')
    setError('')
    setMessage('')
    setConfirmClose(false)
    setFormOpen(true)
  }
  const saveIncident = async (nextStatus: IncidentStatus) => {
    if (saving) return
    if (nextStatus !== 'draft' && missingIncident.length) {
      setError('Laporan belum lengkap. Lengkapi ' + missingIncident.length + ' field wajib sebelum mengirim.')
      return
    }
    setSaving(true); setError(''); setMessage('')
    const data = {
      incident_date: incidentData.A2 || null,
      incident_time: incidentData.A3 || null,
      unit_name: incidentData.E2 || '',
      incident_type: incidentData.A7 || '',
      summary: incidentData.A1 || '',
      status: nextStatus,
      form_data: incidentData,
      submitted_at: nextStatus === 'draft' ? null : (incidents.find(row => row.id === incidentId)?.submitted_at || new Date().toISOString()),
    }
    try {
      let result: any
      if (incidentId) {
        result = await db.from('incidents').update(data).eq('id', incidentId).select('id,incident_code,status').single()
      } else {
        result = await db.from('incidents').insert(data).select('id,incident_code,status').single()
      }
      if (result.error) throw result.error
      setIncidentId(result.data.id)
      setIncidentCode(result.data.incident_code)
      setIncidentStatus(result.data.status as IncidentStatus)
      formSnapshot.current = JSON.stringify({ data: incidentData, staffId: incidentStaffId })
      let attributionWarning = ''
      try {
        attributionWarning = await syncStaffEntityAttributions('patient_safety_incident', String(result.data.id), 'E1', incidentStaffId ? [incidentStaffId] : [], 'reporter', incidentData.E2 || '')
      } catch (attributionError) {
        attributionWarning = 'Laporan tersimpan, tetapi atribusi tenaga belum berhasil diperbarui: ' + (attributionError instanceof Error ? attributionError.message : 'kesalahan database')
      }
      await loadData()
      if (nextStatus === 'submitted' && !canManageWorkflow) setFormOpen(false)
      const successMessage = nextStatus === 'submitted' ? 'Laporan berhasil dikirim untuk review. Kode: ' + result.data.incident_code : 'Draft laporan disimpan. Kode: ' + result.data.incident_code
      notify(attributionWarning || successMessage)
    } catch (e) {
      setError('Gagal menyimpan laporan IKP: ' + (e instanceof Error ? e.message : 'periksa koneksi dan izin Supabase.'))
    } finally { setSaving(false) }
  }

  useEffect(() => {
    const existing = investigations.find(row => row.incident_id === investigationIncidentId)
    if (existing) {
      setInvestigationId(existing.id)
      setInvestigationCode(existing.investigation_code)
      setInvestigationStatus(existing.status)
      setInvestigationData({ ...(existing.form_data || {}) })
      setInvestigationStaffIds(staffEntityLinks
        .filter(link => link.entity_type === 'patient_safety_investigation' && link.entity_id === existing.id && link.field_key === '5')
        .map(link => link.staff_id))
    } else {
      setInvestigationId('')
      setInvestigationCode('')
      setInvestigationStatus('draft')
      setInvestigationData(emptyRecord())
      setInvestigationStaffIds([])
      setInvestigationStaffToAdd('')
    }
  }, [investigationIncidentId, investigations, staffEntityLinks])

  const saveInvestigation = async () => {
    if (!canManageWorkflow) { setError('Akses investigasi hanya untuk Admin, Komite PMKP, atau Manajemen yang berwenang.'); return }
    if (!investigationIncidentId) { setError('Pilih laporan IKP yang akan diinvestigasi.'); return }
    if (saving) return
    const targetIncident = incidents.find(row => row.id === investigationIncidentId)
    const targetUnitName = targetIncident?.unit_name || ''
    const oldLinkedIds = staffEntityLinks
      .filter(link => link.entity_type === 'patient_safety_investigation' && link.entity_id === investigationId && link.field_key === '5')
      .map(link => link.staff_id).sort()
    const selectedLinkedIds = Array.from(new Set(investigationStaffIds)).sort()
    const sameAsSavedLinks = oldLinkedIds.length === selectedLinkedIds.length && oldLinkedIds.every((id, index) => id === selectedLinkedIds[index])
    const allowedInvestigationStaff = new Set(staffOptions.filter(staff => staff.room_name === targetUnitName).map(staff => staff.id))
    if (!sameAsSavedLinks && selectedLinkedIds.some(staffId => !allowedInvestigationStaff.has(staffId))) {
      setError('Ada identitas tenaga baru yang tidak berada pada roster terkunci unit. Identitas historis tetap dapat dipertahankan, tetapi perubahan baru harus menggunakan roster unit yang sah.')
      return
    }
    setSaving(true); setError(''); setMessage('')
    const formData = investigationData
    const payload = {
      incident_id: investigationIncidentId,
      status: investigationStatus,
      form_data: formData,
      completed_at: investigationStatus === 'closed' ? new Date().toISOString() : null,
    }
    try {
      let result: any
      if (investigationId) {
        result = await db.from('investigations').update(payload).eq('id', investigationId).select('id,investigation_code,status').single()
      } else {
        result = await db.from('investigations').insert(payload).select('id,investigation_code,status').single()
      }
      if (result.error) throw result.error
      setInvestigationId(result.data.id)
      setInvestigationCode(result.data.investigation_code)
      let attributionWarning = ''
      try {
        attributionWarning = await syncStaffEntityAttributions('patient_safety_investigation', String(result.data.id), '5', investigationStaffIds, 'involved_person', targetUnitName)
      } catch (attributionError) {
        attributionWarning = 'Investigasi tersimpan, tetapi atribusi tenaga belum berhasil diperbarui: ' + (attributionError instanceof Error ? attributionError.message : 'kesalahan database')
      }
      await loadData()
      notify(attributionWarning || 'Hasil investigasi disimpan. Kode: ' + result.data.investigation_code)
    } catch (e) {
      setError('Gagal menyimpan investigasi: ' + (e instanceof Error ? e.message : 'periksa koneksi dan izin Supabase.'))
    } finally { setSaving(false) }
  }

  const setSurveyAnswer = (code: string, value: string) => setSurveyAnswers(current => ({ ...current, [code]: value }))
  const resetSurvey = () => {
    setSurveyAnswers(emptyRecord())
    setSurveyProfession('')
    setSurveyHospitalTenure('')
    setSurveyUnitTenure('')
    setSurveyShift('')
    setSurveyRole('')
    setSurveyPatientContact('')
    setSurveyUnit('')
    setLastResponseCode('')
    setError('')
    setMessage('')
  }
  const submitSurvey = async () => {
    if (saving) return
    if (!surveyUnit || !surveyProfession) { setError('Pilih unit kerja dan profesi untuk metadata anonim survey.'); return }
    if (missingSurvey.length) { setError('Survey belum lengkap: masih ada ' + missingSurvey.length + ' item yang belum dijawab. Gunakan TB untuk item yang tidak relevan.'); return }
    setSaving(true); setError(''); setMessage('')
    const identity = makeResponseIdentity()
    const payload = {
      response_id: identity.id,
      response_code: identity.code,
      survey_period: surveyPeriod,
      unit_name: surveyUnit,
      profession_group: surveyProfession,
      hospital_tenure: surveyHospitalTenure,
      unit_tenure: surveyUnitTenure,
      shift_pattern: surveyShift,
      primary_role: surveyRole,
      direct_patient_contact: surveyPatientContact,
      answers: surveyAnswers,
      answered_item_count: Object.keys(surveyAnswers).length,
      submitted_at: new Date().toISOString(),
    }
    try {
      const result = await db.from('culture_responses').insert(payload)
      if (result.error) throw result.error
      setLastResponseCode(identity.code)
      setSurveyAnswers(emptyRecord())
      setSurveyProfession(''); setSurveyHospitalTenure(''); setSurveyUnitTenure('')
      setSurveyShift(''); setSurveyRole(''); setSurveyPatientContact(''); setSurveyUnit('')
      if (isSuperAdmin) await loadData()
      notify('Respons anonim tersimpan sebagai record baru: ' + identity.code + '. Form siap untuk responden berikutnya.')
    } catch (e) {
      setError('Respons tidak tersimpan. Tidak ada data lama yang ditimpa. ' + (e instanceof Error ? e.message : 'periksa koneksi.'))
    } finally { setSaving(false) }
  }

  const exportResponses = () => {
    if (!isSuperAdmin) { setError('Ekspor rekapan hanya tersedia untuk Superadmin.'); return }
    const summary: unknown[][] = [[
      'Response ID', 'Response Code', 'Waktu Submit', 'Periode', 'Unit', 'Profesi / Kelompok Jabatan',
      'Lama Bekerja di RS', 'Lama Bekerja di Unit', 'Pola Shift', 'Peran Utama', 'Kontak Langsung dengan Pasien',
      'Jumlah Item Terjawab', 'E1 Safety Rating', 'D1 Burnout'
    ]]
    const details: unknown[][] = [['Response ID', 'Response Code', 'Periode', 'Unit', 'Profesi', 'Kode Item', 'Jawaban']]
    for (const row of responseRows) {
      summary.push([
        row.response_id, row.response_code, row.submitted_at, row.survey_period, row.unit_name, row.profession_group,
        row.hospital_tenure, row.unit_tenure, row.shift_pattern, row.primary_role, row.direct_patient_contact,
        row.answered_item_count, row.answers?.E1 || '', row.answers?.D1 || '',
      ])
      Object.entries(row.answers || {}).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([code, answer]) => {
        details.push([row.response_id, row.response_code, row.survey_period, row.unit_name, row.profession_group, code, answer])
      })
    }
    const workbook = makeWorkbook(summary, details)
    const blob = new Blob(['\ufeff', workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'AUREKA_Rekap_Budaya_Keselamatan_' + new Date().toISOString().slice(0, 10) + '.xls'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const renderIncidentField = (field: IncidentField) => {
    const value = incidentData[field.code] || ''
    const disabled = incidentLocked || saving
    const wide = field.type === 'textarea' || field.type === 'radio'
    const reporterOptions = staffOptions.filter(staff => staff.room_name === (incidentData.E2 || ''))
    const reporterSelectValue = incidentStaffId || (value ? '__unmapped__' : '')
    return <div className={'psField' + (wide ? ' full' : '')} key={field.code}>
      <label className="psLabel">{field.code} · {field.label} <span className="psRequired">*</span></label>
      {field.hint ? <div className="psHint">{field.hint}</div> : null}
      {field.code === 'E1' ? <><select value={reporterSelectValue} disabled={disabled} onChange={event => {
        const value = event.target.value
        if (value === '__external__') { setIncidentStaffId(''); setIncidentValue('E1', 'Pelapor bukan tenaga AUREKA / identitas belum dipetakan'); return }
        const staff = reporterOptions.find(item => item.id === value)
        setIncidentStaffId(staff?.id || '')
        setIncidentValue('E1', staff?.display_name || '')
      }}>
        <option value="">Pilih pelapor dari roster terkunci unit…</option>
        {value && !incidentStaffId ? <option value="__unmapped__" disabled>Nama lama belum terhubung ke identitas AUREKA</option> : null}
        {reporterOptions.map(staff => <option key={staff.id} value={staff.id}>{staff.display_name} — {staff.employee_code} · {staff.profession_group}</option>)}
        <option value="__external__">Pelapor bukan tenaga AUREKA / identitas belum dapat dipetakan</option>
      </select><div className="psHint">{incidentStaffId ? 'Identitas pelapor tertaut ke staff_id AUREKA dan terkunci pada unit laporan.' : value ? 'Nama yang tersimpan belum terhubung ke ID kanonik. Pilih tenaga yang benar jika pelapor merupakan staf rumah sakit.' : 'Untuk pelapor internal, pilih tenaga yang sudah terkunci pada roster unit. Pelapor dari luar direktori dapat dipilih pada opsi terakhir.'}</div></>
      : field.type === 'radio' ? <div className="psRadioGrid">
        {(field.options || []).map(option => <label className="psRadio" key={option}>
          <input type="radio" name={'incident-' + field.code} value={option} checked={value === option} disabled={disabled}
            onChange={() => setIncidentValue(field.code, option)} />
          <span>{option}</span>
        </label>)}
      </div> : field.type === 'textarea' ?
        <textarea value={value} rows={field.code === 'B1' || field.code === 'A8' ? 5 : 3} disabled={disabled}
          onChange={event => setIncidentValue(field.code, event.target.value)} placeholder="Masukkan informasi..." /> :
        field.type === 'select' ?
          <select value={value} disabled={disabled} onChange={event => setIncidentValue(field.code, event.target.value)}>
            <option value="">Pilih unit kerja</option>{roomOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select> :
          <input type={field.type} value={value} disabled={disabled} onChange={event => setIncidentValue(field.code, event.target.value)} />
      }
    </div>
  }
  const renderInvestigationField = (field: IncidentField) => {
    const value = investigationData[field.code] || ''
    const wide = field.type === 'textarea'
    const linkedIncident = incidents.find(row => row.id === investigationIncidentId)
    const unitStaff = staffOptions.filter(staff => staff.room_name === (linkedIncident?.unit_name || ''))
    if (field.code === '5') return <div className="psField full" key={field.code}>
      <label className="psLabel">{field.code} · {field.label}</label>
      <textarea rows={3} value={value} disabled={!canManageWorkflow || saving} onChange={event => setInvestigationValue(field.code, event.target.value)} placeholder="Uraikan pihak yang terlibat; nama yang dipilih di bawah akan ditautkan ke ID AUREKA." />
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,marginTop:9,alignItems:'end'}}>
        <label className="psField"><span className="psLabel">Tautkan tenaga yang terlibat</span>
          <select value={investigationStaffToAdd} disabled={!canManageWorkflow || saving || !unitStaff.length} onChange={event => setInvestigationStaffToAdd(event.target.value)}>
            <option value="">Pilih tenaga dari roster unit insiden…</option>
            {unitStaff.map(staff => <option key={staff.id} value={staff.id}>{staff.display_name} — {staff.employee_code} · {staff.profession_group}</option>)}
          </select>
        </label>
        <button type="button" className="psBtn" disabled={!canManageWorkflow || saving || !investigationStaffToAdd} onClick={() => {
          const staff = unitStaff.find(item => item.id === investigationStaffToAdd)
          if (!staff) return
          setInvestigationStaffIds(current => current.includes(staff.id) ? current : [...current, staff.id])
          setInvestigationData(current => {
            const oldText = String(current['5'] || '')
            const hasName = oldText.split(/[\n;,]/).some(item => item.trim().toLocaleLowerCase('id') === staff.display_name.toLocaleLowerCase('id'))
            return hasName ? current : { ...current, '5': oldText ? oldText + '\n' + staff.display_name : staff.display_name }
          })
          setInvestigationStaffToAdd('')
        }}>Tambah tenaga</button>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:7}}>
        {investigationStaffIds.map(staffId => {
          const staff = staffOptions.find(item => item.id === staffId)
          return <span key={staffId} className="psPill blue" style={{display:'inline-flex',gap:7,alignItems:'center'}}>
            {staff?.display_name || ('ID tenaga ' + staffId.slice(0,8))}
            <button type="button" disabled={!canManageWorkflow || saving} aria-label="Lepaskan tautan identitas" onClick={() => setInvestigationStaffIds(current => current.filter(id => id !== staffId))} style={{border:0,background:'transparent',cursor:'pointer',fontWeight:900}}>×</button>
          </span>
        })}
      </div>
      <div className="psHint">Nama yang dipilih akan disimpan sebagai staff_id terpisah dari catatan teks. Survei budaya tetap anonim dan tidak ditautkan ke direktori.</div>
    </div>
    return <div className={'psField' + (wide ? ' full' : '')} key={field.code}>
      <label className="psLabel">{field.code} · {field.label}</label>
      {field.type === 'textarea' ?
        <textarea rows={3} value={value} disabled={!canManageWorkflow || saving} onChange={event => setInvestigationValue(field.code, event.target.value)} placeholder="Masukkan hasil investigasi..." /> :
        field.type === 'select' ?
          <select value={value} disabled={!canManageWorkflow || saving} onChange={event => setInvestigationValue(field.code, event.target.value)}>
            <option value="">Pilih grading</option>{(field.options || []).map(option => <option key={option}>{option}</option>)}
          </select> :
          <input value={value} disabled={!canManageWorkflow || saving} onChange={event => setInvestigationValue(field.code, event.target.value)} />
      }
    </div>
  }
  const renderSurveyScale = (code: string, options: { value: string; label: string; short?: string }[]) =>
    <div className="psScale" key={code}>{options.map(option =>
      <button type="button" key={option.value} className={surveyAnswers[code] === option.value ? 'selected' : ''}
        aria-pressed={surveyAnswers[code] === option.value} onClick={() => setSurveyAnswer(code, option.value)}>
        {option.label}{option.short ? <span>{option.short}</span> : null}
      </button>
    )}</div>

  const renderSurveyQuestion = (code: string, text: string, options?: { value: string; label: string; short?: string }[]) =>
    <div className="psQuestion" key={code}>
      <div className="psQuestionText"><span className="psQCode">{code}</span><div>{text}</div></div>
      {renderSurveyScale(code, options || [
        { value: '1', label: '1', short: 'STS' }, { value: '2', label: '2', short: 'TS' },
        { value: '3', label: '3', short: 'N' }, { value: '4', label: '4', short: 'S' },
        { value: '5', label: '5', short: 'SS' }, { value: 'TB', label: 'TB' },
      ])}
    </div>

  const surveyCompletion = Math.round(((SURVEY_REQUIRED.length - missingSurvey.length) / SURVEY_REQUIRED.length) * 100)
  const incidentCompletion = Math.round(((INCIDENT_REQUIRED.length - missingIncident.length) / INCIDENT_REQUIRED.length) * 100)
  const statusLabel = (status: string) => ({
    draft: 'Draft', submitted: 'Dikirim', under_review: 'Review', investigation: 'Investigasi', active: 'Berjalan',
    action_planned: 'Rencana Tindakan', closed: 'Closed',
  } as Record<string, string>)[status] || status
  const statusClass = (status: string) => status === 'closed' ? 'green' : status === 'submitted' ? 'blue' : status === 'under_review' || status === 'investigation' || status === 'active' || status === 'action_planned' ? 'amber' : ''

  return <div className="ps">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <LiquidGlass className="psHead">
      <div className="content">
        <div className="psEyebrow">AUREKA · PATIENT SAFETY INTELLIGENCE</div>
        <h3>Keselamatan Pasien</h3>
        <p>Pelaporan IKP, investigasi dan pembelajaran insiden, serta pemetaan budaya keselamatan dan kesejahteraan staf dalam satu workspace.</p>
      </div>
      <div className="psActions content">
        <span className="psPill green">{canManageWorkflow ? 'Workflow Manager' : 'PIC Workspace'}</span>
        <button type="button" className="psBtn" disabled={loading} onClick={() => void loadData()}>{loading ? 'Memuat…' : '↻ Refresh'}</button>
      </div>
    </LiquidGlass>

    <div className="psKpis">
      <LiquidGlass className="psKpi"><span>Laporan IKP</span><strong>{incidents.length}</strong><small>Record yang dapat Anda akses</small></LiquidGlass>
      <LiquidGlass className="psKpi"><span>Belum Closed</span><strong>{incidents.filter(row => row.status !== 'closed').length}</strong><small>Perlu pemantauan</small></LiquidGlass>
      <LiquidGlass className="psKpi"><span>Investigasi Aktif</span><strong>{openInvestigations.length}</strong><small>RCA belum closed</small></LiquidGlass>
      <LiquidGlass className="psKpi"><span>Respons Survey</span><strong>{isSuperAdmin ? responses.length : '—'}</strong><small>{isSuperAdmin ? 'Rekapan dari Supabase' : 'Data agregat terbatas pada Superadmin'}</small></LiquidGlass>
    </div>

    <div className="psTabs glass">
      {([
        { value: 'overview' as const, label: 'Overview' },
        { value: 'incidents' as const, label: 'Laporan IKP' },
        { value: 'investigation' as const, label: 'Investigasi / RCA' },
        { value: 'survey' as const, label: 'Survey Budaya' },
        ...(isSuperAdmin ? [{ value: 'responses' as const, label: 'Rekapan Survey' }] : []),
      ]).map(item =>
        <button type="button" key={item.value} className={'psTab' + (tab === item.value ? ' active' : '')} onClick={() => { setTab(item.value); setError(''); setMessage('') }}>{item.label}</button>
      )}
    </div>

    {error ? <div className="psAlert error">{error}</div> : null}
    {message ? <div className="psAlert">{message}</div> : null}
    {loading ? <div className="psAlert">Memuat data dari Supabase…</div> : null}

    {tab === 'overview' ? <>
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><h4>Alur Kerja Keselamatan Pasien</h4><p>Form operasional berada pada workspace utama; ringkasan tidak mengambil lebar form.</p></div><span className="psPill green">WORKFLOW</span></div>
        <div className="psRcaMap">
          <div className="psRcaNode"><b>01 · Pelaporan</b><span>IKP dibuat dan dikirim oleh pelapor.</span></div>
          <div className="psRcaNode"><b>02 · Review</b><span>Validasi oleh pengelola keselamatan pasien.</span></div>
          <div className="psRcaNode"><b>03 · Investigasi</b><span>CMP / SDP, penyebab, akar masalah.</span></div>
          <div className="psRcaNode"><b>04 · Tindakan</b><span>Rekomendasi dan pengurangan risiko.</span></div>
          <div className="psRcaNode"><b>05 · Pembelajaran</b><span>Efektivitas perbaikan dan closure.</span></div>
        </div>
        <div className="psActions"><button type="button" className="psBtn primary" onClick={() => { newIncident(); setTab('incidents') }}>＋ Buat Laporan IKP</button>
          {canManageWorkflow ? <button type="button" className="psBtn" onClick={() => setTab('investigation')}>Buka Workspace Investigasi</button> : null}</div>
      </LiquidGlass>
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><h4>Insiden Terbaru</h4><p>Daftar mengikuti hak akses Supabase; identitas korban tidak ditampilkan di tabel ringkasan.</p></div><button type="button" className="psBtn" onClick={() => setTab('incidents')}>Lihat Semua</button></div>
        {incidents.length ? <div className="psTableWrap"><table className="psTable"><thead><tr><th>Kode IKP</th><th>Tanggal</th><th>Unit</th><th>Jenis</th><th>Ringkasan</th><th>Status</th><th></th></tr></thead><tbody>
          {incidents.slice(0, 12).map(row => <tr key={row.id}>
            <td><span className="psCode">{row.incident_code}</span></td><td>{row.incident_date || '—'}</td><td>{row.unit_name || '—'}</td>
            <td>{row.incident_type || '—'}</td><td>{row.summary || '—'}</td><td><span className={'psPill ' + statusClass(row.status)}>{statusLabel(row.status)}</span></td>
            <td><button type="button" className="psBtn" onClick={() => openIncident(row)}>Buka</button></td>
          </tr>)}
        </tbody></table></div> : <div className="psEmpty">{error ? 'Data belum dapat dimuat. Periksa migration dan izin Supabase.' : 'Belum ada laporan IKP yang dapat ditampilkan.'}</div>}
      </LiquidGlass>
    </> : null}

    {tab === 'incidents' ? <>
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><h4>Register Laporan IKP</h4><p>Cari, filter status/unit, dan buka laporan untuk meninjau atau melanjutkan draft.</p></div><div className="psActions"><span className="psPill">{filteredIncidents.length} laporan</span><button type="button" className="psBtn primary" onClick={newIncident}>＋ Laporan Baru</button></div></div>
        <div className="psFilterGrid">
          <div className="psFilter"><label>Cari laporan</label><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Kode, unit, jenis, ringkasan…" /></div>
          <div className="psFilter"><label>Status</label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Semua status</option><option value="draft">Draft</option><option value="submitted">Dikirim</option><option value="under_review">Review</option><option value="investigation">Investigasi</option><option value="closed">Closed</option></select></div>
          <div className="psFilter"><label>Unit</label><select value={unitFilter} onChange={event => setUnitFilter(event.target.value)}><option value="all">Semua unit</option>{Array.from(new Set(incidents.map(row => row.unit_name).filter(Boolean))).sort().map(unit => <option key={unit}>{unit}</option>)}</select></div>
          <div className="psFilter"><label>Data tersedia</label><div className="psPill green">{incidents.length} record</div></div>
        </div>
        {filteredIncidents.length ? <div className="psTableWrap"><table className="psTable"><thead><tr><th>Kode</th><th>Tanggal</th><th>Unit</th><th>Jenis</th><th>Ringkasan</th><th>Status</th><th></th></tr></thead><tbody>
          {filteredIncidents.map(row => <tr key={row.id}><td><span className="psCode">{row.incident_code}</span></td><td>{row.incident_date || '—'}</td><td>{row.unit_name || '—'}</td><td>{row.incident_type || '—'}</td><td>{row.summary || '—'}</td><td><span className={'psPill ' + statusClass(row.status)}>{statusLabel(row.status)}</span></td><td><button type="button" className="psBtn" onClick={() => openIncident(row)}>Buka</button></td></tr>)}
        </tbody></table></div> : <div className="psEmpty">{incidents.length ? 'Tidak ada laporan sesuai filter.' : 'Belum ada laporan IKP yang dapat ditampilkan.'}</div>}
      </LiquidGlass>
      {formOpen ? <PsFormModal label={incidentId ? 'Laporan ' + incidentCode : 'Laporan IKP baru'}>
      <div className="psModalTop">
      <div className="psModalBar">
        <button type="button" className="psBackBtn" onClick={() => closeForm()}><span aria-hidden="true">←</span> Kembali ke daftar laporan</button>
        <span className="psModalTitle">{incidentId ? incidentCode : 'Laporan IKP baru'}</span>
        <button type="button" className="psCloseBtn" aria-label="Tutup formulir" onClick={() => closeForm()}>✕</button>
      </div>
      {confirmClose ? <div className="psConfirm" role="alert"><span>Ada isian yang belum disimpan. Tutup formulir tanpa menyimpan?</span><div className="psActions"><button type="button" className="psBtn" onClick={() => setConfirmClose(false)}>Lanjut mengisi</button>{!incidentLocked ? <button type="button" className="psBtn primary" disabled={saving} onClick={() => { setConfirmClose(false); void saveIncident('draft') }}>Simpan Draft</button> : null}<button type="button" className="psBtn danger" onClick={() => closeForm(true)}>Tutup tanpa simpan</button></div></div> : null}
      </div>
      {error ? <div className="psAlert error">{error}</div> : null}
      {message ? <div className="psAlert">{message}</div> : null}
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><div className="psEyebrow">FORMULIR LAPORAN · INSIDEN KESELAMATAN PASIEN</div><h4>{incidentId ? 'Laporan ' + incidentCode : 'Laporan Insiden Keselamatan Pasien'}</h4><p>RAHASIA — UNTUK KEPENTINGAN INTERNAL. Pelaporan untuk pembelajaran dan perbaikan sistem, bukan untuk mencari kesalahan atau menghukum individu (non-punitive). Mohon laporkan maksimal 2×24 jam setelah kejadian.</p></div>
          <div className="psActions"><span className="psPill green">{incidentStatus === 'draft' ? 'Draft' : statusLabel(incidentStatus)}</span></div>
        </div>
        <div className="psMetaGrid">
          <div className="psMeta"><span>Kode Laporan</span><strong>{incidentCode || 'Dibuat saat disimpan'}</strong></div>
          <div className="psMeta"><span>Status Form</span><strong>{statusLabel(incidentStatus)}</strong></div>
          <div className="psMeta"><span>Kelengkapan</span><strong>{incidentCompletion}%</strong></div>
          <div className="psMeta"><span>Field wajib belum lengkap</span><strong>{missingIncident.length}</strong></div>
        </div>
        <div className="psAlert warn" style={{ marginBottom: 10 }}>Tanda <b>*</b> menunjukkan pertanyaan wajib diisi. Nama pelapor tidak ditampilkan dalam ringkasan daftar insiden; akses rekaman dibatasi oleh row-level security.</div>
        {INCIDENT_SECTIONS.map(section => <section className="psFormSection" key={section.letter}>
          <div className="psFormHeading"><span className="psFormLetter">{section.letter}</span><div><h4>{section.title}</h4><p>Formulir sumber · Bagian {section.letter}</p></div></div>
          <div className="psFormGrid">{section.fields.map(renderIncidentField)}</div>
        </section>)}
        <div className="psFormFooter"><div className="psMuted" style={{ fontSize: 10 }}>{incidentCode ? 'Kode: ' + incidentCode : 'Draft baru — kode dibuat oleh backend saat tersimpan.'}</div>
          <div className="psActions">
            {canManageWorkflow && incidentId ? <>
              <select aria-label="Status workflow insiden" value={incidentStatus} disabled={saving} onChange={event => setIncidentStatus(event.target.value as IncidentStatus)} style={{ minHeight: 41, border: '1px solid rgba(35,63,50,.12)', borderRadius: 12, background: 'rgba(255,255,255,.72)', padding: '8px 10px', fontSize: 10 }}>
                <option value="draft">Draft</option><option value="submitted">Dikirim</option><option value="under_review">Review</option><option value="investigation">Investigasi</option><option value="closed">Closed</option>
              </select>
              <button type="button" className="psBtn primary" disabled={saving} onClick={() => void saveIncident(incidentStatus)}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button>
            </> : <>
              <button type="button" className="psBtn" disabled={saving || incidentLocked} onClick={() => void saveIncident('draft')}>Simpan Draft</button>
              <button type="button" className="psBtn primary" disabled={saving || incidentLocked} onClick={() => void saveIncident('submitted')}>{saving ? 'Menyimpan…' : 'Simpan & Kirim Review'}</button>
            </>}
          </div>
        </div>
      </LiquidGlass>
      </PsFormModal> : null}
    </> : null}

    {tab === 'investigation' ? <>
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><div className="psEyebrow">INVESTIGATION WORKSPACE</div><h4>Hasil Investigasi / Root Cause Analysis</h4><p>Form investigasi menggunakan kanvas penuh. Field mengikuti formulir investigasi yang disediakan.</p></div>
          <span className="psPill amber">{canManageWorkflow ? 'Pengelola Investigasi' : 'Akses Baca'}</span>
        </div>
        {!canManageWorkflow ? <div className="psAlert warn">Akses penyuntingan investigasi dibatasi untuk Admin, Komite PMKP, dan Manajemen. Pelapor tetap dapat melihat investigasi yang terkait dengan laporan miliknya.</div> : null}
        <div className="psFormGrid" style={{ marginBottom: 14 }}>
          <div className="psField full"><label className="psLabel">Pilih Laporan IKP</label>
            <select value={investigationIncidentId} disabled={!canManageWorkflow || saving} onChange={event => setInvestigationIncidentId(event.target.value)}>
              <option value="">Pilih insiden yang akan diinvestigasi</option>
              {incidents.map(row => <option key={row.id} value={row.id}>{row.incident_code} · {row.unit_name} · {row.summary || row.incident_type || 'Tanpa ringkasan'}</option>)}
            </select>
          </div>
          <div className="psField"><label className="psLabel">Kode Investigasi</label><input value={investigationCode || 'Dibuat saat disimpan'} readOnly /></div>
          <div className="psField"><label className="psLabel">Status Investigasi</label><select value={investigationStatus} disabled={!canManageWorkflow || saving} onChange={event => setInvestigationStatus(event.target.value)}><option value="draft">Draft</option><option value="active">Investigasi berjalan</option><option value="action_planned">Rencana tindakan</option><option value="closed">Closed</option></select></div>
        </div>
        {investigationIncidentId ? <div className="psRcaMap"><div className="psRcaNode"><b>01 · Problem</b><span>CMP / SDP</span></div><div className="psRcaNode"><b>02 · Cause</b><span>Penyebab langsung & faktor kontributor</span></div><div className="psRcaNode"><b>03 · Root</b><span>Akar masalah</span></div><div className="psRcaNode"><b>04 · Response</b><span>Rekomendasi dan tindakan</span></div><div className="psRcaNode"><b>05 · Risk Reduction</b><span>Pasien, petugas, fasyankes</span></div></div> : null}
        {investigationIncidentId ? INVESTIGATION_SECTIONS.map(section => <section className="psFormSection" key={section.title}>
          <div className="psFormHeading"><span className="psFormLetter">{section.title === 'Klasifikasi & Masalah' ? '1' : section.title === 'Analisis Penyebab' ? '2' : section.title === 'Faktor Mitigasi & Deteksi' ? '3' : '4'}</span><div><h4>{section.title}</h4><p>Bagian analisis investigasi</p></div></div>
          <div className="psFormGrid">{section.codes.map(code => INVESTIGATION_FIELDS.find(field => field.code === code)).filter((field): field is IncidentField => Boolean(field)).map(renderInvestigationField)}</div>
        </section>) : <div className="psEmpty">Pilih laporan terlebih dahulu untuk membuka formulir investigasi.</div>}
        {investigationIncidentId && canManageWorkflow ? <div className="psFormFooter"><div className="psMuted" style={{ fontSize: 10 }}>Status: {statusLabel(investigationStatus)}</div><div className="psActions"><button type="button" className="psBtn" onClick={() => { setInvestigationData(emptyRecord()); setInvestigationStatus('draft'); setInvestigationId(''); setInvestigationCode('') }}>Kosongkan Form</button><button type="button" className="psBtn primary" disabled={saving} onClick={() => void saveInvestigation()}>{saving ? 'Menyimpan…' : 'Simpan Investigasi'}</button></div></div> : null}
      </LiquidGlass>
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><h4>Register Investigasi</h4><p>Daftar disaring oleh kebijakan akses Supabase.</p></div><span className="psPill">{investigations.length} record</span></div>
        {investigations.length ? <div className="psTableWrap"><table className="psTable"><thead><tr><th>Kode RCA</th><th>Insiden</th><th>Status</th><th>Diubah</th><th></th></tr></thead><tbody>
          {investigations.map(row => <tr key={row.id}><td><span className="psCode">{row.investigation_code}</span></td><td>{incidents.find(item => item.id === row.incident_id)?.incident_code || 'Insiden terkait'}</td><td><span className={'psPill ' + statusClass(row.status)}>{statusLabel(row.status)}</span></td><td>{new Date(row.updated_at).toLocaleDateString('id-ID')}</td><td><button type="button" className="psBtn" onClick={() => { setInvestigationIncidentId(row.incident_id); setTab('investigation') }}>Buka</button></td></tr>)}
        </tbody></table></div> : <div className="psEmpty">Belum ada investigasi yang dapat ditampilkan.</div>}
      </LiquidGlass>
    </> : null}

    {tab === 'survey' ? <div className="psSurveyShell">
      <LiquidGlass className="psSurveyIntro">
        <div className="psEyebrow">SAFETY CULTURE · ANONYMOUS RESPONSE</div>
        <h3>Survey Budaya Keselamatan Pasien & Kesejahteraan Staf</h3>
        <p>Instrumen ini memetakan budaya keselamatan, kerja tim, ketersediaan sumber daya, beban psikologis, dan kesejahteraan staf. Satu pengisian selalu disimpan sebagai rekaman baru, termasuk ketika perangkat atau akun AUREKA yang sama digunakan berulang kali.</p>
        <div className="psPrivacy"><b>Anonim dan rahasia.</b> Skema respons tidak menyimpan user ID, alamat email, atau identitas akun pengisi. Respons lama tidak diperbarui/ditimpa. Estimasi pengisian 15–20 menit. Untuk item yang tidak relevan, pilih TB, jangan dikosongkan.</div>
        <div className="psSurveyMeta">
          <div><label>Periode Survey</label><select value={surveyPeriod} onChange={event => setSurveyPeriod(event.target.value)}><option>2026-Q4</option><option>2027-Q1</option><option>2027-Q2</option><option>2027-Q3</option><option>2027-Q4</option><option>2028-Q1</option></select></div>
          <div><label>Unit Kerja</label><select value={surveyUnit} onChange={event => setSurveyUnit(event.target.value)}><option value="">Pilih unit</option>{roomOptions.map(name => <option key={name}>{name}</option>)}</select></div>
          <div><label>Profesi / Kelompok Jabatan</label><select value={surveyProfession} onChange={event => setSurveyProfession(event.target.value)}><option value="">Pilih</option>{['Medis / Dokter','Perawat / Bidan','Farmasi','Penunjang Medis','Manajemen / Administrasi','Lainnya'].map(name => <option key={name}>{name}</option>)}</select></div>
          <div><label>Lama Bekerja di RS</label><select value={surveyHospitalTenure} onChange={event => setSurveyHospitalTenure(event.target.value)}><option value="">Pilih (opsional)</option>{['< 1 tahun','1–5 tahun','6–10 tahun','> 10 tahun'].map(name => <option key={name}>{name}</option>)}</select></div>
          <div><label>Lama Bekerja di Unit Saat Ini</label><select value={surveyUnitTenure} onChange={event => setSurveyUnitTenure(event.target.value)}><option value="">Pilih (opsional)</option>{['< 1 tahun','1–5 tahun','6–10 tahun','> 10 tahun'].map(name => <option key={name}>{name}</option>)}</select></div>
          <div><label>Pola Kerja / Shift</label><select value={surveyShift} onChange={event => setSurveyShift(event.target.value)}><option value="">Pilih (opsional)</option>{['Non-shift (jam kerja reguler)','Shift tanpa dinas malam','Shift dengan dinas malam / rotasi'].map(name => <option key={name}>{name}</option>)}</select></div>
          <div><label>Peran Utama</label><select value={surveyRole} onChange={event => setSurveyRole(event.target.value)}><option value="">Pilih (opsional)</option>{['Staf pelaksana (klinis / non-klinis)','Penyelia / Kepala Ruangan / Manajerial'].map(name => <option key={name}>{name}</option>)}</select></div>
          <div><label>Interaksi Langsung dengan Pasien</label><select value={surveyPatientContact} onChange={event => setSurveyPatientContact(event.target.value)}><option value="">Pilih (opsional)</option><option>Ya</option><option>Tidak</option></select></div>
        </div>
        <div className="psFormFooter"><div><span className="psPill blue">{SURVEY_REQUIRED.length - missingSurvey.length} / {SURVEY_REQUIRED.length} item terjawab · {surveyCompletion}%</span>{lastResponseCode ? <div className="psMuted" style={{ fontSize: 9, marginTop: 5 }}>Respons terakhir tersimpan: {lastResponseCode}</div> : null}</div><div className="psActions">
          <button type="button" className="psBtn" disabled={saving} onClick={resetSurvey}>Responden Baru / Reset</button>
          <button type="button" className="psBtn primary" disabled={saving} onClick={() => void submitSurvey()}>{saving ? 'Menyimpan…' : 'Kirim Respons Anonim'}</button>
        </div></div>
      </LiquidGlass>

      {SURVEY_DIMENSIONS.map(dimension => <LiquidGlass className="psDim" key={dimension.code}>
        <div className="psDimHead"><div><span>DIMENSI {dimension.code}</span><h4>{dimension.title}</h4></div><small>{dimension.items.length} item</small></div>
        {dimension.items.map(item => renderSurveyQuestion(item.code, item.text))}
      </LiquidGlass>)}

      <LiquidGlass className="psDim">
        <div className="psDimHead"><div><span>ITEM FREKUENSI</span><h4>Pengalaman Kekerasan Verbal</h4></div><small>B26</small></div>
        {renderSurveyQuestion('B26', 'Dalam 12 bulan terakhir, seberapa sering Anda mengalami tindakan kekerasan verbal (dibentak / diancam / dihina) dari pasien, keluarga, atau pengunjung di tempat kerja?',
          [{ value: '0', label: 'Tidak pernah' }, { value: '1', label: '1–2 kali' }, { value: '2', label: '3–5 kali' }, { value: '3', label: 'Lebih dari 5 kali' }])}
      </LiquidGlass>

      <LiquidGlass className="psDim">
        <div className="psDimHead"><div><span>DIMENSI XII</span><h4>Kesejahteraan Positif (WHO-5 Well-Being Index)</h4></div><small>C10–C14</small></div>
        <div className="psAlert" style={{ marginBottom: 10 }}>Skala frekuensi dua minggu terakhir: 0 Tidak pernah · 1 Kadang-kadang · 2 Kurang dari separuh waktu · 3 Lebih dari separuh waktu · 4 Sebagian besar waktu · 5 Sepanjang waktu.</div>
        <div className="psWhoGrid">{WHO_ITEMS.map(item => <div className="psWho" key={item.code}><b>{item.code}</b><span>{item.text}</span>
          {renderSurveyScale(item.code, [0,1,2,3,4,5].map(value => ({ value: String(value), label: String(value) })))}
        </div>)}</div>
      </LiquidGlass>

      <LiquidGlass className="psDim">
        <div className="psDimHead"><div><span>BAGIAN D</span><h4>Skrining Burnout — Item Tunggal Tervalidasi</h4></div><small>D1</small></div>
        <div className="psBurnout">{[
          'Saya menikmati pekerjaan saya. Saya tidak mengalami gejala burnout (kelelahan kerja).',
          'Saya terkadang merasa stres, tetapi saya tidak memiliki gejala burnout.',
          'Saya mulai mengalami burnout. Saya memiliki satu atau lebih gejala, seperti kelelahan fisik/emosional, namun masih bisa mengatasinya.',
          'Gejala burnout yang saya alami sudah mulai mengganggu, sehingga sulit bagi saya untuk tidak memikirkannya bahkan saat sedang tidak bekerja.',
          'Saya merasa sepenuhnya kehabisan tenaga (burnout berat) dan sering berpikir bahwa saya tidak sanggup lagi melakukan pekerjaan ini.',
        ].map((text, index) => <button type="button" key={index} className={surveyAnswers.D1 === String(index + 1) ? 'selected' : ''} onClick={() => setSurveyAnswer('D1', String(index + 1))}><b>Skor {index + 1}</b><span>{text}</span></button>)}</div>
      </LiquidGlass>

      <LiquidGlass className="psDim">
        <div className="psDimHead"><div><span>BAGIAN E</span><h4>Indikator Hasil (Outcome Measures)</h4></div><small>E1–E2</small></div>
        {renderSurveyQuestion('E1', 'Beri nilai keseluruhan untuk budaya/kondisi keselamatan pasien di unit kerja Anda saat ini.',
          [{ value: '1', label: '1 · Buruk' }, { value: '2', label: '2 · Kurang' }, { value: '3', label: '3 · Cukup' }, { value: '4', label: '4 · Baik' }, { value: '5', label: '5 · Sangat Baik' }])}
        {renderSurveyQuestion('E2', 'Dalam 12 bulan terakhir, berapa kali Anda melaporkan insiden/kejadian nyaris cedera (near-miss) keselamatan pasien?',
          [{ value: '0', label: 'Tidak pernah' }, { value: '1', label: '1–2 kali' }, { value: '2', label: '3–5 kali' }, { value: '3', label: '6–10 kali' }, { value: '4', label: '> 10 kali' }])}
        <div className="psAlert warn" style={{ marginTop: 12 }}>Item B17 bertanda (R) dalam instrumen sumber. AUREKA menyimpan jawaban mentah dan tidak menerapkan reverse scoring otomatis sebelum formula skoring disepakati.</div>
      </LiquidGlass>
      <LiquidGlass className="psPanel">
        <div className="psFormFooter" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <div><span className="psPill blue">{SURVEY_REQUIRED.length - missingSurvey.length} / {SURVEY_REQUIRED.length} item terjawab</span></div>
          <div className="psActions"><button type="button" className="psBtn" disabled={saving} onClick={resetSurvey}>Reset Pengisian</button><button type="button" className="psBtn primary" disabled={saving} onClick={() => void submitSurvey()}>{saving ? 'Menyimpan…' : 'Kirim Respons Anonim'}</button></div>
        </div>
      </LiquidGlass>
    </div> : null}

    {tab === 'responses' && isSuperAdmin ? <>
      <LiquidGlass className="psPanel">
        <div className="psSectionHead"><div><div className="psEyebrow">SUPERADMIN · RESPONSE REPOSITORY</div><h4>Rekapan Survey Budaya Keselamatan</h4><p>Seluruh respons yang sudah tersimpan di Supabase. Satu submission menghasilkan response ID baru dan tidak menimpa respons lama.</p></div><div className="psActions"><button type="button" className="psBtn primary" onClick={exportResponses}>Unduh Excel (.xls)</button></div></div>
        <div className="psFilterGrid">
          <div className="psFilter"><label>Periode</label><select value={responsePeriodFilter} onChange={event => setResponsePeriodFilter(event.target.value)}><option value="">Semua periode</option>{Array.from(new Set(responses.map(row => row.survey_period))).sort().map(period => <option key={period}>{period}</option>)}</select></div>
          <div className="psFilter"><label>Unit</label><select value={responseUnitFilter} onChange={event => setResponseUnitFilter(event.target.value)}><option value="">Semua unit</option>{Array.from(new Set(responses.map(row => row.unit_name))).sort().map(unit => <option key={unit}>{unit}</option>)}</select></div>
          <div className="psFilter"><label>Cari Response ID</label><input value={responseSearch} onChange={event => setResponseSearch(event.target.value)} placeholder="SC-YYYYMMDD-…" /></div>
          <div className="psFilter"><label>Jumlah Respons</label><div className="psPill green">{responseRows.length} dari {responses.length}</div></div>
        </div>
      </LiquidGlass>
      <LiquidGlass className="psPanel">
        {responseRows.length ? <div className="psTableWrap"><table className="psTable"><thead><tr><th>Response ID</th><th>Waktu Submit</th><th>Periode</th><th>Unit</th><th>Profesi</th><th>Shift</th><th>Item</th><th>E1</th><th>D1</th></tr></thead><tbody>
          {responseRows.map(row => <tr key={row.response_id}><td><span className="psCode">{row.response_code}</span></td><td>{new Date(row.submitted_at).toLocaleString('id-ID')}</td><td>{row.survey_period}</td><td>{row.unit_name}</td><td>{row.profession_group}</td><td>{row.shift_pattern || '—'}</td><td>{row.answered_item_count}</td><td>{row.answers?.E1 || '—'}</td><td>{row.answers?.D1 || '—'}</td></tr>)}
        </tbody></table></div> : <div className="psEmpty">Belum ada respons yang cocok dengan filter.</div>}
        <div className="psAlert" style={{ marginTop: 12 }}>Rekapan Excel berisi dua sheet: ringkasan per respons dan jawaban per item. Tidak ada kolom akun, email, atau user ID responden.</div>
      </LiquidGlass>
    </> : null}

    {tab === 'responses' && !isSuperAdmin ? <LiquidGlass className="psPanel"><div className="psEmpty">Rekapan jawaban mentah hanya tersedia bagi Superadmin.</div></LiquidGlass> : null}
    <div className="psMuted" style={{ fontSize: 9, padding: '2px 4px' }}>Data operasional disimpan di Supabase. Preview modul tidak menggunakan localStorage untuk menyimpan informasi pasien atau jawaban survei.</div>
  </div>
}
