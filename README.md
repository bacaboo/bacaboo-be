# BacaBoo Backend

API untuk aplikasi belajar BacaBoo: login anak (PIN gambar), login guru dan orang tua,
soal kata, pencatatan sesi belajar, dan dashboard pola belajar.

Teknologi: Node.js 20+, Express 5, PostgreSQL.

## Menjalankan di komputer sendiri

1. Pasang Node.js (20 ke atas) dan PostgreSQL.
2. Pasang paket:
   ```bash
   npm install
   ```
3. Buat database kosong bernama `bacaboo`, lalu jalankan skemanya:
   ```bash
   psql -U postgres -c "CREATE DATABASE bacaboo;"
   psql -U postgres -d bacaboo -f db/schema.sql
   ```
   (Bisa juga lewat pgAdmin: buat database `bacaboo`, buka Query Tool, jalankan isi `db/schema.sql`.)
4. Salin `.env.example` menjadi `.env`, lalu isi password PostgreSQL dan `JWT_SECRET`.
   Cara membuat `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
5. Isi data contoh, lalu jalankan server:
   ```bash
   npm run seed
   npm run dev
   ```
6. Cek di browser: http://localhost:3000/health harus menampilkan `"database":"connected"`.

## Pengaturan (.env)

| Nama | Fungsi |
|---|---|
| `PORT` | Port server (default 3000) |
| `NODE_ENV` | `development` atau `production` |
| `DATABASE_URL` | Alamat koneksi PostgreSQL (wajib) |
| `JWT_SECRET` | Kunci penanda tangan token login (wajib, rahasia) |
| `CORS_ORIGIN` | Alamat front end yang diizinkan, pisahkan dengan koma |
| `ALLOW_DEMO_SEED` | Hanya `true` kalau sengaja mengisi data contoh di production |

File `.env` tidak boleh di-commit.

## Akun contoh (hanya untuk pengembangan)

Dibuat oleh `npm run seed`:

| Peran | Login |
|---|---|
| Anak (Dito) | PIN gambar: cat, ball, star (ID siswa lihat tabel `students`) |
| Guru (Bu Rina) | guru@bacaboo.test / guru12345 |
| Orang tua (Ibu Sari) | ortu@bacaboo.test / ortu12345 |

Seed menolak berjalan di production kecuali `ALLOW_DEMO_SEED=true`.

## Endpoint

Semua alamat berawalan `/api/v1`. Yang bertanda "token" memakai header `Authorization: Bearer <token>`.

| Metode | Alamat | Siapa | Fungsi |
|---|---|---|---|
| POST | `/auth/picture-pin` | anak | Login PIN 3 gambar |
| POST | `/auth/login` | guru, orang tua | Login email + sandi |
| GET | `/modules/:kode/items?limit=5` | token (anak, guru) | Ambil soal kata |
| POST | `/sessions` | anak | Mulai sesi belajar |
| POST | `/sessions/:id/event` | anak | Catat satu jawaban |
| POST | `/sessions/:id/complete` | anak | Selesaikan sesi |
| GET | `/analytics/students` | guru, orang tua | Daftar siswa yang boleh dilihat |
| GET | `/analytics/students/:id/patterns` | guru, orang tua | Pola kesulitan siswa |

Percobaan login yang gagal dibatasi (anak: 5 kali, guru dan orang tua: 10 kali per 15 menit).
Setelah itu server menjawab 429.

## Catatan keamanan

- Jangan pernah commit `.env`. Kalau terlanjur, ganti password database dan `JWT_SECRET`.
- Sandi di `seed-dewasa.js` hanya untuk contoh. Jangan dipakai di server sungguhan.
- PIN gambar hanya punya 216 kombinasi, jadi pembatas percobaan wajib tetap aktif.
