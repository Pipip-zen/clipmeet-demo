import { useMemo, useState } from 'react';
import { API_BASE_URL, authFetch } from '@/lib/api';

function ClipCreator({ meetingId, markers, onClipCreated }) {
  const [startMarkerId, setStartMarkerId] = useState('');
  const [endMarkerId, setEndMarkerId] = useState('');
  const [label, setLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds),
    [markers]
  );

  const startMarker = sortedMarkers.find((marker) => marker.id === startMarkerId);
  const endMarker = sortedMarkers.find((marker) => marker.id === endMarkerId);
  const canCreate =
    Boolean(meetingId && startMarker && endMarker && label.trim()) &&
    endMarker.timestamp_seconds > startMarker.timestamp_seconds &&
    !isLoading;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) {
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const response = await authFetch(`${API_BASE_URL}/clips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          label: label.trim(),
          startTime: startMarker.timestamp_seconds,
          endTime: endMarker.timestamp_seconds,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to create clip.');
      }

      const clip = await response.json();
      onClipCreated(clip);
      setLabel('');
      setStartMarkerId('');
      setEndMarkerId('');
    } catch (clipError) {
      console.error('Failed to create clip:', clipError);
      setError(clipError.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="clip-creator" onSubmit={handleSubmit}>
      <div className="clip-creator__grid">
        <label className="clip-creator__field">
          <span>Marker awal</span>
          <select value={startMarkerId} onChange={(event) => setStartMarkerId(event.target.value)}>
            <option value="">Pilih marker</option>
            {sortedMarkers.map((marker) => (
              <option key={marker.id} value={marker.id}>
                {marker.label}
              </option>
            ))}
          </select>
        </label>

        <label className="clip-creator__field">
          <span>Marker akhir</span>
          <select value={endMarkerId} onChange={(event) => setEndMarkerId(event.target.value)}>
            <option value="">Pilih marker</option>
            {sortedMarkers.map((marker) => (
              <option key={marker.id} value={marker.id}>
                {marker.label}
              </option>
            ))}
          </select>
        </label>

        <label className="clip-creator__field">
          <span>Nama clip</span>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Nama clip"
          />
        </label>
      </div>

      {error ? <p className="detail-error">{error}</p> : null}

      <button type="submit" className="detail-button detail-button--primary" disabled={!canCreate}>
        {isLoading ? 'Membuat...' : 'Buat Clip'}
      </button>
    </form>
  );
}

export default ClipCreator;
