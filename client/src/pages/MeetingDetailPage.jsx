import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ClipCreator from '@/components/ClipCreator';
import ConfirmDialog from '@/components/ConfirmDialog';
import { API_BASE_URL, authFetch } from '@/lib/api';
import './MeetingDetailPage.css';

const SERVER_BASE_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3001';

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

function getClipStatusLabel(status) {
  if (status === 'processing') {
    return 'Processing';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  return 'Ready';
}

async function downloadAuthenticatedFile(url, fallbackName) {
  const response = await authFetch(url);
  if (!response.ok) {
    let message = 'Failed to download file.';
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Ignore parse error and use fallback message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const header = response.headers.get('Content-Disposition') || '';
  const match = header.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function MeetingDetailPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [clips, setClips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [actionState, setActionState] = useState({});
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchMeeting = async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setIsLoading(true);
          setError('');
        }

        const response = await authFetch(`${API_BASE_URL}/meetings/${meetingId}`);
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Failed to load meeting.');
        }

        const data = await response.json();
        if (!isMounted) {
          return;
        }

        setMeeting(data);
        setClips(data.clips || []);
      } catch (fetchError) {
        console.error('Failed to load meeting:', fetchError);
        if (isMounted) {
          setError(fetchError.message);
        }
      } finally {
        if (isMounted && !silent) {
          setIsLoading(false);
        }
      }
    };

    fetchMeeting();

    return () => {
      isMounted = false;
    };
  }, [meetingId]);

  useEffect(() => {
    if (!clips.some((clip) => clip.status === 'processing')) {
      return undefined;
    }

    const pollId = window.setInterval(async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/meetings/${meetingId}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setMeeting(data);
        setClips(data.clips || []);
      } catch {
        // Keep existing UI state and try again on next tick.
      }
    }, 3000);

    return () => window.clearInterval(pollId);
  }, [clips, meetingId]);

  const recordingUrl = useMemo(() => toServerUrl(meeting?.file_path), [meeting]);
  const markers = useMemo(() => meeting?.markers || [], [meeting]);
  const storedRooms = readStoredRooms();

  const setBusy = (key, isBusy) => {
    setActionState((current) => ({
      ...current,
      [key]: isBusy,
    }));
  };

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

  const handleDownloadRecording = async () => {
    if (!meeting) {
      return;
    }

    try {
      setDownloadError('');
      setBusy('recording', true);
      await downloadAuthenticatedFile(
        `${API_BASE_URL}/recordings/${meeting.id}/download`,
        `recording-room-${meeting.room_id}.webm`
      );
    } catch (downloadFileError) {
      console.error('Failed to download recording:', downloadFileError);
      setDownloadError(downloadFileError.message);
    } finally {
      setBusy('recording', false);
    }
  };

  const handleDownloadAllClips = async () => {
    if (!meeting) {
      return;
    }

    try {
      setDownloadError('');
      setBusy('clips-zip', true);
      await downloadAuthenticatedFile(
        `${API_BASE_URL}/recordings/${meeting.id}/clips/download-zip`,
        `clips-room-${meeting.room_id}.zip`
      );
    } catch (downloadZipError) {
      console.error('Failed to download clip zip:', downloadZipError);
      setDownloadError(downloadZipError.message);
    } finally {
      setBusy('clips-zip', false);
    }
  };

  const handleDownloadClip = async (clip) => {
    try {
      setDownloadError('');
      setBusy(`clip-download-${clip.id}`, true);
      await downloadAuthenticatedFile(
        `${API_BASE_URL}/clips/${clip.id}/download`,
        `clip-${String(clip.sequence_number || 1).padStart(3, '0')}-room-${meeting?.room_id || 'ROOM'}.webm`
      );
    } catch (downloadClipError) {
      console.error('Failed to download clip:', downloadClipError);
      setDownloadError(downloadClipError.message);
    } finally {
      setBusy(`clip-download-${clip.id}`, false);
    }
  };

  const handleRetryClip = async (clipId) => {
    try {
      setDownloadError('');
      setBusy(`clip-retry-${clipId}`, true);

      const response = await authFetch(`${API_BASE_URL}/clips/${clipId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to retry clip.');
      }

      const nextClip = await response.json();
      setClips((current) =>
        current.map((clip) => (clip.id === clipId ? nextClip : clip))
      );
    } catch (retryError) {
      console.error('Failed to retry clip:', retryError);
      setDownloadError(retryError.message);
    } finally {
      setBusy(`clip-retry-${clipId}`, false);
    }
  };

  const hasReadyClips = clips.some((clip) => clip.status === 'ready' && clip.file_path);

  const handleDeleteRecording = async () => {
    if (!meeting) {
      return;
    }

    try {
      setDownloadError('');
      setBusy('delete-recording', true);

      const response = await authFetch(`${API_BASE_URL}/recordings/${meeting.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to delete recording.');
      }

      navigate('/dashboard');
    } catch (deleteError) {
      console.error('Failed to delete recording:', deleteError);
      setDownloadError(deleteError.message);
    } finally {
      setBusy('delete-recording', false);
      setIsDeleteModalOpen(false);
    }
  };

  return (
    <main className="detail-page">
      <div className="detail-shell">
        <header className="detail-header">
          <div className="detail-header__copy">
            <h1 className="detail-title">
              {getMeetingTitle(meeting, storedRooms)}
            </h1>
            <p className="detail-subtitle">{meetingId}</p>
          </div>
          <div className="detail-header__actions">
            <button
              type="button"
              className="detail-button detail-button--danger"
              onClick={() => setIsDeleteModalOpen(true)}
              disabled={!meeting}
            >
              Delete Recording
            </button>
            <Link className="detail-button" to="/dashboard">
              Kembali ke Dashboard
            </Link>
          </div>
        </header>

        {isLoading ? <p className="detail-empty">Memuat meeting...</p> : null}
        {error ? <p className="detail-error">{error}</p> : null}
        {downloadError ? <p className="detail-error">{downloadError}</p> : null}

        {meeting ? (
          <div className="detail-layout">
            <section className="detail-panel">
              <video
                ref={videoRef}
                className="detail-video"
                src={recordingUrl}
                controls
              />
              <div className="detail-actions">
                <button
                  type="button"
                  className="detail-button detail-button--primary"
                  onClick={handleDownloadRecording}
                  disabled={!meeting.file_path || Boolean(actionState.recording)}
                >
                  {actionState.recording ? 'Downloading...' : 'Download Full Recording'}
                </button>
              </div>
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
                onClipCreated={(clip) =>
                  setClips((current) =>
                    [...current, clip].sort((left, right) => {
                      if ((left.sequence_number || 0) !== (right.sequence_number || 0)) {
                        return (left.sequence_number || 0) - (right.sequence_number || 0);
                      }
                      return left.start_time - right.start_time;
                    })
                  )
                }
              />
            </section>

            <section className="detail-panel">
              <div className="detail-panel__header">
                <h2 className="detail-panel__title">Clips</h2>
                <button
                  type="button"
                  className="detail-button"
                  onClick={handleDownloadAllClips}
                  disabled={!hasReadyClips || Boolean(actionState['clips-zip'])}
                >
                  {actionState['clips-zip'] ? 'Downloading...' : 'Download All Clips (.zip)'}
                </button>
              </div>
              {clips.length === 0 ? <p className="detail-empty">Belum ada clip</p> : null}
              <ul className="clip-list">
                {clips.map((clip) => (
                  <li className="clip-item" key={clip.id}>
                    <div className="clip-item__meta">
                      <div className="clip-item__topline">
                        <div className="clip-item__label">{clip.label}</div>
                        <span className={`clip-status clip-status--${clip.status || 'ready'}`}>
                          {getClipStatusLabel(clip.status)}
                        </span>
                      </div>
                      <div className="clip-item__time">
                        {formatTimestamp(clip.start_time)} - {formatTimestamp(clip.end_time)}
                      </div>
                      {clip.error_message ? (
                        <div className="clip-item__error">{clip.error_message}</div>
                      ) : null}
                    </div>
                    <div className="clip-item__actions">
                      <button
                        type="button"
                        className="detail-button"
                        onClick={() => playClip(clip)}
                        disabled={!clip.file_path}
                      >
                        Preview Clip
                      </button>
                      <button
                        type="button"
                        className="detail-button"
                        onClick={() => handleDownloadClip(clip)}
                        disabled={
                          clip.status !== 'ready' ||
                          !clip.file_path ||
                          Boolean(actionState[`clip-download-${clip.id}`])
                        }
                      >
                        {clip.status === 'processing'
                          ? 'Processing'
                          : actionState[`clip-download-${clip.id}`]
                            ? 'Downloading...'
                            : 'Download Clip'}
                      </button>
                      {clip.status === 'failed' ? (
                        <button
                          type="button"
                          className="detail-button"
                          onClick={() => handleRetryClip(clip.id)}
                          disabled={Boolean(actionState[`clip-retry-${clip.id}`])}
                        >
                          {actionState[`clip-retry-${clip.id}`] ? 'Retrying...' : 'Retry'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </div>

      {isDeleteModalOpen && meeting ? (
        <ConfirmDialog
          title="Delete recording?"
          message={`Recording ${getMeetingTitle(meeting, storedRooms)} akan dihapus bersama video utama dan semua clip.`}
          confirmLabel="Delete Recording"
          cancelLabel="Cancel"
          isBusy={Boolean(actionState['delete-recording'])}
          onCancel={() => {
            if (!actionState['delete-recording']) {
              setIsDeleteModalOpen(false);
            }
          }}
          onConfirm={handleDeleteRecording}
        />
      ) : null}
    </main>
  );
}

export default MeetingDetailPage;
