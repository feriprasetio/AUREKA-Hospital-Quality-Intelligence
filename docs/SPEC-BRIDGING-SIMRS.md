# Spesifikasi Database Pasien & Bridging SIMRS / SATUSEHAT

Versi 1.0 — 11 November 2026 · AUREKA (RSUD Sultan Syarif Mohamad Alkadrie)

## 1. Tujuan
Database Pasien (Master Patient Index, MPI) di modul **Register Pasien → Database Pasien** menyimpan **satu baris per pasien**
dengan **No. Rekam Medis (No. RM) sebagai kunci utama**. Indeks ini diisi otomatis dari Logbook episode pasien semua unit
dan menjadi titik temu untuk bridging dua arah dengan **SIMRS RS** dan **SATUSEHAT Kemenkes**.

## 2. Kunci utama: No. Rekam Medis
| Aturan | Contoh |
|---|---|
| Hanya angka yang dipakai; tanda kutip, spasi, strip, garis miring dibuang | `'21-76-01` → `21-76-01` |
| 1–6 digit → dilengkapi nol di depan, ditulis `XX-XX-XX` (format RSUD) | `36539` → `03-65-39`, `92` → `00-00-92` |
| 7–12 digit → disimpan angka saja (cadangan bila SIMRS memakai No. RM lebih panjang) | `1234567` |
| Berisi huruf atau berbentuk tanggal → **ditolak** dan masuk daftar *No. RM bermasalah* | `Sat Nov 08 2025 …`, `11/09/1967` |

Fungsi database: `aureka_quality.normalize_no_rm(text)`. Aturan yang sama wajib dipakai SIMRS saat mengirim/menerima data.

> Catatan data saat ini (sampel 6.000 episode): ±78% berformat `XX-XX-XX`, ±22% kehilangan nol depan akibat Excel,
> beberapa berisi tanggal. Tanpa normalisasi, satu pasien bisa tercatat ganda.

## 3. Kamus data `aureka_quality.patient_index`
| Kolom | Tipe | Sumber | Keterangan |
|---|---|---|---|
| `no_rm` | text **PK** | AUREKA/SIMRS | Hasil normalisasi (§2) |
| `nama_pasien` | text | AUREKA | Nama terbaru dari Logbook |
| `nik` | text(16) | SIMRS | Hanya 16 digit angka |
| `no_ihs` | text | SATUSEHAT | ID Patient SATUSEHAT (IHS number) |
| `simrs_patient_id` | text | SIMRS | ID internal pasien di SIMRS |
| `tanggal_lahir` | date | SIMRS | |
| `jenis_kelamin` | `L` / `P` | SIMRS | |
| `alamat`, `telepon` | text | SIMRS | |
| `first_seen`, `last_seen` | date | AUREKA | Kunjungan pertama/terakhir tercatat |
| `total_episode` | int | AUREKA | Jumlah episode di semua unit |
| `room_ids` | bigint[] | AUREKA | Unit yang pernah melayani (dasar hak akses) |
| `unit_terakhir`, `diagnosis_terakhir` | text | AUREKA | Dari episode terbaru |
| `bridging_status` | enum | Sistem | `belum_terhubung` → `menunggu` → `terhubung` / `gagal` / `konflik` |
| `bridging_at`, `bridging_note` | | Sistem | Waktu & catatan sinkron terakhir |

AUREKA **tidak** mengisi NIK, tanggal lahir, jenis kelamin, alamat, atau telepon sendiri. Kolom itu hanya diisi dari SIMRS.

## 4. Pengisian & sinkronisasi di AUREKA
- **Otomatis:** trigger `patient_index_sync` pada `quality_records` (grain `patient_episode`) memperbarui indeks setiap ada input atau impor.
- **Sinkron ulang:** `aureka_patient_index_sync()` (khusus Super Admin) membangun ulang indeks dari seluruh Logbook. Kolom SIMRS dan bridging tidak ditimpa.
- **Cari:** `aureka_patient_index_search(query, limit, offset)` mencari No. RM (dengan/tanpa strip), nama, atau NIK.
- **Ringkasan:** `aureka_patient_index_summary()`. **Data bermasalah:** `aureka_patient_index_invalid_rm(limit)`.

