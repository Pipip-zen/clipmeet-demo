import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ControlBar from '@/components/ControlBar';
import MarkerPanel from '@/components/MarkerPanel';
import TopBar from '@/components/TopBar';
import VideoTile from '@/components/VideoTile';
import useRecorder from '@/hooks/useRecorder';
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
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);
  const {
    participants,
    isMuted,
    isCameraOff,
    error,
    toggleMute,
    toggleCamera,
    leaveMeeting,
  } = useWebRTC(roomId);
  const localStream = participants.find((participant) => participant.isLocal)?.stream;
  const {
    isRecording,
    meetingId,
    recordingStartTime,
    error: recorderError,
    startRecording,
    stopRecording,
  } = useRecorder(localStream, roomId);

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

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        setIsMarkerPanelOpen(false);
        await stopRecording();
        console.log('Recording stopped');
        return;
      }

      await startRecording();
      console.log('Recording started');
    } catch (recordingError) {
      console.error('Recording action failed:', recordingError);
    }
  };

  const handleAddMarker = () => {
    setIsMarkerPanelOpen((isOpen) => !isOpen);
    console.log('Marker panel toggled');
  };

  const handleLeaveMeeting = async () => {
    console.log(`Leaving room ${roomId}`);
    if (isRecording) {
      await stopRecording();
    }
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
        {recorderError ? <p className="meeting-error">{recorderError}</p> : null}
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

      {isMarkerPanelOpen && isRecording ? (
        <MarkerPanel
          meetingId={meetingId}
          recordingStartTime={recordingStartTime}
          onClose={() => setIsMarkerPanelOpen(false)}
        />
      ) : null}

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
