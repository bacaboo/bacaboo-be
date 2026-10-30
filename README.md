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

| Nama              | Fungsi                                                       |
| ----------------- | ------------------------------------------------------------ |
| `PORT`            | Port server (default 3000)                                   |
| `NODE_ENV`        | `development` atau `production`                              |
| `DATABASE_URL`    | Alamat koneksi PostgreSQL (wajib)                            |
| `JWT_SECRET`      | Kunci penanda tangan token login (wajib, rahasia)            |
| `CORS_ORIGIN`     | Alamat front end yang diizinkan, pisahkan dengan koma        |
| `ALLOW_DEMO_SEED` | Hanya `true` kalau sengaja mengisi data contoh di production |

File `.env` tidak boleh di-commit.

## Akun contoh (hanya untuk pengembangan)

Dibuat oleh `npm run seed`:

| Peran                | Login                                                         |
| -------------------- | ------------------------------------------------------------- |
| Anak (Dito)          | PIN gambar: cat, ball, star (ID siswa lihat tabel `students`) |
| Guru (Bu Rina)       | guru@bacaboo.test / guru12345                                 |
| Orang tua (Ibu Sari) | ortu@bacaboo.test / ortu12345                                 |

Seed menolak berjalan di production kecuali `ALLOW_DEMO_SEED=true`.

## Endpoint

Semua alamat berawalan `/api/v1` (contoh lokal: `http://localhost:3000/api/v1`).
Request dan response berformat JSON. Endpoint yang bertanda "token" memakai header:

```
Authorization: Bearer <token>
```

Token didapat dari login. Masa berlakunya 12 jam untuk anak dan 8 jam untuk guru dan orang tua.

### Daftar endpoint

| Metode | Alamat                             | Siapa              | Fungsi                          |
| ------ | ---------------------------------- | ------------------ | ------------------------------- |
| GET    | `/health` (tanpa `/api/v1`)        | publik             | Cek server dan database         |
| POST   | `/auth/picture-pin`                | anak               | Login PIN 3 gambar              |
| POST   | `/auth/login`                      | guru, orang tua    | Login email + sandi             |
| GET    | `/modules/:kode/items?limit=5`     | token (anak, guru) | Ambil soal kata                 |
| POST   | `/sessions`                        | anak               | Mulai sesi belajar              |
| POST   | `/sessions/:id/event`              | anak               | Catat satu jawaban              |
| POST   | `/sessions/:id/complete`           | anak               | Selesaikan sesi                 |
| GET    | `/analytics/students`              | guru, orang tua    | Daftar siswa yang boleh dilihat |
| GET    | `/analytics/students/:id/patterns` | guru, orang tua    | Pola kesulitan siswa            |

Percobaan login yang gagal dibatasi (anak: 5 kali, guru dan orang tua: 10 kali per 15 menit).
Setelah itu server menjawab 429.

### Bentuk response dan kode error

Sukses: `{ "status": "success", ... }` (khusus `/sessions/:id/event` memakai `"acknowledged"`).
Gagal: `{ "status": "error", "message": "..." }`.

| Kode | Arti                                                   |
| ---- | ------------------------------------------------------ |
| 400  | Data yang dikirim tidak valid                          |
| 401  | Belum login, token tidak berlaku, atau PIN/sandi salah |
| 403  | Peran tidak boleh mengakses endpoint ini               |
| 404  | Data tidak ditemukan                                   |
| 409  | Konflik status (sesi sudah selesai)                    |
| 413  | Body lebih dari 100 KB                                 |
| 429  | Terlalu banyak percobaan login                         |
| 500  | Kesalahan server                                       |

### GET /health

Tanpa token. Alamatnya `/health`, bukan `/api/v1/health`.

Response `200`:

```json
{ "status": "ok", "database": "connected" }
```

Kalau database mati: `500` dengan `{ "status": "error", "database": "disconnected" }`.

### POST /auth/picture-pin

Login anak. Pilihan ikon: `cat`, `star`, `apple`, `car`, `ball`, `butterfly`.
Harus tepat 3 ikon dan urutannya berpengaruh.

Request:

```json
{
  "student_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "pin_sequence": ["cat", "ball", "star"]
}
```

Response `200`:

```json
{
  "status": "success",
  "token": "eyJhbGciOi...",
  "student": {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "display_name": "Dito",
    "avatar_code": "boo_classic",
    "stars_count": 28,
    "active_streak_days": 3
  }
}
```

Error: `400` data tidak valid, `401` "Gambar rahasia belum tepat", `429` terlalu banyak percobaan.

### POST /auth/login

Login guru dan orang tua.

Request:

```json
{ "email": "guru@bacaboo.test", "password": "guru12345" }
```

Response `200` (`role` bernilai `teacher` atau `parent`):

```json
{
  "status": "success",
  "token": "eyJhbGciOi...",
  "user": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "role": "teacher",
    "name": "Bu Rina"
  }
}
```

Error: `400` email atau sandi tidak valid, `401` "Email atau sandi salah", `429`.

### GET /modules/:kode/items?limit=5

Peran: anak atau guru (token). `limit` 1 sampai 20, default 5. Urutan soal diacak.
Contoh: `GET /api/v1/modules/DYS_2SYL/items?limit=5`

Response `200`:

```json
{
  "module_code": "DYS_2SYL",
  "domain": "dyslexia",
  "items": [
    {
      "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      "target_word": "BOLA",
      "syllables": [
        {
          "order": 1,
          "text": "BO",
          "color_token": "accent_orange",
          "audio_url": "/audio/fonem/bo.mp3"
        },
        {
          "order": 2,
          "text": "LA",
          "color_token": "accent_blue",
          "audio_url": "/audio/fonem/la.mp3"
        }
      ],
      "distractor": { "text": "BA", "audio_url": "/audio/fonem/ba.mp3" },
      "image_url": "/assets/illustrations/bola.svg",
      "audio_full_url": "/audio/words/bola.mp3"
    }
  ]
}
```

`distractor` bisa `null`. Error: `400` limit di luar 1 sampai 20, `401`, `403`, `404` modul tidak ditemukan.

### POST /sessions

Mulai sesi belajar (peran: anak). Sekaligus memperbarui `active_streak_days`.

Request:

```json
{ "module_code": "DYS_2SYL" }
```

Response `201`:

```json
{
  "status": "success",
  "session_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "started_at": "2026-10-30T03:00:00.000Z"
}
```

Error: `400` module_code wajib diisi, `401`, `403`, `404` modul tidak ditemukan.

### POST /sessions/:id/event

Catat satu jawaban (peran: anak). `attempt_number` = percobaan ke berapa untuk soal yang sama (1 sampai 10).
`target_slot` (opsional, 1 atau 2) = suku kata mana yang sedang diisi.

Request:

```json
{
  "item_id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "event_type": "syllable_dropped",
  "selected_value": "BA",
  "is_correct": false,
  "attempt_number": 2,
  "target_slot": 1
}
```

Response `200` jika jawaban benar (bintang anak bertambah 1):

```json
{
  "status": "acknowledged",
  "feedback": {
    "action": "celebrate",
    "spoken_message": "Hebat! Kamu berhasil membaca BOLA!"
  }
}
```

Response `200` jika salah pada percobaan pertama:

```json
{
  "status": "acknowledged",
  "feedback": {
    "action": "trigger_scaffold",
    "scaffold_type": "dim_distractor",
    "spoken_message": "Hmm, hampir! Coba dengarkan lagi, ya.",
    "dim_target": "BA"
  }
}
```

Response `200` jika salah pada percobaan ke-2 dan seterusnya:

```json
{
  "status": "acknowledged",
  "feedback": {
    "action": "trigger_scaffold",
    "scaffold_type": "dim_distractor_and_pulse_target",
    "spoken_message": "Hmm, hampir! Yuk dengarkan bunyi BO-LA bersama Boo!",
    "dim_target": "BA",
    "pulse_target": "BO"
  }
}
```

Jawaban salah dicatat beserta jenis kesalahannya (huruf terbalik b/d atau p/q, atau salah bunyi).
Error: `400` data tidak valid, `404` sesi atau soal tidak ditemukan (sesi harus milik anak yang login, soal harus dari modul sesi itu), `409` sesi sudah selesai.

### POST /sessions/:id/complete

Selesaikan sesi (peran: anak). Tanpa body. Aman dipanggil ulang.

Response `200`:

```json
{
  "status": "success",
  "summary": {
    "items_attempted": 5,
    "items_successful": 4,
    "scaffolding_count": 2,
    "stars_count": 32,
    "active_streak_days": 3
  }
}
```

Error: `400` ID sesi tidak valid, `404` sesi tidak ditemukan.

### GET /analytics/students

Daftar siswa yang boleh dilihat (peran: guru atau orang tua). Guru hanya melihat siswa di kelasnya,
orang tua hanya melihat anaknya sendiri.

Response `200` (guru mendapat `class_name`, orang tua mendapat `relationship`):

```json
{
  "status": "success",
  "students": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "display_name": "Dito",
      "avatar_code": "boo_classic",
      "stars_count": 28,
      "active_streak_days": 3,
      "last_played_date": "2026-10-30",
      "class_name": "Kelas 2-A"
    }
  ]
}
```

### GET /analytics/students/:id/patterns

Pola belajar satu siswa dalam 30 hari terakhir (peran: guru atau orang tua).

Response `200`:

```json
{
  "status": "success",
  "student_name": "Dito",
  "period": "last_30_days",
  "metrics": {
    "dyslexia_2syl_mastery_pct": 92.5,
    "reversal_pq_error_rate_pct": 12.0,
    "reversal_bd_error_rate_pct": 8.5,
    "math_concrete_balance_pct": null
  },
  "frequent_error_cues": [
    { "cue": "p_vs_q_mirror:kuda", "occurrences": 3, "status": "improving" }
  ],
  "recommended_classroom_intervention": "Latihan huruf p dan q dengan kartu bertekstur rabaan ..."
}
```

`status` pada setiap cue: `improving`, `stable`, atau `needs_support`.
`math_concrete_balance_pct` bernilai `null` karena modul berhitung belum ada.
Error: `400` ID siswa tidak valid, `404` siswa tidak ditemukan atau bukan milik pemanggil.

## Catatan keamanan

- Jangan pernah commit `.env`. Kalau terlanjur, ganti password database dan `JWT_SECRET`.
- Sandi di `seed-dewasa.js` hanya untuk contoh. Jangan dipakai di server sungguhan.
- PIN gambar hanya punya 216 kombinasi, jadi pembatas percobaan wajib tetap aktif.
