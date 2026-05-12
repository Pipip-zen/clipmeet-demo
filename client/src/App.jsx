import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CreateRoomPage from './pages/CreateRoomPage';
import LobbyPage from './pages/LobbyPage';
import MeetingPage from './pages/MeetingPage';
import DashboardPage from './pages/DashboardPage';
import MeetingDetailPage from './pages/MeetingDetailPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create-room" element={<CreateRoomPage />} />
        <Route path="/lobby/:roomCode" element={<LobbyPage />} />
        <Route path="/room/:roomCode" element={<MeetingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/:meetingId" element={<MeetingDetailPage />} />
      </Routes>
    </Router>
  );
}

export default App;
