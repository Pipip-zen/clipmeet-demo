import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ControlBar from '@/components/ControlBar';
import TopBar from '@/components/TopBar';
import VideoTile from '@/components/VideoTile';
import './MeetingPage.css';

const MOCK_PARTICIPANTS = [
  { id: 'host', name: 'Ari Pratama', isMuted: false, isCameraOff: false, isLocal: true },
  { id: 'p1', name: 'Nadia Putri', isMuted: true, isCameraOff: false, isLocal: false },
  { id: 'p2', name: 'Rizky Adi', isMuted: false, isCameraOff: true, isLocal: false },
  { id: 'p3', name: 'Citra Lestari', isMuted: false, isCameraOff: false, isLocal: false },
];

function formatDuration(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function MeetingPage() {
  const { roomId = 'Unknown' } = useParams();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  const duration = useMemo(() => formatDuration(elapsedSeconds), [elapsedSeconds]);

  const participants = useMemo(
    () =>
      MOCK_PARTICIPANTS.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              isMuted,
              isCameraOff,
            }
          : participant
      ),
    [isCameraOff, isMuted]
  );

  const handleToggleMute = () => {
    const nextValue = !isMuted;
    setIsMuted(nextValue);
    console.log(nextValue ? 'Mic muted' : 'Mic unmuted');
  };

  const handleToggleCamera = () => {
    const nextValue = !isCameraOff;
    setIsCameraOff(nextValue);
    console.log(nextValue ? 'Camera turned off' : 'Camera turned on');
  };

  const handleToggleRecording = () => {
    const nextValue = !isRecording;
    setIsRecording(nextValue);
    console.log(nextValue ? 'Recording started' : 'Recording stopped');
  };

  const handleAddMarker = () => {
    console.log('Marker added');
  };

  const handleLeaveMeeting = () => {
    console.log(`Leaving room ${roomId}`);
  };

  return (
    <main className="meeting-page">
      <TopBar
        roomId={roomId}
        participantCount={participants.length}
        duration={duration}
      />

      <section className="meeting-grid" aria-label="Meeting participants">
        {participants.map((participant) => (
          <VideoTile
            key={participant.id}
            name={participant.name}
            isMuted={participant.isMuted}
            isCameraOff={participant.isCameraOff}
            isLocal={participant.isLocal}
          />
        ))}
      </section>

      <ControlBar
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isRecording={isRecording}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
        onToggleRecording={handleToggleRecording}
        onAddMarker={handleAddMarker}
        onLeaveMeeting={handleLeaveMeeting}
      />
    </main>
  );
}

export default MeetingPage;
