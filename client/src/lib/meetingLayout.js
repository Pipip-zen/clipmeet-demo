export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

export function getMeetingLayout(participantCount) {
  const count = Math.max(1, participantCount);

  if (count === 1) {
    return {
      columns: 1,
      rows: 1,
      variant: 'single',
    };
  }

  if (count === 2) {
    return {
      columns: 2,
      rows: 1,
      variant: 'duo',
    };
  }

  if (count === 3) {
    return {
      columns: 2,
      rows: 2,
      variant: 'trio',
    };
  }

  if (count <= 4) {
    return {
      columns: 2,
      rows: 2,
      variant: 'quad',
    };
  }

  if (count <= 6) {
    return {
      columns: 3,
      rows: 2,
      variant: 'gallery',
    };
  }

  if (count <= 9) {
    return {
      columns: 3,
      rows: 3,
      variant: 'gallery',
    };
  }

  const columns = Math.ceil(Math.sqrt(count));
  return {
    columns,
    rows: Math.ceil(count / columns),
    variant: 'gallery',
  };
}
