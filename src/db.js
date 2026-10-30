const { Pool, types } = require('pg');

// Kolom DATE (misalnya last_played_date) dikirim apa adanya sebagai teks "2026-10-30".
// Tanpa ini, pg mengubahnya jadi objek Date dan tanggalnya bisa bergeser satu hari
// di server yang zona waktunya bukan UTC (misalnya WIB).
types.setTypeParser(1082, (value) => value);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;