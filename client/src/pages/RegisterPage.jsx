import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import './AuthPages.css';

function validatePassword(password) {
  if (password.length < 8) {
    return 'Password minimal 8 karakter.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password harus mengandung huruf kecil.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password harus mengandung huruf besar.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password harus mengandung angka.';
  }

  return '';
}

function RegisterPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordError = validatePassword(password);
  const confirmPasswordError =
    confirmPassword && password !== confirmPassword ? 'Konfirmasi password belum sama.' : '';

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextUsername = username.trim();
    const nextPasswordError = validatePassword(password);

    if (nextPasswordError) {
      setError(nextPasswordError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Konfirmasi password belum sama.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await register(nextUsername, password);
      await login(nextUsername, password);
      navigate('/', { replace: true });
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <header className="auth-header">
          <img src="/icon.png" alt="ClipMeet Logo" className="auth-logo-img" />
          <h1 className="auth-logo">ClipMeet</h1>
          <p className="auth-subtitle">Buat akun untuk menyimpan rekaman meeting.</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="auth-field">
            <span>Konfirmasi Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {password && !error && passwordError ? <p className="auth-error">{passwordError}</p> : null}
          {confirmPasswordError ? <p className="auth-error">{confirmPasswordError}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}

          <button
            type="submit"
            className="auth-button"
            disabled={
              isSubmitting
              || username.trim().length < 3
              || Boolean(passwordError)
              || !confirmPassword
              || Boolean(confirmPasswordError)
            }
          >
            {isSubmitting ? 'Memproses...' : 'Daftar'}
          </button>
        </form>

        <p className="auth-switch">
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </p>
      </section>
    </main>
  );
}

export default RegisterPage;
