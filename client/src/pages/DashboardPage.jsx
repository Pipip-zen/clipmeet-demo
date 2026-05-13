import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmDialog from '@/components/ConfirmDialog';
import { API_BASE_URL, authFetch } from '@/lib/api';
import './DashboardPage.css';

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function readStoredRooms() {
  try {
    return JSON.parse(localStorage.getItem('clipmeet_rooms')) || {};
  } catch {
    return {};
  }
}

function getMeetingTitle(meeting, storedRooms) {
  const storedRoomName = storedRooms[meeting.room_id];
  if (storedRoomName) {
    return `Meeting ${storedRoomName}`;
  }

  return meeting.title || `Meeting ${meeting.room_id}`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDeleteMeeting, setPendingDeleteMeeting] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const storedRooms = readStoredRooms();

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setIsLoading(true);
        setError('');

        const response = await authFetch(`${API_BASE_URL}/meetings`);
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Failed to load meetings.');
        }

        const data = await response.json();
        setMeetings(data);
      } catch (fetchError) {
        console.error('Failed to load meetings:', fetchError);
        setError(fetchError.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeetings();
  }, []);

  const handleDeleteMeeting = async () => {
    if (!pendingDeleteMeeting) {
      return;
    }

    try {
      setIsDeleting(true);
      setError('');

      const response = await authFetch(`${API_BASE_URL}/recordings/${pendingDeleteMeeting.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to delete recording.');
      }

      setMeetings((current) => current.filter((meeting) => meeting.id !== pendingDeleteMeeting.id));
      setPendingDeleteMeeting(null);
    } catch (deleteError) {
      console.error('Failed to delete recording:', deleteError);
      setError(deleteError.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <h1 className="dashboard-title">Dashboard</h1>
          <Link className="dashboard-button" to="/">
            Kembali ke Home
          </Link>
        </header>

        {isLoading ? <p className="dashboard-empty">Memuat rekaman...</p> : null}
        {error ? <p className="dashboard-error">{error}</p> : null}

        {!isLoading && !error && meetings.length === 0 ? (
          <p className="dashboard-empty">Belum ada rekaman</p>
        ) : null}

        <section className="meeting-list" aria-label="Daftar meeting">
          {meetings.map((meeting) => (
            <article className="meeting-card" key={meeting.id}>
              <div className="meeting-card__content">
                <h2 className="meeting-card__title">
                  {getMeetingTitle(meeting, storedRooms)}
                </h2>
                <p className="meeting-card__room">{meeting.room_id}</p>
                <p className="meeting-card__date">{formatDate(meeting.started_at)}</p>
              </div>
              <div className="meeting-card__actions">
                <button
                  type="button"
                  className="meeting-card__button"
                  onClick={() => navigate(`/dashboard/${meeting.id}`)}
                >
                  Lihat Detail
                </button>
                <button
                  type="button"
                  className="meeting-card__button meeting-card__button--danger"
                  onClick={() => setPendingDeleteMeeting(meeting)}
                >
                  Delete Recording
                </button>
              </div>
            </article>
          ))}
        </section>

        {pendingDeleteMeeting ? (
          <ConfirmDialog
            title="Delete recording?"
            message={`Recording ${getMeetingTitle(pendingDeleteMeeting, storedRooms)} akan dihapus bersama video utama dan semua clip.`}
            confirmLabel="Delete Recording"
            cancelLabel="Cancel"
            isBusy={isDeleting}
            onCancel={() => {
              if (!isDeleting) {
                setPendingDeleteMeeting(null);
              }
            }}
            onConfirm={handleDeleteMeeting}
          />
        ) : null}
      </div>
    </main>
  );
}

export default DashboardPage;
