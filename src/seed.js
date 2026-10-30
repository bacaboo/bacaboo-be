require('dotenv').config();

// Seed berisi akun contoh dengan sandi yang diketahui umum.
// Di production hanya boleh dijalankan dengan sengaja.
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error('Seed ditolak di production. Set ALLOW_DEMO_SEED=true kalau memang sengaja.');
  process.exit(1);
}
const bcrypt = require('bcrypt');
const pool = require('./db');

// [kata, suku kata 1, suku kata 2, pengecoh]
const words = [
  ['BOLA', 'BO', 'LA', 'BA'],
  ['KUDA', 'KU', 'DA', 'BA'],
  ['BUKU', 'BU', 'KU', 'BA'],
  ['MEJA', 'ME', 'JA', 'MA'],
  ['SAPI', 'SA', 'PI', 'SU'],
];

async function seed() {
  // 1. Modul
  const mod = await pool.query(
    `INSERT INTO learning_modules (module_code, sld_domain, title, description)
     VALUES ('DYS_2SYL', 'dyslexia', 'Dunia Kata Ajaib', 'Latihan membaca kata 2 suku kata')
     ON CONFLICT (module_code) DO UPDATE SET title = EXCLUDED.title
     RETURNING id`
  );
  const moduleId = mod.rows[0].id;

  // 2. Kosakata (hanya diisi kalau masih kosong)
  const count = await pool.query(
    'SELECT COUNT(*) FROM learning_vocabularies WHERE module_id = $1',
    [moduleId]
  );
  if (Number(count.rows[0].count) === 0) {
    for (const [word, s1, s2, distractor] of words) {
      const w = word.toLowerCase();
      await pool.query(
        `INSERT INTO learning_vocabularies
         (module_id, target_word, syllable_1, syllable_2, audio_full_url,
          audio_syl1_url, audio_syl2_url, image_asset_url, distractor_syllable)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          moduleId, word, s1, s2,
          `/audio/words/${w}.mp3`,
          `/audio/fonem/${s1.toLowerCase()}.mp3`,
          `/audio/fonem/${s2.toLowerCase()}.mp3`,
          `/assets/illustrations/${w}.svg`,
          distractor,
        ]
      );
    }
  }

  // 3. Siswa contoh: Dito (hanya dibuat kalau belum ada)
  let studentId;
  const existing = await pool.query(
    "SELECT id FROM students WHERE display_name = 'Dito'"
  );
  if (existing.rows.length > 0) {
    studentId = existing.rows[0].id;
  } else {
    const user = await pool.query(
      "INSERT INTO users (role) VALUES ('student') RETURNING id"
    );
    const pinHash = await bcrypt.hash(['cat', 'ball', 'star'].join('-'), 12);
    const st = await pool.query(
      `INSERT INTO students
       (user_id, display_name, picture_pin_hash, avatar_code, stars_count, active_streak_days)
       VALUES ($1, 'Dito', $2, 'boo_detective', 28, 3)
       RETURNING id`,
      [user.rows[0].id, pinHash]
    );
    studentId = st.rows[0].id;
  }

  console.log('Seed selesai. student_id Dito:', studentId);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});