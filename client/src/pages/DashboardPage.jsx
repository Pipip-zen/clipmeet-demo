import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './DashboardPage.css';

const API_BASE_URL = 'http://localhost:3001/api';

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function DashboardPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        setIsLoading(true);
        setError('');

        const response = await fetch(`${API_BASE_URL}/meetings`);
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
              <div>
                <h2 className="meeting-card__title">
                  {meeting.title || `Meeting - ${meeting.room_id}`}
                </h2>
                <p className="meeting-card__date">{formatDate(meeting.started_at)}</p>
              </div>
              <button
                type="button"
                className="meeting-card__button"
                onClick={() => navigate(`/dashboard/${meeting.id}`)}
              >
                Lihat Detail
              </button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export default DashboardPage;
