import { useEffect, useRef } from 'react';

function ParticipantAudio({ stream, label }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    audioElement.srcObject = stream || null;

    if (!stream) {
      return;
    }

    audioElement.play().catch((playError) => {
      console.error(`Failed to start audio playback for ${label}:`, playError);
    });
  }, [label, stream]);

  return <audio ref={audioRef} autoPlay playsInline hidden />;
}

export default ParticipantAudio;
