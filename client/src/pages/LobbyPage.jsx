import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import useLocalMedia from '@/hooks/useLocalMedia';
import './LobbyPage.css';

const SIGNALING_SERVER_URL = 'http://localhost:3001';

function readRoomName(roomCode) {
  try {
    const rooms = JSON.parse(localStorage.getItem('clipmeet_rooms')) || {};
    return rooms[roomCode] || roomCode;
  } catch {
    return roomCode;
  }
}

function LobbyPage() {
  const { roomCode = '------' } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [participantName, setParticipantName] = useState('');
  const [roomName, setRoomName] = useState(roomCode);
  const { stream, isCamOn, isMicOn, toggleCam, toggleMic, error } = useLocalMedia();

  useEffect(() => {
    setRoomName(readRoomName(roomCode));
  }, [roomCode]);

  useEffect(() => {
    const socket = io(SIGNALING_SERVER_URL, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('get-room-info', roomCode);
    });

    socket.on('room-info', (roomInfo) => {
      if (roomInfo.roomCode !== roomCode || !roomInfo.roomName) {
        return;
      }

      setRoomName(roomInfo.roomName);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode]);

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
    localStorage.setItem('clipmeet_participant_name', nextParticipantName);
    localStorage.setItem(
      'clipmeet_current_room',
      JSON.stringify({
        roomCode,
        roomName,
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
          <h1>{roomName}</h1>
          <p className="lobby-room-code">{roomCode}</p>
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
