import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider } from '@/context/AuthContext';
import HomePage from './pages/HomePage';
import CreateRoomPage from './pages/CreateRoomPage';
import LobbyPage from './pages/LobbyPage';
import MeetingPage from './pages/MeetingPage';
import DashboardPage from './pages/DashboardPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/create-room" element={<CreateRoomPage />} />
            <Route path="/lobby/:roomCode" element={<LobbyPage />} />
            <Route path="/room/:roomCode" element={<MeetingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/:meetingId" element={<MeetingDetailPage />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
