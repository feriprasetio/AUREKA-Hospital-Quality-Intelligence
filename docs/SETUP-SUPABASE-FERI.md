# Yang perlu dijalankan di Supabase (proyek `ktukmjscopggkzrkgnzp`)

Ada 4 hal. Semuanya lewat **Dashboard Supabase** — tidak perlu install apa pun. **Nomor 0 paling penting.**

## 0. Alamat tautan email (Lupa password, verifikasi daftar, ganti email) — PENTING

Saat ini Supabase mengarahkan semua tautan dari email ke alamat lama
`https://aureka-rsudssma-komite-pmkp.vercel.app` yang sudah **404 (mati)**.
Akibatnya: **lupa password, verifikasi akun baru, dan konfirmasi ganti email tidak bisa dipakai.**

1. Buka https://supabase.com/dashboard/project/ktukmjscopggkzrkgnzp/auth/url-configuration
2. **Site URL** → ganti menjadi:
   `https://feriprasetio.github.io/AUREKA-Hospital-Quality-Intelligence/`
3. **Redirect URLs** → **Add URL** → tambahkan:
   `https://feriprasetio.github.io/AUREKA-Hospital-Quality-Intelligence/**`
4. **Save**.

**Cek:** di halaman login AUREKA klik **Lupa password?**, isi email sendiri → buka email → klik tautan → harus terbuka halaman **Buat password baru** di AUREKA (bukan 404).

*(Opsional)* Authentication → Emails → Templates: ubah teks email "Reset Password" dan "Confirm signup" ke Bahasa Indonesia.


## 1. Tanya AUREKA (asisten AI)

**a. Simpan kunci Gemini sebagai secret**
1. Buka https://supabase.com/dashboard/project/ktukmjscopggkzrkgnzp/functions/secrets
2. Klik **Add new secret** → Name: `GEMINI_API_KEY` → Value: kunci dari Google AI Studio → **Save**.
   *(Disarankan buat kunci baru di https://aistudio.google.com/apikey karena kunci lama sudah dibagikan lewat chat.)*

**b. Deploy fungsinya**
1. Buka https://supabase.com/dashboard/project/ktukmjscopggkzrkgnzp/functions
2. **Deploy a new function** → **Via Editor**.
3. Nama fungsi: `aureka-tanya` (harus persis).
4. Hapus isi contoh, tempel seluruh isi file
   [`supabase/functions/aureka-tanya/index.ts`](../supabase/functions/aureka-tanya/index.ts) (buka → tombol **Copy raw file**).
5. Klik **Deploy**. Biarkan **Verify JWT** tetap aktif.

**Cek:** buka AUREKA → tombol ✦ **Tanya AUREKA** di pojok kanan bawah → klik salah satu contoh pertanyaan.

## 2. Fungsi sinkron email (saat ini 404)

Fungsi `aureka_sync_my_email` belum ada di database (dari migrasi 14 Okt yang belum terpasang).
**Jangan jalankan ulang seluruh file migrasi 14 Okt** — isinya akan menimpa fungsi login versi 22 Okt yang lebih baru.
Cukup jalankan bagian ini di **SQL Editor** (https://supabase.com/dashboard/project/ktukmjscopggkzrkgnzp/sql/new):

```sql
create or replace function public.aureka_sync_my_email()
returns text
language sql
security definer
set search_path = aureka_system, auth, public
as $$
  update aureka_system.user_profiles up set email = u.email, updated_at = now()
  from auth.users u
  where u.id = up.user_id and up.user_id = auth.uid() and up.email is distinct from u.email
  returning up.email;
$$;
revoke all on function public.aureka_sync_my_email() from public, anon;
grant execute on function public.aureka_sync_my_email() to authenticated;
```

Fungsinya: setelah user mengganti email dan mengonfirmasinya, email di profil AUREKA ikut diperbarui.

## 3. Index untuk "Review Lainnya" (sebelumnya timeout)

Tab **Mutu Klinis → Pengaturan → Review Lainnya** pernah gagal (timeout 57014) karena tabel jawaban besar.
Jalankan di **SQL Editor**:

```sql
create index if not exists quality_record_responses_pending_idx
  on aureka_quality.quality_record_responses (created_at desc)
  where review_status = 'pending';
```

Aman: hanya menambah index, tidak mengubah data.

---
## Catatan keamanan (untuk diputuskan, tidak wajib sekarang)
Fungsi `aureka_login_email` (untuk login pakai username) bisa dipanggil tanpa login dan mengembalikan **alamat email** pemilik username.
Artinya orang luar yang menebak username (mis. `pic.isolasi`) bisa melihat email akun tersebut.
Akun unit memakai email `@aureka.invalid` jadi aman, tapi akun dengan email pribadi ikut terlihat.
Perbaikannya butuh perubahan cara login (lewat Edge Function) — dibahas dulu sebelum diubah.

Selesai semuanya, kabari supaya dites ulang dari aplikasi.
