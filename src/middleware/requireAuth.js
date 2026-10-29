const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Perlu login dulu' });
  }

  try {
    // algorithms dikunci supaya token dengan algoritma lain ditolak
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Sesi berakhir, silakan login lagi' });
  }
}

// Pemakaian: router.use(requireAuth, requireRole('student'))
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ status: 'error', message: 'Akses ditolak' });
    }
    next();
  };
}

module.exports = requireAuth;
module.exports.requireRole = requireRole;
