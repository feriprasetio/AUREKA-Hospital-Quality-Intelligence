# NARA AI Gateway — Implementasi AUREKA

## Tujuan
NARA adalah intelligence layer di belakang antarmuka Tanya AUREKA yang sudah ada. Implementasi ini sengaja tidak mengubah UI, navigasi, stylesheet, layout, atau modul AUREKA.

## Arsitektur
- Frontend yang ada tetap memanggil Supabase Edge Function `aureka-tanya`.
- Semua provider dipanggil hanya dari Edge Function.
- API key tidak pernah dikirim ke browser.
- Database diakses menggunakan JWT pengguna sehingga RLS tetap berlaku.
- LLM menerima ringkasan agregat yang diminimalkan; tidak ada akses database langsung bagi provider.
- Perhitungan statistik deterministik tetap dikerjakan oleh backend/SQL, bukan diserahkan ke LLM.

## Provider
| Provider | Secret | Model override | Kebijakan |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Default-eligible; gunakan payload aman saja |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` | Default-eligible; fast inference |
| NVIDIA NIM | `NVIDIA_API_KEY` | `NVIDIA_MODEL` | Default-eligible; pastikan endpoint/model sesuai entitlement |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | Opt-in melalui `AI_ENABLE_DEEPSEEK=true`; perlu review vendor/data transfer |
| LLM7.io | `LLM7_API_KEY` (alias lama didukung) | `LLM7_MODEL` | Opt-in eksplisit; aktifkan hanya setelah evaluasi privasi/vendor dan uji model |

## Secrets Supabase
Set secrets di Supabase Edge Functions (jangan commit ke GitHub dan jangan masukkan ke .env publik):
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `NVIDIA_API_KEY`
- `DEEPSEEK_API_KEY` (opsional)
- `LLM7_API_KEY` (development saja)
- `AI_PROVIDER_ORDER=groq,nvidia,gemini,deepseek,llm7`
- `AI_ENVIRONMENT=production`
- `AI_ENABLE_DEEPSEEK=true`
- `AI_ENABLE_LLM7=true`
- `GROQ_MODEL`, `NVIDIA_MODEL`, `DEEPSEEK_MODEL`, `LLM7_MODEL`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` (opsional, isi hanya model ID yang sudah diverifikasi)

Jangan mengirim nilai API key melalui chat, issue, commit, log, atau browser. Jangan menyimpan secrets di GitHub Pages karena frontend bersifat publik.

## Privacy boundary
1. Prompt dan 10 pesan histori terakhir diperiksa untuk pola pengenal langsung seperti NIK 16 digit, nomor RM berlabel, email, nomor telepon, serta label identitas pasien/petugas.
2. Permintaan yang terdeteksi ditolak sebelum panggilan provider.
3. Snapshot hanya berisi statistik teragregasi. Deskripsi bebas risiko, kode register, dan rincian insiden per unit/per bulan tidak dikirim ke LLM.
4. Sel agregat dengan n<5 disembunyikan pada tabel hitungan kategori. Agregat per unit yang ditampilkan juga memakai ambang minimum.
5. Ambang n<5 adalah mitigasi dasar, bukan jaminan anonimitas. Rare-event dan quasi-identifiers tetap perlu dinilai.
6. Bila tidak aman, jangan mengaktifkan provider/fallback; gunakan internal-only workflow.
7. Provider eksternal tidak memperoleh Supabase service-role key, anon key tambahan, SQL credential, atau akses Storage.

## Routing
Default `AI_PROVIDER_ORDER=groq,nvidia,gemini`. DeepSeek hanya aktif jika eksplisit di-enable. LLM7 aktif bila `AI_ENABLE_LLM7=true`; aktifkan hanya setelah persetujuan tata kelola transfer data dan validasi endpoint/model. Fallback berjalan berurutan dan hanya untuk provider yang memenuhi allowlist.

## Deploy
1. Review dan merge PR setelah CI hijau.
2. Deploy Edge Function: `supabase functions deploy aureka-tanya`.
3. Set secrets menggunakan Supabase Dashboard/CLI pada project yang benar.
4. Uji login, warmup, pertanyaan ringan, query agregat mutu/risiko, rate limit, provider timeout, dan privacy guard.
5. Jangan jalankan migration baru untuk perubahan ini; tidak ada perubahan schema.
6. Frontend GitHub Pages tetap dibangun melalui workflow yang sudah ada.

## Batasan yang harus dipahami
Regex Privacy Guard bukan DLP penuh dan tidak dapat menjamin pendeteksian semua nama orang dalam teks bebas. Sebelum produksi, lakukan uji red-team dengan prompt sintetis dan lengkapi deteksi sesuai format identitas yang digunakan rumah sakit. Data klinis individual tetap dilarang untuk dikirim ke provider eksternal.
