require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

// Membuat akun hanya kalau emailnya belum ada
async function createAdultUser(email, password, role) {
  const found = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (found.rows.length > 0) return { id: found.rows[0].id, created: false };

  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, hash, role]
  );
  return { id: r.rows[0].id, created: true };
}

async function seed() {
  const dito = await pool.query("SELECT id FROM students WHERE display_name = 'Dito'");
  if (dito.rows.length === 0) {
    throw new Error('Siswa Dito belum ada. Jalankan dulu: node src/seed.js');
  }
  const studentId = dito.rows[0].id;

  // Guru + kelas + Dito masuk kelas
  const teacherUser = await createAdultUser('guru@bacaboo.test', 'guru12345', 'teacher');
  if (teacherUser.created) {
    const t = await pool.query(
      `INSERT INTO teachers (user_id, full_name, school_name)
       VALUES ($1, 'Bu Rina', 'SDN Contoh 1') RETURNING id`,
      [teacherUser.id]
    );
    const c = await pool.query(
      `INSERT INTO classrooms (teacher_id, grade_level, class_name, academic_year)
       VALUES ($1, 1, 'Kelas 1A', '2026/2027') RETURNING id`,
      [t.rows[0].id]
    );
    await pool.query(
      'INSERT INTO classroom_students (classroom_id, student_id) VALUES ($1, $2)',
      [c.rows[0].id, studentId]
    );
  }

  // Orang tua + hubungan ke Dito
  const parentUser = await createAdultUser('ortu@bacaboo.test', 'ortu12345', 'parent');
  if (parentUser.created) {
    const p = await pool.query(
      `INSERT INTO parents (user_id, full_name, phone_number)
       VALUES ($1, 'Ibu Sari', '081234567890') RETURNING id`,
      [parentUser.id]
    );
    await pool.query(
      `INSERT INTO parent_students (parent_id, student_id, relationship)
       VALUES ($1, $2, 'mother')`,
      [p.rows[0].id, studentId]
    );
  }

  console.log('Seed guru dan orang tua selesai.');
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});