import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreateRoomPage.css';

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

  useEffect(() => {
    setRoomCode(generateRoomCode());
  }, []);

  const handleRegenerateCode = () => {
    setRoomCode(generateRoomCode());
  };

  const handleCreateRoom = (event) => {
    event.preventDefault();

    const nextRoomName = roomName.trim();
    if (!nextRoomName || !roomCode) {
      return;
    }

    const storedRooms = readStoredRooms();
    localStorage.setItem(
      'clipmeet_rooms',
      JSON.stringify({
        ...storedRooms,
        [roomCode]: nextRoomName,
      })
    );

    localStorage.setItem(
      'clipmeet.pendingRoom',
      JSON.stringify({
        roomName: nextRoomName,
        roomCode,
      })
    );

    navigate(`/lobby/${roomCode}`);
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
              onChange={(event) => setRoomName(event.target.value)}
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
        </form>
      </section>
    </main>
  );
}

export default CreateRoomPage;
