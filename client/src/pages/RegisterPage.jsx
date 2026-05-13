import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import './AuthPages.css';

function RegisterPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextUsername = username.trim();

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
              minLength={6}
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button
            type="submit"
            className="auth-button"
            disabled={isSubmitting || username.trim().length < 3 || password.length < 6}
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
