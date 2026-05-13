import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="auth-page">
        <div className="auth-card auth-card--loading">Memuat sesi...</div>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
