# aureka-tanya — Tanya AUREKA

Asisten AI (Groq dan/atau Google Gemini) yang menjawab pertanyaan berdasarkan data AUREKA sesuai hak akses pengguna (RLS).

## Aktivasi (sekali saja)

Kunci API **jangan** ditulis di kode atau di repo. Simpan sebagai secret Supabase:

```bash
supabase secrets set GEMINI_API_KEY=<kunci-dari-Google-AI-Studio> --project-ref ktukmjscopggkzrkgnzp
supabase functions deploy aureka-tanya --project-ref ktukmjscopggkzrkgnzp
```

Atau lewat Dashboard Supabase:
1. Edge Functions → Secrets → tambah `GEMINI_API_KEY`.
2. Edge Functions → Deploy new function → nama `aureka-tanya` → tempel isi `index.ts` → Deploy (biarkan "Verify JWT" aktif).

Opsional: `GEMINI_MODEL` (bawaan `gemini-flash-lite-latest`) dan `GEMINI_FALLBACK_MODEL` (bawaan `gemini-flash-latest`, dipakai otomatis saat model utama sibuk).

## Banyak API (opsional)
| Secret | Penyedia | Catatan |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini | bawaan, urutan 1 |
| `GROQ_API_KEY` | Groq | bawaan, urutan 2 |
| `NVIDIA_API_KEY` | NVIDIA NIM (build.nvidia.com) | bawaan, urutan 3 |
| `DEEPSEEK_API_KEY` | DeepSeek | Dicoba otomatis bila secret tersedia; dapat dinonaktifkan dengan `AI_ENABLE_DEEPSEEK=false` |
| `LLM7_API_KEY` / `LLM7.IO_API_KEY` | LLM7.io | Dicoba otomatis bila secret tersedia; dapat dinonaktifkan dengan `AI_ENABLE_LLM7=false` |

- Satu secret boleh berisi **beberapa kunci**, dipisah koma. Bila satu kunci/penyedia gagal atau kuota habis, kunci/penyedia berikutnya dipakai otomatis.
- Urutan: secret `AI_PROVIDER_ORDER`, mis. `gemini,groq,nvidia` (bawaan `groq,nvidia,gemini,deepseek,llm7`). Penyedia tanpa secret yang valid otomatis dilewati.
- Model bisa diganti per penyedia: `GEMINI_MODEL`, `GROQ_MODEL`, `NVIDIA_MODEL`, `DEEPSEEK_MODEL`, `LLM7_MODEL`.

## Governed Skill Registry

NARA menggunakan 14 skill spesialis yang dipilih backend secara deterministik sebelum model AI dipanggil:

1. Executive Intelligence
2. Quality Intelligence
3. Statistical Intelligence
4. Clinical Intelligence
5. Patient Safety Intelligence
6. Risk Intelligence
7. Visual Intelligence
8. Knowledge Intelligence
9. Workforce Intelligence
10. Audit Intelligence
11. Research Intelligence
12. Data Quality Intelligence
13. Engineering Intelligence
14. Governance Intelligence

Skill spesialis dapat dikombinasikan untuk pertanyaan lintas domain. Batas orkestrasi tetap maksimal lima skill per pertanyaan. Model tidak diberi kewenangan untuk memilih sendiri domain akses data.

## Data minimization dan batas kewenangan

- Autentikasi JWT dan Row Level Security (RLS) Supabase tetap menjadi batas otorisasi utama. Skill policy **tidak menggantikan RLS**.
- Backend hanya menjalankan query untuk domain yang dipilih skill; skill teknis/pengetahuan tidak memuat snapshot rumah sakit. Cache server dipartisi berdasarkan kombinasi domain, dan warmup UI tidak lagi membaca seluruh modul. Snapshot tetap berada di server.
- Sebelum konteks dikirim ke provider, `scopeSnapshotForSkills()` hanya mempertahankan agregat yang relevan dengan domain skill aktif. Kunci snapshot yang tidak dikenal tidak ikut dikirim (fail closed).
- Pertanyaan Engineering, Knowledge, Statistical, Visual, Audit, atau Research tanpa skill domain data yang relevan tidak otomatis menarik snapshot lintas modul.
- Konteks klinis, risiko, keselamatan pasien, SDM, mutu, dan tata kelola tetap berupa agregat yang diminimalkan. Identitas langsung pasien/petugas tidak boleh dikirim ke provider AI.
- Analisis, rekomendasi, dan usulan koding bukan keputusan klinis, persetujuan kebijakan, maupun perubahan data. Tindakan yang mengubah sistem tetap memerlukan kewenangan dan proses terpisah.

## Pemetaan domain snapshot

| Domain skill | Agregat yang dapat disertakan |
|---|---|
| Quality | Profil indikator, logbook, audit klinis terkait mutu, response time konsultasi IGD |
| Risk | Matriks risiko, distribusi risiko, FMEA, rencana tindak terkait risiko |
| Patient Safety | Agregat IKP, investigasi, dan survei budaya keselamatan |
| Clinical | Diagnosis agregat, audit clinical pathway/kematian, response time konsultasi IGD |
| Workforce | Agregat direktori tenaga dan OPPE/FPPE |
| Governance | Ikhtisar tata kelola, rekomendasi, prioritas tahunan, dan tindak lanjut |

## Aktivasi perubahan

Setelah perubahan branch digabungkan ke branch produksi, deploy ulang Edge Function:

```bash
supabase functions deploy aureka-tanya --project-ref ktukmjscopggkzrkgnzp
```

Tidak ada perubahan skema database atau migrasi SQL pada peningkatan skill ini. Secret API yang sudah ada tetap dikelola melalui Supabase Secrets dan tidak perlu dipindahkan ke kode klien.

Batas: 20 permintaan per pengguna per 10 menit, di samping kuota provider AI.
