import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './CreateRoomPage.css';

const SIGNALING_SERVER_URL = 'http://localhost:3001';

const generateRoomCode = () =>
  Array.from({ length: 6 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');

function readStoredRooms() {
  try {
    return JSON.parse(localStorage.getItem('clipmeet_rooms')) || {};
  } catch {
    return {};
  }
}

function CreateRoomPage() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    setRoomCode(generateRoomCode());
  }, []);

  useEffect(() => {
    const socket = io(SIGNALING_SERVER_URL, {
      transports: ['websocket'],
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const handleRegenerateCode = () => {
    setRoomCode(generateRoomCode());
    setError('');
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();

    const nextRoomName = roomName.trim();
    const socket = socketRef.current;
    if (!nextRoomName || !roomCode || !socket) {
      return;
    }

    const result = await new Promise((resolve) => {
      socket.emit(
        'create-room',
        {
          roomCode,
          roomName: nextRoomName,
        },
        resolve
      );
    });

    if (!result?.ok) {
      setError(result?.error || 'Gagal membuat room.');
      return;
    }

    const storedRooms = readStoredRooms();
    localStorage.setItem(
      'clipmeet_rooms',
      JSON.stringify({
        ...storedRooms,
        [result.roomCode]: result.roomName,
      })
    );

    localStorage.setItem(
      'clipmeet.pendingRoom',
      JSON.stringify({
        roomName: result.roomName,
        roomCode: result.roomCode,
      })
    );

    setError('');
    navigate(`/lobby/${result.roomCode}`);
  };

  return (
    <main className="create-room-page">
      <section className="create-room-card">
        <button
          type="button"
          className="create-room-back"
          onClick={() => navigate('/')}
        >
          Kembali
        </button>

        <div className="create-room-heading">
          <p className="create-room-eyebrow">Create room</p>
          <h1>Buat Room Baru</h1>
        </div>

        <form className="create-room-form" onSubmit={handleCreateRoom}>
          <label className="create-room-field">
            <span>Nama room</span>
            <input
              type="text"
              value={roomName}
              onChange={(event) => {
                setRoomName(event.target.value);
                setError('');
              }}
              placeholder="Rapat Tim A"
            />
          </label>

          <div className="create-room-preview">
            <span>Preview kode room</span>
            <strong>{roomCode || '------'}</strong>
            <button type="button" onClick={handleRegenerateCode}>
              Generate Ulang
            </button>
          </div>

          <button
            type="submit"
            className="create-room-submit"
            disabled={!roomName.trim() || !roomCode}
          >
            Buat Room
          </button>
          {error ? <p className="create-room-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}

export default CreateRoomPage;
