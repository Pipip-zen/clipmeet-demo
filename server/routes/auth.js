const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'clipmeet_secret_key_ganti_ini';

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/auth/register', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username minimal 3 karakter.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter.' });
  }

  try {
    const existingUser = db.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username sudah digunakan.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    db.createUser(username, passwordHash);

    return res.status(201).json({ message: 'Registrasi berhasil' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  try {
    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const publicUser = {
      id: user.id,
      username: user.username,
    };

    return res.json({
      token: signToken(publicUser),
      user: publicUser,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/auth/me', authenticateToken, (req, res) => {
  const user = db.getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }

  return res.json({
    id: user.id,
    username: user.username,
  });
});

module.exports = router;
