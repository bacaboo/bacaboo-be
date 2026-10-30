const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// Pembatas percobaan login: hanya percobaan GAGAL yang dihitung.
// PIN gambar hanya 6 x 6 x 6 = 216 kombinasi, jadi batasnya lebih ketat.
const pinLimiter = rateLimit({
  max: 5,
  skipSuccessful: true,
  keyFn: (req) => `${req.ip}:${req.body?.student_id}`,
  message: 'Terlalu banyak percobaan, tunggu beberapa menit lalu coba lagi',
});
const loginLimiter = rateLimit({
  max: 10,
  skipSuccessful: true,
  keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  message: 'Terlalu banyak percobaan, tunggu beberapa menit lalu coba lagi',
});

const ICONS = ['cat', 'star', 'apple', 'car', 'ball', 'butterfly'];

// ---------- Login siswa: PIN 3 gambar ----------
const pinSchema = z.object({
  student_id: z.string().uuid(),
  pin_sequence: z.array(z.enum(ICONS)).length(3),
});

router.post('/picture-pin', pinLimiter, async (req, res) => {
  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: 'Data tidak valid' });
  }
  const { student_id, pin_sequence } = parsed.data;

  try {
    const result = await pool.query(
      `SELECT id, display_name, avatar_code, stars_count,
              active_streak_days, picture_pin_hash
       FROM students WHERE id = $1`,
      [student_id]
    );
    const student = result.rows[0];

    const ok =
      student &&
      (await bcrypt.compare(pin_sequence.join('-'), student.picture_pin_hash));

    if (!ok) {
      return res
        .status(401)
        .json({ status: 'error', message: 'Gambar rahasia belum tepat' });
    }

    const token = jwt.sign(
      { sub: student.id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      status: 'success',
      token,
      student: {
        id: student.id,
        display_name: student.display_name,
        avatar_code: student.avatar_code,
        stars_count: student.stars_count,
        active_streak_days: student.active_streak_days,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

// ---------- Login guru dan orang tua: email + sandi ----------
const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: 'Email atau sandi tidak valid' });
  }
  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      `SELECT id, password_hash, role FROM users
       WHERE email = $1 AND is_active = TRUE`,
      [email]
    );
    const user = result.rows[0];

    // Pesan sengaja sama untuk email salah dan sandi salah
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ status: 'error', message: 'Email atau sandi salah' });
    }

    let name = null;
    if (user.role === 'teacher') {
      const t = await pool.query('SELECT full_name FROM teachers WHERE user_id = $1', [user.id]);
      name = t.rows[0] ? t.rows[0].full_name : null;
    } else if (user.role === 'parent') {
      const p = await pool.query('SELECT full_name FROM parents WHERE user_id = $1', [user.id]);
      name = p.rows[0] ? p.rows[0].full_name : null;
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ status: 'success', token, user: { id: user.id, role: user.role, name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;