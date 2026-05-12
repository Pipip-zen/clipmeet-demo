import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useLocalMedia from '@/hooks/useLocalMedia';
import './LobbyPage.css';

function LobbyPage() {
  const { roomCode = '------' } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [participantName, setParticipantName] = useState('');
  const { stream, isCamOn, isMicOn, toggleCam, toggleMic, error } = useLocalMedia();

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream || null;
  }, [isCamOn, stream]);

  const stopLobbyTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const handleEnterRoom = () => {
    const nextParticipantName = participantName.trim();
    if (!nextParticipantName) {
      return;
    }

    localStorage.setItem(
      'clipmeet.prejoin',
      JSON.stringify({
        participantName: nextParticipantName,
        isCamOn,
        isMicOn,
      })
    );

    stopLobbyTracks();
    navigate(`/room/${roomCode}`);
  };

  return (
    <main className="lobby-page">
      <section className="lobby-card">
        <header className="lobby-header">
          <p className="lobby-eyebrow">Room Code</p>
          <h1>{roomCode}</h1>
        </header>

        <div className="lobby-preview">
          {stream && isCamOn ? (
            <video
              ref={videoRef}
              className="lobby-video"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="lobby-camera-off">Kamera Mati</div>
          )}
        </div>

        {error ? <p className="lobby-error">{error}</p> : null}

        <div className="lobby-controls">
          <button
            type="button"
            className={isCamOn ? 'lobby-toggle lobby-toggle--on' : 'lobby-toggle'}
            onClick={toggleCam}
          >
            {isCamOn ? 'Kamera On' : 'Kamera Off'}
          </button>
          <button
            type="button"
            className={isMicOn ? 'lobby-toggle lobby-toggle--on' : 'lobby-toggle'}
            onClick={toggleMic}
          >
            {isMicOn ? 'Mic On' : 'Mic Off'}
          </button>
        </div>

        <label className="lobby-field">
          <span>Nama partisipan</span>
          <input
            type="text"
            value={participantName}
            onChange={(event) => setParticipantName(event.target.value)}
            placeholder="Nama Anda"
          />
        </label>

        <div className="lobby-actions">
          <button type="button" onClick={() => navigate('/')}>
            Kembali
          </button>
          <button
            type="button"
            className="lobby-actions__primary"
            onClick={handleEnterRoom}
            disabled={!participantName.trim()}
          >
            Masuk Meeting
          </button>
        </div>
      </section>
    </main>
  );
}

export default LobbyPage;
