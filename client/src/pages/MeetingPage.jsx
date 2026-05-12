import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ControlBar from '@/components/ControlBar';
import TopBar from '@/components/TopBar';
import VideoTile from '@/components/VideoTile';
import useWebRTC from '@/hooks/useWebRTC';
import './MeetingPage.css';

function formatDuration(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function MeetingPage() {
  const { roomId = 'Unknown' } = useParams();
  const navigate = useNavigate();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const {
    participants,
    isMuted,
    isCameraOff,
    error,
    toggleMute,
    toggleCamera,
    leaveMeeting,
  } = useWebRTC(roomId);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  const duration = useMemo(() => formatDuration(elapsedSeconds), [elapsedSeconds]);

  const handleToggleMute = () => {
    toggleMute();
    console.log(isMuted ? 'Mic unmuted' : 'Mic muted');
  };

  const handleToggleCamera = () => {
    toggleCamera();
    console.log(isCameraOff ? 'Camera turned on' : 'Camera turned off');
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
    leaveMeeting();
    navigate('/');
  };

  return (
    <main className="meeting-page">
      <TopBar
        roomId={roomId}
        participantCount={participants.length}
        duration={duration}
      />

      <section className="meeting-grid" aria-label="Meeting participants">
        {error ? <p className="meeting-error">{error}</p> : null}
        {participants.map((participant) => (
          <VideoTile
            key={participant.id}
            name={participant.name}
            isMuted={participant.isMuted}
            isCameraOff={participant.isCameraOff}
            isLocal={participant.isLocal}
            stream={participant.stream}
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