## 5. Keamanan & privasi
- Tabel tidak bisa dibaca langsung (RLS aktif tanpa policy). Akses hanya lewat fungsi di atas, yang memeriksa
  `aureka_system.has_quality_room_access(room)`: PIC unit hanya melihat pasien yang pernah dilayani di unitnya.
- Identitas (nama, NIK) disamarkan secara bawaan di tampilan.
- Dasar kepatuhan: UU No. 27/2022 (Pelindungan Data Pribadi) dan Permenkes No. 24/2022 (Rekam Medis Elektronik).
  Bridging memakai kanal terenkripsi (HTTPS) dan kredensial server, **bukan** dari browser.

## 6. Arsitektur bridging (rencana)
```
SIMRS ──(HTTPS + HMAC, kredensial server)──► Edge Function "simrs-bridge" ──► patient_index (kolom SIMRS)
                                                     │
                                                     └──► SATUSEHAT (OAuth2 client credentials) ──► no_ihs
```
1. **SIMRS → AUREKA (push):** SIMRS mengirim data demografi per No. RM (NIK, tgl lahir, JK, alamat, telepon, ID SIMRS).
   AUREKA menormalisasi No. RM lalu upsert. Jika nama berbeda jauh dari Logbook → `konflik` untuk ditinjau.
2. **AUREKA → SATUSEHAT (pull IHS):** dengan NIK dari SIMRS, ambil ID Patient (IHS number) dari Master Patient Index SATUSEHAT, simpan ke `no_ihs`.
3. **Idempoten:** kunci = No. RM; pengiriman ulang tidak membuat data ganda.
4. **Audit:** setiap sinkron dicatat (waktu, sumber, hasil) — tabel audit ditambahkan bersama Edge Function bridging.

### Pemetaan ke SATUSEHAT `Patient` (FHIR R4)
| Kolom AUREKA | Elemen FHIR | Catatan |
|---|---|---|
| `nik` | `identifier` system `https://fhir.kemkes.go.id/id/nik`, use `official` | |
| `no_ihs` | `id` / identifier `https://fhir.kemkes.go.id/id/patient-ihs-number` | dari MPI SATUSEHAT |
| `no_rm` | `identifier` No. RM (sistem milik RS) | sistem MRN mengikuti ketentuan SATUSEHAT terbaru |
| `nama_pasien` | `name[0].text` (use `official`) | |
| `jenis_kelamin` | `gender` (`male`/`female`) | L→male, P→female |
| `tanggal_lahir` | `birthDate` | |
| `alamat`, `telepon` | `address`, `telecom` | |

Diagnosis episode dikirim terpisah (resource Encounter/Condition dengan kode ICD-10), bukan bagian dari indeks pasien.

## 7. Persyaratan & sertifikasi sebelum bridging
1. **Registrasi fasyankes di SATUSEHAT** untuk memperoleh *Organization ID*, *Client ID*, dan *Client Secret*. Kredensial atas nama RS dan disimpan sebagai secret server.
2. **Uji di sandbox SATUSEHAT:** autentikasi, format, validasi per resource. Lulus sandbox belum menjamin lulus produksi.
3. **Pemetaan lokasi & identitas:** unit layanan sebagai `Location`, nakes (NIK→IHS) dan pasien (NIK→IHS).
4. **Uji per resource:** kirim bertahap, pastikan pengiriman ulang tidak menggandakan data.
5. **Produksi:** ganti ke kredensial produksi, kirim di luar jam sibuk, pantau harian (terkirim / ditahan / gagal).
6. **Kesepakatan dengan vendor SIMRS:** format payload, aturan normalisasi No. RM (§2), jadwal sinkron, dan penanggung jawab data.

Status saat ini: **struktur & indeks siap**; Edge Function bridging dan kredensial SATUSEHAT belum dipasang.

## 8. Referensi
- Dokumentasi SATUSEHAT — Patient: https://dokumentasisatusehat-stg.dto.kemkes.go.id/resource-and-terminologi/daftar-resources-and-terminologi/patient
- Panduan integrasi rumah sakit dengan SATUSEHAT (MedMinutes): https://medminutes.io/cara-integrasi-satusehat-rumah-sakit.html
- Indonesia SATUSEHAT FHIR R4 Implementation Guide: https://simplifier.net/guide/indonesia-satusehat-ihs-fhir-r4
