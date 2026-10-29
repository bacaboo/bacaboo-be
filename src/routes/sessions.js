const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { requireRole } = requireAuth;

const router = express.Router();

// Semua endpoint sesi wajib login, dan hanya untuk siswa
router.use(requireAuth, requireRole('student'));

// ---------- Pembantu: mengenali jenis kesalahan ----------
const SWAPS = [
  { pair: ['b', 'd'], category: 'reversal_bd' },
  { pair: ['p', 'q'], category: 'reversal_pq' },
];

function swapLetters(text, [a, b]) {
  return [...text].map((c) => (c === a ? b : c === b ? a : c)).join('');
}

// Mengembalikan jenis kesalahan + suku kata yang seharusnya
function classifyError(selected, syllables, slot) {
  const sel = selected.toLowerCase();
  const candidates = slot ? [syllables[slot - 1]] : syllables;

  for (const s of candidates) {
    for (const { pair, category } of SWAPS) {
      if (sel !== s.toLowerCase() && swapLetters(sel, pair) === s.toLowerCase()) {
        return { category, expected: s };
      }
    }
  }

  // Bukan huruf terbalik: anggap salah bunyi (phoneme_mismatch)
  let expected = candidates[0];
  if (!slot) {
    const similarity = (s) =>
      [...s.toLowerCase()].filter((c, i) => c === sel[i]).length;
    expected = similarity(syllables[1]) > similarity(syllables[0]) ? syllables[1] : syllables[0];
  }
  return { category: 'phoneme_mismatch', expected };
}

// ---------- 1. Mulai sesi ----------
router.post('/', async (req, res) => {
  const parsed = z.object({ module_code: z.string().min(1).max(32) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: 'module_code wajib diisi' });
  }

  try {
    const mod = await pool.query(
      'SELECT id FROM learning_modules WHERE module_code = $1',
      [parsed.data.module_code]
    );
    if (mod.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Modul tidak ditemukan' });
    }

    const session = await pool.query(
      `INSERT INTO learning_sessions (student_id, module_id)
       VALUES ($1, $2) RETURNING id, started_at`,
      [req.user.sub, mod.rows[0].id]
    );

    // Perbarui streak (berapa hari berturut-turut anak bermain)
    await pool.query(
      `UPDATE students SET
         active_streak_days = CASE
           WHEN last_played_date = CURRENT_DATE THEN active_streak_days
           WHEN last_played_date = CURRENT_DATE - 1 THEN active_streak_days + 1
           ELSE 1
         END,
         last_played_date = CURRENT_DATE
       WHERE id = $1`,
      [req.user.sub]
    );

    res.status(201).json({
      status: 'success',
      session_id: session.rows[0].id,
      started_at: session.rows[0].started_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

// ---------- 2. Catat satu jawaban ----------
const eventSchema = z.object({
  item_id: z.string().uuid(),
  event_type: z.string().min(1).max(32),
  selected_value: z.string().min(1).max(32),
  is_correct: z.boolean(),
  attempt_number: z.number().int().min(1).max(10),
  target_slot: z.union([z.literal(1), z.literal(2)]).optional(),
});

router.post('/:sessionId/event', async (req, res) => {
  const idCheck = z.string().uuid().safeParse(req.params.sessionId);
  const parsed = eventSchema.safeParse(req.body);
  if (!idCheck.success || !parsed.success) {
    return res.status(400).json({ status: 'error', message: 'Data tidak valid' });
  }
  const sessionId = idCheck.data;
  const e = parsed.data;

  try {
    // Sesi harus milik anak yang sedang login
    const sess = await pool.query(
      `SELECT id, module_id, completed_at FROM learning_sessions
       WHERE id = $1 AND student_id = $2`,
      [sessionId, req.user.sub]
    );
    if (sess.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan' });
    }
    if (sess.rows[0].completed_at) {
      return res.status(409).json({ status: 'error', message: 'Sesi sudah selesai' });
    }

    // Soal harus berasal dari modul sesi ini
    const item = await pool.query(
      `SELECT target_word, syllable_1, syllable_2 FROM learning_vocabularies
       WHERE id = $1 AND module_id = $2`,
      [e.item_id, sess.rows[0].module_id]
    );
    if (item.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Soal tidak ditemukan' });
    }
    const v = item.rows[0];
    const syllables = [v.syllable_1, v.syllable_2];

    // Soal dihitung "dicoba" saat percobaan pertama
    const firstTry = e.attempt_number === 1 ? 1 : 0;

    // --- Jawaban benar ---
    if (e.is_correct) {
      await pool.query(
        `UPDATE learning_sessions SET
           total_items_attempted = total_items_attempted + $2,
           successful_items = successful_items + 1
         WHERE id = $1`,
        [sessionId, firstTry]
      );
      await pool.query(
        'UPDATE students SET stars_count = stars_count + 1 WHERE id = $1',
        [req.user.sub]
      );
      return res.json({
        status: 'acknowledged',
        feedback: {
          action: 'celebrate',
          spoken_message: `Hebat! Kamu berhasil membaca ${v.target_word}!`,
        },
      });
    }

    // --- Jawaban salah ---
    const { category, expected } = classifyError(e.selected_value, syllables, e.target_slot);
    const level = e.attempt_number >= 2 ? 2 : 1;

    await pool.query(
      `UPDATE learning_sessions SET
         total_items_attempted = total_items_attempted + $2,
         scaffolding_triggered_count = scaffolding_triggered_count + 1
       WHERE id = $1`,
      [sessionId, firstTry]
    );
    await pool.query(
      `INSERT INTO error_logs
         (session_id, target_item, erroneous_input, error_category, scaffold_level_activated)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, v.target_word, e.selected_value, category, level]
    );

    const feedback =
      level === 1
        ? {
            action: 'trigger_scaffold',
            scaffold_type: 'dim_distractor',
            spoken_message: 'Hmm, hampir! Coba dengarkan lagi, ya.',
            dim_target: e.selected_value,
          }
        : {
            action: 'trigger_scaffold',
            scaffold_type: 'dim_distractor_and_pulse_target',
            spoken_message: `Hmm, hampir! Yuk dengarkan bunyi ${syllables[0]}-${syllables[1]} bersama Boo!`,
            dim_target: e.selected_value,
            pulse_target: expected,
          };

    res.json({ status: 'acknowledged', feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

// ---------- 3. Selesaikan sesi ----------
router.post('/:sessionId/complete', async (req, res) => {
  const idCheck = z.string().uuid().safeParse(req.params.sessionId);
  if (!idCheck.success) {
    return res.status(400).json({ status: 'error', message: 'ID sesi tidak valid' });
  }

  try {
    const done = await pool.query(
      `UPDATE learning_sessions
       SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND student_id = $2
       RETURNING total_items_attempted, successful_items, scaffolding_triggered_count`,
      [idCheck.data, req.user.sub]
    );
    if (done.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sesi tidak ditemukan' });
    }

    const stars = await pool.query(
      'SELECT stars_count, active_streak_days FROM students WHERE id = $1',
      [req.user.sub]
    );

    res.json({
      status: 'success',
      summary: {
        items_attempted: done.rows[0].total_items_attempted,
        items_successful: done.rows[0].successful_items,
        scaffolding_count: done.rows[0].scaffolding_triggered_count,
        stars_count: stars.rows[0].stars_count,
        active_streak_days: stars.rows[0].active_streak_days,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;