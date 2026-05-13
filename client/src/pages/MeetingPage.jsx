import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ControlBar from '@/components/ControlBar';
import LocalAudioMonitor from '@/components/LocalAudioMonitor';
import MarkerPanel from '@/components/MarkerPanel';
import ScreenShareStage from '@/components/ScreenShareStage';
import TopBar from '@/components/TopBar';
import VideoTile from '@/components/VideoTile';
import { formatDuration, getMeetingLayout } from '@/lib/meetingLayout';
import useRecorder from '@/hooks/useRecorder';
import useWebRTC from '@/hooks/useWebRTC';
import './MeetingPage.css';

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function readStoredRoomName(roomCode) {
  try {
    const rooms = JSON.parse(localStorage.getItem('clipmeet_rooms')) || {};
    return rooms[roomCode] || '';
  } catch {
    return '';
  }
}

function MeetingPage() {
  const { roomCode, roomId } = useParams();
  const resolvedRoomId = roomCode || roomId || 'Unknown';
  const navigate = useNavigate();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);
  const currentRoom = readJsonStorage('clipmeet_current_room', {});
  const participantName = localStorage.getItem('clipmeet_participant_name') || 'Guest';
  const localRoomName =
    currentRoom.roomCode === resolvedRoomId && currentRoom.roomName
      ? currentRoom.roomName
      : readStoredRoomName(resolvedRoomId) || resolvedRoomId;
  const {
    participants,
    peerNames,
    roomName: syncedRoomName,
    startedAt,
    isMuted,
    isCameraOff,
    screenShare,
    pendingScreenShareRequest,
    error,
    toggleMute,
    toggleCamera,
    requestScreenShare,
    approveScreenShareRequest,
    rejectScreenShareRequest,
    stopScreenShare,
    leaveMeeting,
  } = useWebRTC(resolvedRoomId, participantName, localRoomName);
  const roomName = syncedRoomName || localRoomName;
  const localStream = participants.find((participant) => participant.isLocal)?.stream || null;
  const {
    isRecording,
    meetingId,
    recordingStartTime,
    error: recorderError,
    startRecording,
    stopRecording,
  } = useRecorder(participants, resolvedRoomId, roomName);
  const layout = useMemo(() => getMeetingLayout(participants.length), [participants.length]);
  const sharedParticipant = useMemo(
    () => participants.find((participant) => participant.id === screenShare.sharerSocketId),
    [participants, screenShare.sharerSocketId]
  );
  const screenShareStream = screenShare.isLocalSharing
    ? screenShare.stream
    : sharedParticipant?.stream || null;

  useEffect(() => {
    if (!startedAt) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [startedAt]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAt) {
      return 0;
    }

    return Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  }, [nowMs, startedAt]);

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

  const handleToggleScreenShare = async () => {
    if (screenShare.isLocalSharing) {
      await stopScreenShare();
      return;
    }

    requestScreenShare();
  };

  const handleLeaveMeeting = async () => {
    console.log(`Leaving room ${resolvedRoomId}`);
    if (isRecording) {
      await stopRecording();
    }
    leaveMeeting();
    navigate('/');
  };

  return (
    <main className={screenShare.isActive ? 'meeting-page meeting-page--screen-share' : 'meeting-page'}>
      <TopBar
        roomName={roomName}
        participantCount={participants.length}
        duration={duration}
      />

      {error ? <p className="meeting-error">{error}</p> : null}
      {recorderError ? <p className="meeting-error">{recorderError}</p> : null}
      {screenShare.requestStatus ? <p className="meeting-info">{screenShare.requestStatus}</p> : null}
      {screenShare.requestError ? <p className="meeting-error">{screenShare.requestError}</p> : null}

      {screenShare.isActive ? (
        <section className="screen-share-layout" aria-label="Meeting screen share layout">
          <div className="screen-share-strip" aria-label="Participants">
            {participants.map((participant) => (
              <VideoTile
                key={participant.id}
                name={
                  participant.isLocal
                    ? `You (${participantName})`
                    : peerNames[participant.id] || participant.name
                }
                isMuted={participant.isMuted}
                isCameraOff={participant.isCameraOff}
                isLocal={participant.isLocal}
                muted={participant.isLocal}
                stream={participant.stream}
              />
            ))}
          </div>
          <ScreenShareStage
            label={`${screenShare.sharerName} sedang berbagi layar`}
            stream={screenShareStream}
          />
        </section>
      ) : (
        <section
          className={`meeting-grid meeting-grid--${layout.variant}`}
          aria-label="Meeting participants"
          style={{ '--meeting-grid-columns': layout.columns, '--meeting-grid-rows': layout.rows }}
        >
          {participants.map((participant) => (
            <VideoTile
              key={participant.id}
              name={
                participant.isLocal
                  ? `You (${participantName})`
                  : peerNames[participant.id] || participant.name
              }
              isMuted={participant.isMuted}
              isCameraOff={participant.isCameraOff}
              isLocal={participant.isLocal}
              muted={participant.isLocal}
              stream={participant.stream}
            />
          ))}
        </section>
      )}

      <LocalAudioMonitor stream={localStream} />

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
        isScreenSharing={screenShare.isLocalSharing}
        isScreenSharePending={Boolean(screenShare.requestStatus)}
        onToggleScreenShare={handleToggleScreenShare}
        onAddMarker={handleAddMarker}
        onLeaveMeeting={handleLeaveMeeting}
      />

      {pendingScreenShareRequest ? (
        <div className="screenshare-modal" role="dialog" aria-modal="true">
          <div className="screenshare-modal__panel">
            <p className="screenshare-modal__title">
              {pendingScreenShareRequest.requesterName} ingin berbagi layar
            </p>
            <div className="screenshare-modal__actions">
              <button
                type="button"
                onClick={() => rejectScreenShareRequest(pendingScreenShareRequest)}
              >
                Tolak
              </button>
              <button
                type="button"
                className="screenshare-modal__primary"
                onClick={() => approveScreenShareRequest(pendingScreenShareRequest)}
              >
                Izinkan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default MeetingPage;
