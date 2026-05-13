const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clipmeet_secret_key_ganti_ini';

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token autentikasi diperlukan.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}

module.exports = authenticateToken;
