# aureka-tanya — Tanya AUREKA

Asisten AI (Google Gemini) yang menjawab pertanyaan berdasarkan data AUREKA sesuai hak akses pengguna (RLS).

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

## Data yang dikirim ke AI
- Ringkasan hitungan register risiko, rencana tindak, IKP (jenis/status/unit/bulan), dan jumlah episode logbook mutu.
- 15 risiko dengan skor tertinggi (kode, unit, peristiwa risiko, level, status, tenggat).
- **Tidak** ada nama/No. RM pasien maupun kronologi IKP.

Batas: 20 pertanyaan per pengguna per 10 menit (di samping kuota gratis Gemini).
