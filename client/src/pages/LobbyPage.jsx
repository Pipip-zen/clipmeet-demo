import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '@/context/useAuth';
import useLocalMedia from '@/hooks/useLocalMedia';
import './LobbyPage.css';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3001';

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
  const normalizedRoomCode = roomCode.toUpperCase();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const { user } = useAuth();
  const [participantName, setParticipantName] = useState(() => user?.username || '');
  const [roomName, setRoomName] = useState(() => readRoomName(normalizedRoomCode));
  const [roomExists, setRoomExists] = useState(false);
  const [roomError, setRoomError] = useState('');
  const { stream, isCamOn, isMicOn, toggleCam, toggleMic, error } = useLocalMedia();

  useEffect(() => {
    const socket = io(SIGNALING_SERVER_URL, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('get-room-info', normalizedRoomCode);
    });

    socket.on('room-info', (roomInfo) => {
      if (roomInfo.roomCode !== normalizedRoomCode) {
        return;
      }

      setRoomExists(Boolean(roomInfo.exists));
      if (roomInfo.roomName) {
        setRoomName(roomInfo.roomName);
      }
      setRoomError(
        roomInfo.exists
          ? ''
          : 'Room tidak ditemukan. Pastikan kode room benar atau buat room terlebih dahulu.'
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [normalizedRoomCode]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (!stream) {
      videoElement.srcObject = null;
      return;
    }

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }
  }, [stream]);

  const stopLobbyTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const handleEnterRoom = () => {
    const nextParticipantName = participantName.trim();
    if (!nextParticipantName || !roomExists) {
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
        roomCode: normalizedRoomCode,
        roomName,
      })
    );

    stopLobbyTracks();
    navigate(`/room/${normalizedRoomCode}`);
  };

  return (
    <main className="lobby-page">
      <section className="lobby-card">
        <header className="lobby-header">
          <p className="lobby-eyebrow">Room Code</p>
          <h1>{roomName}</h1>
          <p className="lobby-room-code">{normalizedRoomCode}</p>
        </header>

        <div className="lobby-preview">
          {stream ? (
            <video
              ref={videoRef}
              className="lobby-video"
              autoPlay
              muted
              playsInline
            />
          ) : null}
          {(!stream || !isCamOn) ? (
            <div className="lobby-camera-off">Kamera Mati</div>
          ) : null}
        </div>

        {error ? <p className="lobby-error">{error}</p> : null}
        {roomError ? <p className="lobby-error">{roomError}</p> : null}

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
            disabled={!participantName.trim() || !roomExists}
          >
            Masuk Meeting
          </button>
        </div>
      </section>
    </main>
  );
}

export default LobbyPage;
