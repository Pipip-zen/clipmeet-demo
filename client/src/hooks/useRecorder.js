import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration, getMeetingLayout } from '@/lib/meetingLayout';

const API_BASE_URL = 'http://localhost:3001/api';
const RECORDING_WIDTH = 1920;
const RECORDING_HEIGHT = 1080;
const HEADER_HEIGHT = 132;
const FOOTER_HEIGHT = 112;
const SURFACE_PADDING = 28;
const GRID_GAP = 18;
const HEADER_INNER_PADDING = 24;

function getSupportedMimeType() {
  const preferredTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function assertOk(response, fallbackMessage) {
  if (response.ok) {
    return response.json();
  }

  let message = fallbackMessage;
  try {
    const body = await response.json();
    message = body.error || message;
  } catch {
    // Keep fallback when server response is not JSON.
  }

  throw new Error(message);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getPillWidth(ctx, label, value, showDot = false) {
  ctx.font = '500 24px Arial';
  const labelWidth = ctx.measureText(label).width;
  ctx.font = '700 28px Arial';
  const valueWidth = ctx.measureText(String(value)).width;
  const dotWidth = showDot ? 26 : 0;

  return Math.ceil(36 + dotWidth + labelWidth + 16 + valueWidth + 24);
}

function drawPill(ctx, x, y, width, height, label, value, showDot = false) {
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();

  let cursorX = x + 18;
  ctx.textBaseline = 'middle';

  if (showDot) {
    ctx.beginPath();
    ctx.arc(cursorX + 7, y + height / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    cursorX += 26;
  }

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 24px Arial';
  ctx.fillText(label, cursorX, y + height / 2);

  const labelWidth = ctx.measureText(label).width;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 28px Arial';
  ctx.fillText(String(value), cursorX + labelWidth + 16, y + height / 2);
}

function drawVideoCover(ctx, video, x, y, width, height) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
}

function fitText(ctx, text, maxWidth, baseSize, weight = 700) {
  let fontSize = baseSize;
  while (fontSize > 24) {
    ctx.font = `${weight} ${fontSize}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 2;
  }

  return fontSize;
}

function createSceneRecorder({ getParticipants, getRoomName, getDurationText }) {
  const canvas = document.createElement('canvas');
  canvas.width = RECORDING_WIDTH;
  canvas.height = RECORDING_HEIGHT;

  const ctx = canvas.getContext('2d');
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const videos = new Map();
  const audioNodes = new Map();
  let frameId = null;

  const syncParticipants = async () => {
    const participants = getParticipants();
    const ids = new Set(participants.map((participant) => participant.id));

    for (const participant of participants) {
      const previous = videos.get(participant.id);

      if (!previous || previous.stream !== participant.stream) {
        if (previous) {
          previous.video.pause();
          videos.delete(participant.id);
        }

        if (participant.stream) {
          const video = document.createElement('video');
          video.srcObject = participant.stream;
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => {});
          videos.set(participant.id, { video, stream: participant.stream });
        }
      }

      const hasAudio = participant.stream?.getAudioTracks()?.length > 0;
      if (hasAudio && !audioNodes.has(participant.id)) {
        const source = audioContext.createMediaStreamSource(participant.stream);
        source.connect(destination);
        audioNodes.set(participant.id, source);
      } else if (!hasAudio && audioNodes.has(participant.id)) {
        audioNodes.get(participant.id)?.disconnect();
        audioNodes.delete(participant.id);
      }
    }

    for (const [participantId, entry] of videos.entries()) {
      if (!ids.has(participantId)) {
        entry.video.pause();
        videos.delete(participantId);
      }
    }

    for (const [participantId, source] of audioNodes.entries()) {
      if (!ids.has(participantId)) {
        source.disconnect();
        audioNodes.delete(participantId);
      }
    }
  };

  const drawFrame = () => {
    const participants = getParticipants();
    const durationText = getDurationText();
    const roomName = getRoomName();
    const layout = getMeetingLayout(participants.length || 1);

    const gridTop = HEADER_HEIGHT + SURFACE_PADDING;
    const gridBottom = RECORDING_HEIGHT - FOOTER_HEIGHT - SURFACE_PADDING;
    const gridHeight = gridBottom - gridTop;
    const availableWidth = RECORDING_WIDTH - SURFACE_PADDING * 2;
    const tileWidth =
      (availableWidth - (layout.columns - 1) * GRID_GAP) / layout.columns;
    const tileHeight =
      (gridHeight - (layout.rows - 1) * GRID_GAP) / layout.rows;

    ctx.clearRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);

    const gradient = ctx.createLinearGradient(0, 0, 0, RECORDING_HEIGHT);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);

    const glow = ctx.createRadialGradient(520, 80, 0, 520, 80, 640);
    glow.addColorStop(0, 'rgba(88, 103, 221, 0.28)');
    glow.addColorStop(1, 'rgba(88, 103, 221, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);

    roundedRect(ctx, 24, 24, RECORDING_WIDTH - 48, HEADER_HEIGHT - 26, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 18px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText('LIVE MEETING', 48, 48);

    const participantsPillWidth = getPillWidth(ctx, 'Participants', participants.length);
    const durationPillWidth = getPillWidth(ctx, 'Duration', durationText, true);
    const pillsWidth = participantsPillWidth + durationPillWidth + 16;
    const headerRightEdge = RECORDING_WIDTH - 48;
    const durationPillX = headerRightEdge - durationPillWidth;
    const participantsPillX = durationPillX - 16 - participantsPillWidth;
    const titleMaxWidth =
      participantsPillX - 32 - (48 + HEADER_INNER_PADDING);

    ctx.fillStyle = '#f8fafc';
    const titleSize = fitText(ctx, roomName, titleMaxWidth, 58, 700);
    ctx.font = `700 ${titleSize}px Arial`;
    ctx.fillText(roomName, 48, 82);

    drawPill(ctx, participantsPillX, 54, participantsPillWidth, 52, 'Participants', participants.length);
    drawPill(ctx, durationPillX, 54, durationPillWidth, 52, 'Duration', durationText, true);

    participants.forEach((participant, index) => {
      const row = Math.floor(index / layout.columns);
      const column = index % layout.columns;
      const tileX = SURFACE_PADDING + column * (tileWidth + GRID_GAP);
      const tileY = gridTop + row * (tileHeight + GRID_GAP);
      const footerHeight = 68;
      const bodyHeight = tileHeight - footerHeight;

      roundedRect(ctx, tileX, tileY, tileWidth, tileHeight, 28);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
      ctx.fill();
      ctx.strokeStyle = participant.isLocal
        ? 'rgba(96, 165, 250, 0.5)'
        : 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      roundedRect(ctx, tileX, tileY, tileWidth, tileHeight, 28);
      ctx.clip();

      const videoEntry = videos.get(participant.id);
      const canDrawVideo =
        videoEntry &&
        !participant.isCameraOff &&
        videoEntry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      if (canDrawVideo) {
        drawVideoCover(ctx, videoEntry.video, tileX, tileY, tileWidth, bodyHeight);
      } else {
        const tileGradient = ctx.createLinearGradient(tileX, tileY, tileX + tileWidth, tileY + bodyHeight);
        tileGradient.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
        tileGradient.addColorStop(1, 'rgba(34, 211, 238, 0.18)');
        ctx.fillStyle = tileGradient;
        ctx.fillRect(tileX, tileY, tileWidth, bodyHeight);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 84px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          (participant.name || 'G').charAt(0).toUpperCase(),
          tileX + tileWidth / 2,
          tileY + bodyHeight / 2
        );
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(tileX, tileY, tileWidth, 44);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 20px Arial';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        participant.isCameraOff ? 'Camera off' : 'Camera on',
        tileX + 20,
        tileY + 22
      );
      const rightStatus = participant.isMuted ? 'Muted' : 'Mic on';
      const rightStatusWidth = ctx.measureText(rightStatus).width;
      ctx.fillText(
        rightStatus,
        tileX + tileWidth - rightStatusWidth - 20,
        tileY + 22
      );

      ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
      ctx.fillRect(tileX, tileY + bodyHeight, tileWidth, footerHeight);
      ctx.fillStyle = '#f8fafc';
      const nameSize = fitText(ctx, participant.name, tileWidth - 120, 30, 700);
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 ${nameSize}px Arial`;
      ctx.fillText(participant.name, tileX + 20, tileY + bodyHeight + 42);

      if (participant.isLocal) {
        const badgeWidth = 60;
        roundedRect(ctx, tileX + tileWidth - badgeWidth - 20, tileY + bodyHeight + 14, badgeWidth, 36, 18);
        ctx.fillStyle = 'rgba(30, 64, 175, 0.42)';
        ctx.fill();
        ctx.fillStyle = '#bfdbfe';
        ctx.font = '600 18px Arial';
        ctx.textBaseline = 'middle';
        const badgeTextWidth = ctx.measureText('You').width;
        ctx.fillText('You', tileX + tileWidth - 20 - badgeWidth / 2 - badgeTextWidth / 2, tileY + bodyHeight + 32);
      }

      ctx.restore();
    });

    roundedRect(ctx, 24, RECORDING_HEIGHT - FOOTER_HEIGHT, RECORDING_WIDTH - 48, 84, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px Arial';
    ctx.fillText('Recording full meeting stage', 56, RECORDING_HEIGHT - 66);

    frameId = requestAnimationFrame(drawFrame);
  };

  const start = async () => {
    await syncParticipants();
    await audioContext.resume();
    drawFrame();
  };

  const stop = async () => {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }

    for (const entry of videos.values()) {
      entry.video.pause();
      entry.video.srcObject = null;
    }
    videos.clear();

    for (const source of audioNodes.values()) {
      source.disconnect();
    }
    audioNodes.clear();

    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
  };

  const stream = canvas.captureStream(30);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  return {
    stream,
    syncParticipants,
    start,
    stop,
  };
}

