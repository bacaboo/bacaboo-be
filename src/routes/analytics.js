const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { requireRole } = requireAuth;

const router = express.Router();

// Dashboard hanya untuk guru dan orang tua
router.use(requireAuth, requireRole('teacher', 'parent'));

// Guru: siswa harus ada di salah satu kelasnya.
// Orang tua: siswa harus anaknya sendiri.
// "sub" di token guru/ortu adalah users.id.
async function canViewStudent(user, studentId) {
  if (user.role === 'teacher') {
    const r = await pool.query(
      `SELECT 1 FROM classroom_students cs
       JOIN classrooms c ON c.id = cs.classroom_id
       JOIN teachers t ON t.id = c.teacher_id
       WHERE t.user_id = $1 AND cs.student_id = $2 LIMIT 1`,
      [user.sub, studentId]
    );
    return r.rows.length > 0;
  }
  if (user.role === 'parent') {
    const r = await pool.query(
      `SELECT 1 FROM parent_students ps
       JOIN parents p ON p.id = ps.parent_id
       WHERE p.user_id = $1 AND ps.student_id = $2 LIMIT 1`,
      [user.sub, studentId]
    );
    return r.rows.length > 0;
  }
  return false;
}

// ---------- 1. Daftar siswa yang boleh dilihat ----------
router.get('/students', async (req, res) => {
  try {
    const sql =
      req.user.role === 'teacher'
        ? `SELECT DISTINCT s.id, s.display_name, s.avatar_code, s.stars_count,
                  s.active_streak_days, s.last_played_date,
                  c.class_name
           FROM students s
           JOIN classroom_students cs ON cs.student_id = s.id
           JOIN classrooms c ON c.id = cs.classroom_id
           JOIN teachers t ON t.id = c.teacher_id
           WHERE t.user_id = $1
           ORDER BY s.display_name`
        : `SELECT s.id, s.display_name, s.avatar_code, s.stars_count,
                  s.active_streak_days, s.last_played_date,
                  ps.relationship
           FROM students s
           JOIN parent_students ps ON ps.student_id = s.id
           JOIN parents p ON p.id = ps.parent_id
           WHERE p.user_id = $1
           ORDER BY s.display_name`;

    const result = await pool.query(sql, [req.user.sub]);
    res.json({ status: 'success', students: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

// ---------- 2. Pola belajar satu siswa (30 hari terakhir) ----------
const CATEGORY_LABEL = {
  reversal_pq: 'p_vs_q_mirror',
  reversal_bd: 'b_vs_d_mirror',
  phoneme_mismatch: 'fonem_mismatch',
};

const INTERVENTION = {
  reversal_pq:
    'Ajak anak menceritakan lebih dulu, lalu latihan huruf p dan q dengan kartu huruf bertekstur rabaan (p = pintu membuka ke kanan).',
  reversal_bd:
    'Latihan huruf b dan d dengan kartu bertekstur dan isyarat tangan (b = perut di kanan, d = perut di kiri).',
  phoneme_mismatch:
    'Ulangi pasangan bunyi yang sering tertukar dengan permainan dengar-dan-tunjuk, dalam sesi pendek yang santai.',
  none: 'Pertahankan ritme belajar saat ini dan rayakan kemajuan anak.',
};

const round1 = (n) => Math.round(n * 10) / 10;

router.get('/students/:studentId/patterns', async (req, res) => {
  const idCheck = z.string().uuid().safeParse(req.params.studentId);
  if (!idCheck.success) {
    return res.status(400).json({ status: 'error', message: 'ID siswa tidak valid' });
  }
  const studentId = idCheck.data;

  try {
    // 404 (bukan 403) supaya tidak membocorkan apakah siswa itu ada
    if (!(await canViewStudent(req.user, studentId))) {
      return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan' });
    }

    const student = await pool.query('SELECT display_name FROM students WHERE id = $1', [studentId]);
    if (student.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan' });
    }

    // Total percobaan dan keberhasilan, modul literasi 2 suku kata
    const totals = await pool.query(
      `SELECT COALESCE(SUM(ls.total_items_attempted), 0)::int AS attempted,
              COALESCE(SUM(ls.successful_items), 0)::int AS successful
       FROM learning_sessions ls
       JOIN learning_modules lm ON lm.id = ls.module_id
       WHERE ls.student_id = $1
         AND lm.module_code = 'DYS_2SYL'
         AND ls.started_at >= NOW() - INTERVAL '30 days'`,
      [studentId]
    );
    const { attempted, successful } = totals.rows[0];

    // Kesalahan per kategori, dipisah 15 hari terakhir vs 15 hari sebelumnya
    const errs = await pool.query(
      `SELECT el.error_category, el.target_item,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE el.created_at >= NOW() - INTERVAL '15 days')::int AS recent,
              COUNT(*) FILTER (WHERE el.created_at <  NOW() - INTERVAL '15 days')::int AS earlier
       FROM error_logs el
       JOIN learning_sessions ls ON ls.id = el.session_id
       WHERE ls.student_id = $1
         AND el.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY el.error_category, el.target_item
       ORDER BY total DESC`,
      [studentId]
    );

    const byCategory = {};
    for (const r of errs.rows) byCategory[r.error_category] = (byCategory[r.error_category] || 0) + r.total;

    const rate = (cat) => (attempted > 0 ? round1(Math.min(100, ((byCategory[cat] || 0) / attempted) * 100)) : 0);

    const status = (r) =>
      r.earlier === 0 && r.recent === 0 ? 'stable'
      : r.recent < r.earlier ? 'improving'
      : r.recent > r.earlier ? 'needs_support'
      : 'stable';

    const cues = errs.rows.slice(0, 5).map((r) => ({
      cue: `${CATEGORY_LABEL[r.error_category] || r.error_category}:${r.target_item.toLowerCase()}`,
      occurrences: r.total,
      status: status(r),
    }));

    const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

    res.json({
      status: 'success',
      student_name: student.rows[0].display_name,
      period: 'last_30_days',
      metrics: {
        dyslexia_2syl_mastery_pct: attempted > 0 ? round1((successful / attempted) * 100) : 0,
        reversal_pq_error_rate_pct: rate('reversal_pq'),
        reversal_bd_error_rate_pct: rate('reversal_bd'),
        math_concrete_balance_pct: null, // modul berhitung belum ada
      },
      frequent_error_cues: cues,
      recommended_classroom_intervention: INTERVENTION[topCategory ? topCategory[0] : 'none'] || INTERVENTION.none,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;