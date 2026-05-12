import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE_URL = 'http://localhost:3001/api';

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

function useRecorder(stream, roomId, meetingTitle = '') {
  const [isRecording, setIsRecording] = useState(false);
  const [meetingId, setMeetingId] = useState(null);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const meetingIdRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

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
    if (!stream || isRecording) {
      return null;
    }

    try {
      setError('');
      const meeting = await createMeeting();
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const startTime = Date.now();

      chunksRef.current = [];
      meetingIdRef.current = meeting.id;
      recordingStartTimeRef.current = startTime;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start();
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
  }, [createMeeting, isRecording, stream]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    const id = meetingIdRef.current;

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

          chunksRef.current = [];
          mediaRecorderRef.current = null;
          recordingStartTimeRef.current = null;
          setIsRecording(false);
          setRecordingStartTime(null);

          resolve(blob);
        } catch (recordingError) {
          console.error('Failed to stop recording:', recordingError);
          setError(recordingError.message);
          reject(recordingError);
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
