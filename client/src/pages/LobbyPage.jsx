import { useNavigate, useParams } from 'react-router-dom';
import './LobbyPage.css';

function LobbyPage() {
  const { roomCode = '------' } = useParams();
  const navigate = useNavigate();

  return (
    <main className="lobby-page">
      <section className="lobby-card">
        <p className="lobby-eyebrow">Lobby</p>
        <h1>Room {roomCode}</h1>
        <p className="lobby-copy">Lobby placeholder. Setup peserta akan ditambahkan di Task 5c.</p>

        <div className="lobby-actions">
          <button type="button" onClick={() => navigate('/')}>
            Kembali
          </button>
          <button type="button" className="lobby-actions__primary" onClick={() => navigate(`/room/${roomCode}`)}>
            Masuk Meeting
          </button>
        </div>
      </section>
    </main>
  );
}

export default LobbyPage;
