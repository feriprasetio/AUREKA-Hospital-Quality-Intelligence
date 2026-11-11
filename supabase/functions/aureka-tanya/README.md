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

Opsional: `GEMINI_MODEL` (bawaan `gemini-flash-latest`) dan `GEMINI_FALLBACK_MODEL` (bawaan `gemini-flash-lite-latest`, dipakai otomatis saat model utama sibuk).

## Banyak API (opsional)
- Isi `GROQ_API_KEY` dan/atau `GEMINI_API_KEY`. Keduanya boleh diisi bersamaan.
- Satu secret boleh berisi **beberapa kunci**, dipisah koma (mis. `gsk_aaa,gsk_bbb`). Bila satu kunci kena batas kuota, kunci berikutnya dipakai otomatis.
- Urutan penyedia: secret `AI_PROVIDER_ORDER` (bawaan `gemini,groq`). Penyedia tanpa kunci dilewati.
- Model Groq: `openai/gpt-oss-120b` → `llama-3.3-70b-versatile` → `openai/gpt-oss-20b` → `llama-3.1-8b-instant` (atur dengan `GROQ_MODEL`).

## Data yang dikirim ke AI
- Register risiko: jumlah per level, **jumlah per unit per level (semua unit)**, status, lewat tenggat, 10 contoh risiko skor tertinggi.
- Logbook Mutu Klinis tahun berjalan: jumlah entri per unit per triwulan, bulan tanpa entri, dan **daftar unit yang belum input per triwulan**.
- IKP: hanya hitungan per jenis/unit/bulan (tanpa identitas, kronologi, atau isi laporan).
- Daftar menu AUREKA yang asli, agar AI tidak mengarang menu.

Batas: 20 pertanyaan per pengguna per 10 menit (di samping kuota gratis penyedia AI).
