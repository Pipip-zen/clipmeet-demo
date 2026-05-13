import { useMemo, useState } from 'react';
import { API_BASE_URL, authFetch } from '@/lib/api';

function formatTimestamp(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainingSeconds = String(Math.floor(seconds % 60)).padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
}

function MarkerPanel({ meetingId, recordingStartTime, onClose }) {
  const [label, setLabel] = useState('');
  const [markers, setMarkers] = useState([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(meetingId && recordingStartTime && label.trim() && !isSubmitting),
    [isSubmitting, label, meetingId, recordingStartTime]
  );

  const handleAddMarker = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const timestampSeconds = Math.max(0, Math.floor((Date.now() - recordingStartTime) / 1000));
    const nextLabel = label.trim();

    try {
      setIsSubmitting(true);
      setError('');

      const response = await authFetch(`${API_BASE_URL}/meetings/${meetingId}/markers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: nextLabel,
          timestamp_seconds: timestampSeconds,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to add marker.');
      }

      const marker = await response.json();
      setMarkers((current) => [...current, marker]);
      setLabel('');
    } catch (markerError) {
      console.error('Failed to add marker:', markerError);
      setError(markerError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside className="marker-panel" aria-label="Recording markers">
      <div className="marker-panel__header">
        <div>
          <p className="marker-panel__eyebrow">Recording markers</p>
          <h2 className="marker-panel__title">Marker</h2>
        </div>
        <button type="button" className="marker-panel__close" onClick={onClose}>
          Close
        </button>
      </div>

      <form className="marker-panel__form" onSubmit={handleAddMarker}>
        <input
          type="text"
          className="marker-panel__input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Marker label"
        />
        <button type="submit" className="marker-panel__button" disabled={!canSubmit}>
          Tambah Marker
        </button>
      </form>

      {error ? <p className="marker-panel__error">{error}</p> : null}

      <ul className="marker-panel__list">
        {markers.map((marker) => (
          <li key={marker.id} className="marker-panel__item">
            <span>{marker.label}</span>
            <time>{formatTimestamp(marker.timestamp_seconds)}</time>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default MarkerPanel;
