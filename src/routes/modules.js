const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { requireRole } = requireAuth;

const router = express.Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

router.get('/:moduleCode/items', requireAuth, requireRole('student', 'teacher'), async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: 'Parameter limit harus 1-20' });
  }
  const { limit } = parsed.data;

  try {
    const mod = await pool.query(
      'SELECT id, module_code, sld_domain FROM learning_modules WHERE module_code = $1',
      [req.params.moduleCode]
    );
    if (mod.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Modul tidak ditemukan' });
    }
    const m = mod.rows[0];

    // ORDER BY random() supaya urutan soal selalu acak
    const result = await pool.query(
      `SELECT id, target_word, syllable_1, syllable_2, audio_full_url,
              audio_syl1_url, audio_syl2_url, image_asset_url, distractor_syllable
       FROM learning_vocabularies
       WHERE module_id = $1
       ORDER BY random()
       LIMIT $2`,
      [m.id, limit]
    );

    const items = result.rows.map((r) => ({
      id: r.id,
      target_word: r.target_word,
      syllables: [
        { order: 1, text: r.syllable_1, color_token: 'accent_orange', audio_url: r.audio_syl1_url },
        { order: 2, text: r.syllable_2, color_token: 'accent_blue', audio_url: r.audio_syl2_url },
      ],
      distractor: r.distractor_syllable
        ? {
            text: r.distractor_syllable,
            audio_url: `/audio/fonem/${r.distractor_syllable.toLowerCase()}.mp3`,
          }
        : null,
      image_url: r.image_asset_url,
      audio_full_url: r.audio_full_url,
    }));

    res.json({ module_code: m.module_code, domain: m.sld_domain, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;