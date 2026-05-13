import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ClipCreator from '@/components/ClipCreator';
import { API_BASE_URL, authFetch } from '@/lib/api';
import './MeetingDetailPage.css';

const SERVER_BASE_URL = 'http://localhost:3001';

function toServerUrl(filePath) {
  if (!filePath) {
    return '';
  }

  return filePath.startsWith('http') ? filePath : `${SERVER_BASE_URL}${filePath}`;
}

function formatTimestamp(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainingSeconds = String(Math.floor(seconds % 60)).padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
}

function readStoredRooms() {
  try {
    return JSON.parse(localStorage.getItem('clipmeet_rooms')) || {};
  } catch {
    return {};
  }
}

function getMeetingTitle(meeting, storedRooms) {
  if (!meeting) {
    return 'Meeting Detail';
  }

  const storedRoomName = storedRooms[meeting.room_id];
  if (storedRoomName) {
    return `Meeting ${storedRoomName}`;
  }

  return meeting.title || `Meeting ${meeting.room_id}`;
}

function MeetingDetailPage() {
  const { meetingId } = useParams();
  const videoRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [clips, setClips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        setIsLoading(true);
        setError('');

        const response = await authFetch(`${API_BASE_URL}/meetings/${meetingId}`);
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Failed to load meeting.');
        }

        const data = await response.json();
        setMeeting(data);
        setClips(data.clips || []);
      } catch (fetchError) {
        console.error('Failed to load meeting:', fetchError);
        setError(fetchError.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeeting();
  }, [meetingId]);

  const recordingUrl = useMemo(() => toServerUrl(meeting?.file_path), [meeting]);
  const markers = useMemo(() => meeting?.markers || [], [meeting]);
  const storedRooms = readStoredRooms();

  const seekToMarker = (timestampSeconds) => {
    if (!videoRef.current || !recordingUrl) {
      return;
    }

    videoRef.current.src = recordingUrl;
    videoRef.current.currentTime = timestampSeconds;
    videoRef.current.play();
  };

  const playClip = (clip) => {
    if (!videoRef.current || !clip.file_path) {
      return;
    }

    videoRef.current.src = toServerUrl(clip.file_path);
    videoRef.current.currentTime = 0;
    videoRef.current.play();
  };

  return (
    <main className="detail-page">
      <div className="detail-shell">
        <header className="detail-header">
          <div>
            <h1 className="detail-title">
              {getMeetingTitle(meeting, storedRooms)}
            </h1>
            <p className="detail-subtitle">{meetingId}</p>
          </div>
          <Link className="detail-button" to="/dashboard">
            Kembali ke Dashboard
          </Link>
        </header>

        {isLoading ? <p className="detail-empty">Memuat meeting...</p> : null}
        {error ? <p className="detail-error">{error}</p> : null}

        {meeting ? (
          <div className="detail-layout">
            <section className="detail-panel">
              <video
                ref={videoRef}
                className="detail-video"
                src={recordingUrl}
                controls
              />
            </section>

            <aside className="detail-panel">
              <h2 className="detail-panel__title">Markers</h2>
              {markers.length === 0 ? <p className="detail-empty">Belum ada marker</p> : null}
              <ul className="marker-list">
                {markers.map((marker) => (
                  <li className="marker-item" key={marker.id}>
                    <div>
                      <div className="marker-item__label">{marker.label}</div>
                      <div className="marker-item__time">
                        {formatTimestamp(marker.timestamp_seconds)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="detail-button"
                      onClick={() => seekToMarker(marker.timestamp_seconds)}
                    >
                      Seek
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="detail-panel">
              <h2 className="detail-panel__title">Buat Clip</h2>
              <ClipCreator
                meetingId={meeting.id}
                markers={markers}
                onClipCreated={(clip) => setClips((current) => [...current, clip])}
              />
            </section>

            <section className="detail-panel">
              <h2 className="detail-panel__title">Clips</h2>
              {clips.length === 0 ? <p className="detail-empty">Belum ada clip</p> : null}
              <ul className="clip-list">
                {clips.map((clip) => (
                  <li className="clip-item" key={clip.id}>
                    <div>
                      <div className="clip-item__label">{clip.label}</div>
                      <div className="clip-item__time">
                        {formatTimestamp(clip.start_time)} - {formatTimestamp(clip.end_time)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="detail-button"
                      onClick={() => playClip(clip)}
                    >
                      Play
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default MeetingDetailPage;