function useRecorder(participants, roomId, meetingTitle = '') {
  const [isRecording, setIsRecording] = useState(false);
  const [meetingId, setMeetingId] = useState(null);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [error, setError] = useState('');

  const participantsRef = useRef(participants);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const meetingIdRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const sceneRecorderRef = useRef(null);

  useEffect(() => {
    participantsRef.current = participants;
    if (sceneRecorderRef.current) {
      sceneRecorderRef.current.syncParticipants().catch((syncError) => {
        console.error('Failed to sync recorder participants:', syncError);
      });
    }
  }, [participants]);

  const createMeeting = useCallback(async () => {
    const resolvedTitle = meetingTitle && meetingTitle !== roomId
      ? `Meeting ${meetingTitle}`
      : `Meeting ${roomId}`;

    const response = await fetch(`${API_BASE_URL}/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: resolvedTitle,
        roomId,
      }),
    });

    return assertOk(response, 'Failed to create meeting.');
  }, [meetingTitle, roomId]);

  const uploadRecording = useCallback(async (id, blob) => {
    const formData = new FormData();
    formData.append('video', blob, `${id}.webm`);

    const response = await fetch(`${API_BASE_URL}/meetings/${id}/upload`, {
      method: 'POST',
      body: formData,
    });

    return assertOk(response, 'Failed to upload recording.');
  }, []);

  const endMeeting = useCallback(async (id) => {
    const response = await fetch(`${API_BASE_URL}/meetings/${id}/end`, {
      method: 'PATCH',
    });

    return assertOk(response, 'Failed to end meeting.');
  }, []);

  const startRecording = useCallback(async () => {
    if (!participantsRef.current.length || isRecording) {
      return null;
    }

    try {
      setError('');
      const meeting = await createMeeting();
      const sceneRecorder = createSceneRecorder({
        getParticipants: () => participantsRef.current,
        getRoomName: () => meetingTitle || roomId,
        getDurationText: () => {
          const startedAt = recordingStartTimeRef.current;
          if (!startedAt) {
            return '00:00:00';
          }

          const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
          return formatDuration(elapsedSeconds);
        },
      });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        sceneRecorder.stream,
        mimeType ? { mimeType } : undefined
      );
      const startTime = Date.now();

      chunksRef.current = [];
      meetingIdRef.current = meeting.id;
      recordingStartTimeRef.current = startTime;
      mediaRecorderRef.current = recorder;
      sceneRecorderRef.current = sceneRecorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      await sceneRecorder.start();
      recorder.start(1000);
      setMeetingId(meeting.id);
      setRecordingStartTime(startTime);
      setRecordingBlob(null);
      setIsRecording(true);

      return meeting.id;
    } catch (recordingError) {
      console.error('Failed to start recording:', recordingError);
      setError(recordingError.message);
      throw recordingError;
    }
  }, [createMeeting, isRecording, meetingTitle, roomId]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    const id = meetingIdRef.current;
    const sceneRecorder = sceneRecorderRef.current;

    if (!recorder || recorder.state === 'inactive' || !id) {
      return null;
    }

    return new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        try {
          const mimeType = recorder.mimeType || 'video/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });

          setRecordingBlob(blob);
          await uploadRecording(id, blob);
          await endMeeting(id);

          resolve(blob);
        } catch (recordingError) {
          console.error('Failed to stop recording:', recordingError);
          setError(recordingError.message);
          reject(recordingError);
        } finally {
          await sceneRecorder?.stop().catch((sceneError) => {
            console.error('Failed to stop recording scene:', sceneError);
          });

          chunksRef.current = [];
          mediaRecorderRef.current = null;
          sceneRecorderRef.current = null;
          meetingIdRef.current = null;
          recordingStartTimeRef.current = null;
          setIsRecording(false);
          setRecordingStartTime(null);
        }
      };

      recorder.stop();
    });
  }, [endMeeting, uploadRecording]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
  }, []);

  return {
    isRecording,
    meetingId,
    recordingStartTime,
    recordingBlob,
    error,
    startRecording,
    stopRecording,
  };
}

export default useRecorder;
