import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import './AuthPages.css';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError('');
      await login(username.trim(), password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (loginError) {
      setError(loginError.message);
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
          <p className="auth-subtitle">Masuk untuk melihat rekaman meeting Anda.</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button
            type="submit"
            className="auth-button"
            disabled={isSubmitting || !username.trim() || !password}
          >
            {isSubmitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="auth-switch">
          Belum punya akun? <Link to="/register">Daftar</Link>
        </p>
      </section>
    </main>
  );
}

export default LoginPage;
