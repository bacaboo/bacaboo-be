require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

// Berhenti dengan pesan jelas kalau pengaturan penting belum diisi
for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Pengaturan ${key} belum diisi (lihat .env.example)`);
    process.exit(1);
  }
}

const app = express();

// Di hosting (Render, Railway, dll.) server berada di belakang proxy.
// Supaya alamat IP pengguna terbaca benar oleh pembatas percobaan login.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// CORS_ORIGIN = alamat front end yang diizinkan (pisahkan dengan koma).
// Kosong = semua boleh, hanya untuk pengembangan.
app.use(
  cors(
    process.env.CORS_ORIGIN
      ? { origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }
      : undefined
  )
);
app.use(express.json({ limit: '100kb' }));

const authRoutes = require('./routes/auth');
app.use('/api/v1/auth', authRoutes);
const moduleRoutes = require('./routes/modules');
app.use('/api/v1/modules', moduleRoutes);
const sessionRoutes = require('./routes/sessions');
app.use('/api/v1/sessions', sessionRoutes);
const analyticsRoutes = require('./routes/analytics');
app.use('/api/v1/analytics', analyticsRoutes);

// Endpoint untuk mengecek server dan database hidup
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Alamat yang tidak dikenal
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan' });
});

// Penanganan error terakhir (misalnya JSON rusak atau terlalu besar)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'error', message: 'Format JSON tidak valid' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', message: 'Data terlalu besar' });
  }
  console.error(err);
  res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
