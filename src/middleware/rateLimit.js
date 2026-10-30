// Pembatas percobaan sederhana di memori (tanpa paket tambahan).
// Cukup untuk satu server. Kalau nanti server dijalankan lebih dari satu, pakai Redis.
//
// Pilihan:
//   windowMs        lama jendela hitung (default 15 menit)
//   max             jumlah percobaan yang boleh dalam satu jendela
//   keyFn           pembeda "siapa" yang dihitung (default: alamat IP)
//   skipSuccessful  true = percobaan yang berhasil tidak dihitung
//   message         pesan saat diblokir
function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyFn = (req) => req.ip,
  skipSuccessful = false,
  message = 'Terlalu banyak percobaan, coba lagi nanti',
} = {}) {
  const hits = new Map();

  // Bersihkan catatan yang sudah kedaluwarsa supaya memori tidak membengkak
  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }

    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ status: 'error', message });
    }
    entry.count += 1;

    if (skipSuccessful) {
      res.on('finish', () => {
        if (res.statusCode < 400 && entry.count > 0) entry.count -= 1;
      });
    }
    next();
  };
}

module.exports = rateLimit;
