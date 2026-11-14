# NARA Security & Deployment Runbook

Runbook ini mengunci tata kelola keamanan gateway NARA (`supabase/functions/aureka-tanya`). Frontend AUREKA di GitHub Pages bersifat statis dan publik; semua kredensial provider dan kontrol privasi WAJIB berada di Supabase Edge Function, tidak pernah di repo atau browser.

## 1. Aturan kredensial
- Simpan API key provider hanya sebagai Supabase Edge Function secrets: `GROQ_API_KEY`, `NVIDIA_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `LLM7_API_KEY`.
- Jangan commit key, jangan kirim via chat/issue/log, jangan taruh di `.env` publik atau GitHub Pages.
- Service-role key Supabase hanya untuk server; jangan pernah dikirim ke payload provider AI atau ke klien.

## 2. Kill switch provider (PENTING)
- Sejak PR #355, DeepSeek dan LLM7 bersifat opt-out: aktif default bila key tersedia.
- Gate hanya mengenali string `false` lowercase persis. Nilai `FALSE`, `0`, `off`, atau kosong TIDAK mematikan provider.
- Sampai ada persetujuan vendor/transfer data, set secrets secara eksplisit:
  - `AI_ENABLE_DEEPSEEK=false`
  - `AI_ENABLE_LLM7=false`
- Aktifkan kembali hanya setelah evaluasi privasi dan uji model selesai.

## 3. Batas privasi konteks AI
- Hanya agregat sesuai hak akses yang boleh dikirim ke provider.
- Dilarang mengirim: identitas pasien (nama, No. RM, tanggal lahir), narasi klinis/insiden bebas, detail unit/bulan insiden, dan free-text risiko.
- Test `nara-privacy-boundary` dan `nara-gateway-security` mengunci sebagian aturan ini; perluas bila konteks bertambah.

## 4. Checklist deploy backend
1. Merge PR setelah CI hijau.
2. Deploy fungsi: `supabase functions deploy aureka-tanya --project-ref <PROJECT_REF>` (atau jalankan workflow 'Deploy NARA Edge Function' via workflow_dispatch).
3. Set secrets provider dan kill switch (lihat bagian 2).
4. Verifikasi dari UI: login, buka NARA AI, ajukan pertanyaan agregat; pastikan tidak ada identitas pasien di jawaban/log.
5. Pantau log Edge Function untuk error provider; jangan tampilkan detail mentah ke pengguna.

## 5. Respons insiden
- Bila key dicurigai bocor: rotasi key di dashboard provider, perbarui secret Supabase, deploy ulang fungsi, dan telusuri log akses.
- Bila data pasien terindikasi terkirim ke provider: hentikan provider terkait (kill switch `false`), audit payload konteks, dan laporkan ke Komite PMKP sesuai prosedur keselamatan data.

## 6. Verifikasi lokal yang masih perlu dilakukan
Jalankan dari root repo untuk melengkapi audit file utuh:
- Auth: `grep -n 'Authorization\|getUser\|auth' supabase/functions/aureka-tanya/index.ts`
- CORS: `grep -n 'Access-Control-Allow-Origin' supabase/functions/aureka-tanya/index.ts`
- Rate limit: `grep -n 'rate\|limit\|429' supabase/functions/aureka-tanya/index.ts`
- Identitas pasien: `grep -n 'no_rm\|nama\|tanggal_lahir\|narasi' supabase/functions/aureka-tanya/index.ts`
- Service role: `grep -n 'SERVICE_ROLE' supabase/functions/aureka-tanya/index.ts`
