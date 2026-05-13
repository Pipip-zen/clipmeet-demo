import { useEffect, useRef } from 'react';

function VideoTile({ name, isMuted, isCameraOff, isLocal, muted = false, stream }) {
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
          console.error('Video play error:', playError);
        }
      });
    }
  }, [stream]);

  return (
    <article className={`video-tile${isLocal ? ' video-tile--local' : ''}`}>
      <div className="video-tile__screen">
        {stream && !isCameraOff ? (
          <video
            ref={videoRef}
            className="video-tile__video"
            autoPlay
            playsInline
            muted={muted}
          />
        ) : (
          <div className="video-tile__avatar" aria-hidden="true">
            {name.charAt(0)}
          </div>
        )}
        <div className="video-tile__status">
          <span>{isCameraOff ? 'Camera off' : 'Camera on'}</span>
          <span>{isMuted ? 'Muted' : 'Mic on'}</span>
        </div>
      </div>

      <footer className="video-tile__footer">
        <span className="video-tile__name">{name}</span>
        {isLocal ? <span className="video-tile__badge">You</span> : null}
      </footer>
    </article>
  );
}

export default VideoTile;
