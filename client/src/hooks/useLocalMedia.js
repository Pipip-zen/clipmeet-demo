import { useCallback, useEffect, useRef, useState } from 'react';

const MEDIA_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: true,
};

function useLocalMedia() {
  const [stream, setStream] = useState(null);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [error, setError] = useState('');
  const streamRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const setupMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);

        if (!isMounted) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsCamOn(mediaStream.getVideoTracks().some((track) => track.enabled));
        setIsMicOn(mediaStream.getAudioTracks().some((track) => track.enabled));
      } catch (mediaError) {
        console.error('Failed to access local media:', mediaError);
        if (isMounted) {
          setError('Izin kamera/mikrofon ditolak. Anda bisa tetap bergabung tanpa video.');
          setIsCamOn(false);
          setIsMicOn(false);
        }
      }
    };

    setupMedia();

    return () => {
      isMounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleCam = useCallback(() => {
    const videoTracks = streamRef.current?.getVideoTracks() || [];
    if (videoTracks.length === 0) {
      return;
    }

    setIsCamOn((currentValue) => {
      const nextValue = !currentValue;
      videoTracks.forEach((track) => {
        track.enabled = nextValue;
      });
      return nextValue;
    });
  }, []);

  const toggleMic = useCallback(() => {
    const audioTracks = streamRef.current?.getAudioTracks() || [];
    if (audioTracks.length === 0) {
      return;
    }

    setIsMicOn((currentValue) => {
      const nextValue = !currentValue;
      audioTracks.forEach((track) => {
        track.enabled = nextValue;
      });
      return nextValue;
    });
  }, []);

  return {
    stream,
    isCamOn,
    isMicOn,
    toggleCam,
    toggleMic,
    error,
  };
}

export default useLocalMedia;
