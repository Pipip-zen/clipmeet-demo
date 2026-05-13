import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration, getMeetingLayout } from '@/lib/meetingLayout';

const API_BASE_URL = 'http://localhost:3001/api';
const PREFERRED_MIME_TYPE = 'video/webm;codecs=vp8,opus';
const RECORDING_WIDTH = 1920;
const RECORDING_HEIGHT = 1080;
const HEADER_HEIGHT = 132;
const FOOTER_HEIGHT = 96;
const PADDING = 28;
const GAP = 18;

function getRecorderOptions() {
  if (MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)) {
    return { mimeType: PREFERRED_MIME_TYPE };
  }

  return undefined;
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

function fitText(ctx, text, maxWidth, baseSize, weight = 700) {
  let size = baseSize;
  while (size > 22) {
    ctx.font = `${weight} ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= 2;
  }

  return size;
}

function drawVideoCover(ctx, video, x, y, width, height) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  ctx.drawImage(
    video,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
}

function drawPill(ctx, x, y, label, value, showDot = false) {
  ctx.font = '500 22px Arial';
  const labelWidth = ctx.measureText(label).width;
  ctx.font = '700 26px Arial';
  const valueWidth = ctx.measureText(String(value)).width;
  const dotWidth = showDot ? 24 : 0;
  const width = 36 + dotWidth + labelWidth + 14 + valueWidth + 22;
  const height = 50;

  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = 2;
  ctx.stroke();

  let cursorX = x + 18;
  ctx.textBaseline = 'middle';

  if (showDot) {
    ctx.beginPath();
    ctx.arc(cursorX + 7, y + height / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    cursorX += 24;
  }

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 22px Arial';
  ctx.fillText(label, cursorX, y + height / 2);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 26px Arial';
  ctx.fillText(String(value), cursorX + labelWidth + 14, y + height / 2);

  return width;
}

function createMixedRecorder({ getParticipants, getRoomName, getDurationText }) {
  const canvas = document.createElement('canvas');
  canvas.width = RECORDING_WIDTH;
  canvas.height = RECORDING_HEIGHT;

  const ctx = canvas.getContext('2d');
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  const videoElements = new Map();
  const audioSources = new Map();
  let animationFrameId = null;

  const syncParticipants = async () => {
    const participants = getParticipants();
    const activeIds = new Set(participants.map((participant) => participant.id));

    for (const participant of participants) {
      const existingVideo = videoElements.get(participant.id);
      if (!existingVideo || existingVideo.stream !== participant.stream) {
        if (existingVideo) {
          existingVideo.video.pause();
          existingVideo.video.srcObject = null;
        }

        if (participant.stream) {
          const video = document.createElement('video');
          video.srcObject = participant.stream;
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => {});
          videoElements.set(participant.id, { video, stream: participant.stream });
        }
      }

      const existingAudio = audioSources.get(participant.id);
      const hasAudio = participant.stream?.getAudioTracks().length > 0;
      if ((!existingAudio || existingAudio.stream !== participant.stream) && hasAudio) {
        if (existingAudio) {
          existingAudio.source.disconnect();
        }

        const source = audioContext.createMediaStreamSource(participant.stream);
        source.connect(destination);
        audioSources.set(participant.id, { source, stream: participant.stream });
      }
    }

    for (const [participantId, entry] of videoElements.entries()) {
      if (!activeIds.has(participantId)) {
        entry.video.pause();
        entry.video.srcObject = null;
        videoElements.delete(participantId);
      }
    }

    for (const [participantId, entry] of audioSources.entries()) {
      if (!activeIds.has(participantId)) {
        entry.source.disconnect();
        audioSources.delete(participantId);
      }
    }
  };

  const drawFrame = () => {
    const participants = getParticipants();
    const layout = getMeetingLayout(participants.length || 1);
    const gridTop = HEADER_HEIGHT + PADDING;
    const gridBottom = RECORDING_HEIGHT - FOOTER_HEIGHT - PADDING;
    const availableWidth = RECORDING_WIDTH - PADDING * 2;
    const availableHeight = gridBottom - gridTop;
    const tileWidth = (availableWidth - (layout.columns - 1) * GAP) / layout.columns;
    const tileHeight = (availableHeight - (layout.rows - 1) * GAP) / layout.rows;

    const gradient = ctx.createLinearGradient(0, 0, 0, RECORDING_HEIGHT);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#0f172a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);

    roundedRect(ctx, 24, 24, RECORDING_WIDTH - 48, HEADER_HEIGHT - 26, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const durationText = getDurationText();
    const durationWidth = drawPill(ctx, RECORDING_WIDTH - 272, 54, 'Duration', durationText, true);
    const participantsWidth = drawPill(
      ctx,
      RECORDING_WIDTH - 288 - durationWidth - 16,
      54,
      'Participants',
      participants.length
    );
    const titleMaxWidth = RECORDING_WIDTH - 96 - durationWidth - participantsWidth - 72;

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 18px Arial';
    ctx.fillText('LIVE MEETING', 48, 48);
    ctx.fillStyle = '#f8fafc';
    const titleSize = fitText(ctx, getRoomName(), titleMaxWidth, 54, 700);
    ctx.font = `700 ${titleSize}px Arial`;
    ctx.fillText(getRoomName(), 48, 82);

    participants.forEach((participant, index) => {
      const row = Math.floor(index / layout.columns);
      const column = index % layout.columns;
      const x = PADDING + column * (tileWidth + GAP);
      const y = gridTop + row * (tileHeight + GAP);
      const footerHeight = 68;
      const bodyHeight = tileHeight - footerHeight;

      roundedRect(ctx, x, y, tileWidth, tileHeight, 28);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.fill();
      ctx.strokeStyle = participant.isLocal
        ? 'rgba(96, 165, 250, 0.5)'
        : 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      roundedRect(ctx, x, y, tileWidth, tileHeight, 28);
      ctx.clip();

      const videoEntry = videoElements.get(participant.id);
      const canDrawVideo =
        videoEntry &&
        !participant.isCameraOff &&
        videoEntry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      if (canDrawVideo) {
        drawVideoCover(ctx, videoEntry.video, x, y, tileWidth, bodyHeight);
      } else {
        const tileGradient = ctx.createLinearGradient(x, y, x + tileWidth, y + bodyHeight);
        tileGradient.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
        tileGradient.addColorStop(1, 'rgba(34, 211, 238, 0.18)');
        ctx.fillStyle = tileGradient;
        ctx.fillRect(x, y, tileWidth, bodyHeight);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 84px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          (participant.name || 'G').charAt(0).toUpperCase(),
          x + tileWidth / 2,
          y + bodyHeight / 2
        );
        ctx.textAlign = 'left';
      }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(x, y, tileWidth, 44);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 20px Arial';
      ctx.textBaseline = 'middle';
      ctx.fillText(participant.isCameraOff ? 'Camera off' : 'Camera on', x + 20, y + 22);
      const micStatus = participant.isMuted ? 'Muted' : 'Mic on';
      ctx.fillText(micStatus, x + tileWidth - ctx.measureText(micStatus).width - 20, y + 22);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
      ctx.fillRect(x, y + bodyHeight, tileWidth, footerHeight);
      ctx.fillStyle = '#f8fafc';
      const nameSize = fitText(ctx, participant.name, tileWidth - 120, 30, 700);
      ctx.font = `700 ${nameSize}px Arial`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(participant.name, x + 20, y + bodyHeight + 42);

      if (participant.isLocal) {
        roundedRect(ctx, x + tileWidth - 80, y + bodyHeight + 14, 60, 36, 18);
        ctx.fillStyle = 'rgba(30, 64, 175, 0.42)';
        ctx.fill();
        ctx.fillStyle = '#bfdbfe';
        ctx.font = '600 18px Arial';
        ctx.textBaseline = 'middle';
        ctx.fillText('You', x + tileWidth - 60, y + bodyHeight + 32);
      }

      ctx.restore();
    });

    roundedRect(ctx, 24, RECORDING_HEIGHT - FOOTER_HEIGHT, RECORDING_WIDTH - 48, 72, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText('Recording full meeting stage', 56, RECORDING_HEIGHT - FOOTER_HEIGHT + 36);

    animationFrameId = requestAnimationFrame(drawFrame);
  };

  const start = async () => {
    await syncParticipants();
    await audioContext.resume();
    drawFrame();
  };

  const stop = async () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    for (const entry of videoElements.values()) {
      entry.video.pause();
      entry.video.srcObject = null;
    }
    videoElements.clear();

    for (const entry of audioSources.values()) {
      entry.source.disconnect();
    }
    audioSources.clear();

    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
  };

  const stream = canvas.captureStream(30);
  destination.stream.getAudioTracks().forEach((track) => {
    stream.addTrack(track);
  });

  return {
    stream,
    start,
    stop,
    syncParticipants,
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
  const mixedRecorderRef = useRef(null);

  useEffect(() => {
    participantsRef.current = participants;
    mixedRecorderRef.current?.syncParticipants().catch((syncError) => {
      console.error('Failed to sync recording participants:', syncError);
    });
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
      const mixedRecorder = createMixedRecorder({
        getParticipants: () => participantsRef.current,
        getRoomName: () => meetingTitle || roomId,
        getDurationText: () => {
          if (!recordingStartTimeRef.current) {
            return '00:00:00';
          }

          return formatDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        },
      });
      const recorderOptions = getRecorderOptions();
      const recorder = recorderOptions
        ? new MediaRecorder(mixedRecorder.stream, recorderOptions)
        : new MediaRecorder(mixedRecorder.stream);
      const startTime = Date.now();

      console.log('Recording audio tracks:', mixedRecorder.stream.getAudioTracks().length);
      console.log('Recording video tracks:', mixedRecorder.stream.getVideoTracks().length);

      chunksRef.current = [];
      meetingIdRef.current = meeting.id;
      recordingStartTimeRef.current = startTime;
      mediaRecorderRef.current = recorder;
      mixedRecorderRef.current = mixedRecorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      await mixedRecorder.start();
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
    const mixedRecorder = mixedRecorderRef.current;

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
          await mixedRecorder?.stop().catch((sceneError) => {
            console.error('Failed to stop mixed recorder:', sceneError);
          });

          chunksRef.current = [];
          mediaRecorderRef.current = null;
          mixedRecorderRef.current = null;
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
