// Pembatas sederhana di memori (tanpa paket tambahan).
// Cukup untuk prototipe; untuk produksi pakai express-rate-limit atau Redis.
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res
        .status(429)
        .json({ status: 'error', message: 'Terlalu banyak percobaan, coba lagi nanti' });
    }
    next();
  };
}

module.exports = rateLimit;