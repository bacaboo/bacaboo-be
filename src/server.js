require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/api/v1/auth', authRoutes);
const moduleRoutes = require('./routes/modules');
app.use('/api/v1/modules', moduleRoutes);
const sessionRoutes = require('./routes/sessions');
app.use('/api/v1/sessions', sessionRoutes);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});