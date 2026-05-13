import { useEffect, useRef } from 'react';

function VideoTile({ name, isMuted, isCameraOff, isLocal, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    videoElement.srcObject = stream || null;

    if (!stream) {
      return;
    }

    videoElement.play().catch((playError) => {
      console.error('Failed to start participant media playback:', playError);
    });
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
            muted
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
