import { useEffect, useRef } from 'react';

function LocalAudioMonitor({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    if (audioElement.srcObject !== stream) {
      audioElement.srcObject = stream || null;
    }

    if (!stream) {
      return;
    }

    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((playError) => {
        if (playError.name !== 'AbortError') {
          console.error('Local audio monitor error:', playError);
        }
      });
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline hidden />;
}

export default LocalAudioMonitor;
