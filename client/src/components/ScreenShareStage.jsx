import { useEffect, useRef } from 'react';

function ScreenShareStage({ label, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream || null;
    }

    if (!stream) {
      return;
    }

    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((playError) => {
        if (playError.name !== 'AbortError') {
          console.error('Screen share play error:', playError);
        }
      });
    }
  }, [stream]);

  return (
    <section className="screen-share-stage" aria-label="Screen share">
      {stream ? (
        <video
          ref={videoRef}
          className="screen-share-stage__video"
          autoPlay
          muted
          playsInline
        />
      ) : (
        <div className="screen-share-stage__empty">Menunggu screen share...</div>
      )}
      <div className="screen-share-stage__label">{label}</div>
    </section>
  );
}

export default ScreenShareStage;
