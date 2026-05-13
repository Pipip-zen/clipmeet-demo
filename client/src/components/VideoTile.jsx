import { Camera, CameraOff, Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const VOICE_MIN_VOLUME = 0.075;
const VOICE_NOISE_MULTIPLIER = 4.2;
const VOICE_ATTACK_FRAMES = 4;
const VOICE_RELEASE_FRAMES = 14;

function VideoTile({ name, isMuted, isCameraOff, isLocal, muted = false, stream }) {
  const videoRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (!stream) {
      videoElement.srcObject = null;
      return;
    }

    if (videoElement.srcObject === stream) {
      return;
    }

    videoElement.srcObject = stream;

    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((playError) => {
        if (playError.name !== 'AbortError') {
          console.error('Video play error:', playError);
        }
      });
    }
  }, [stream]);

  useEffect(() => {
    const audioTracks = stream?.getAudioTracks() || [];
    if (!stream || audioTracks.length === 0 || isMuted) {
      return undefined;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return undefined;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.fftSize);
    let animationFrameId = 0;
    let speakingFrames = 0;
    let silentFrames = 0;
    let noiseFloor = 0.02;

    analyser.fftSize = 1024;
    source.connect(analyser);

    const detectVoice = () => {
      analyser.getByteTimeDomainData(samples);

      let total = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centeredSample = (samples[index] - 128) / 128;
        total += centeredSample * centeredSample;
      }

      const volume = Math.sqrt(total / samples.length);
      const speakingThreshold = Math.max(VOICE_MIN_VOLUME, noiseFloor * VOICE_NOISE_MULTIPLIER);
      const isVoiceDetected = audioTracks.some((track) => track.enabled) && volume > speakingThreshold;

      if (!isVoiceDetected) {
        noiseFloor = noiseFloor * 0.94 + volume * 0.06;
      }

      if (isVoiceDetected) {
        speakingFrames += 1;
        silentFrames = 0;
      } else {
        silentFrames += 1;
        speakingFrames = 0;
      }

      if (speakingFrames >= VOICE_ATTACK_FRAMES) {
        setIsSpeaking(true);
      }
      if (silentFrames >= VOICE_RELEASE_FRAMES) {
        setIsSpeaking(false);
      }

      animationFrameId = window.requestAnimationFrame(detectVoice);
    };

    audioContext.resume().catch(() => {});
    detectVoice();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [isMuted, stream]);

  const isActivelySpeaking = Boolean(stream) && !isMuted && isSpeaking;

  return (
    <article className={`video-tile${isLocal ? ' video-tile--local' : ''}${isActivelySpeaking ? ' video-tile--speaking' : ''}`}>
      <div className="video-tile__screen">
        {stream ? (
          <video
            ref={videoRef}
            className="video-tile__video"
            autoPlay
            playsInline
            muted={muted}
          />
        ) : null}

        {(!stream || isCameraOff) ? (
          <div className="video-tile__avatar" aria-hidden="true">
            {name.charAt(0)}
          </div>
        ) : null}

        <div className="video-tile__status">
          <span
            className={isCameraOff ? 'video-tile__status-off' : 'video-tile__status-on'}
            title={isCameraOff ? 'Camera off' : 'Camera on'}
            aria-label={isCameraOff ? 'Camera off' : 'Camera on'}
          >
            {isCameraOff ? <CameraOff size={14} strokeWidth={2.4} /> : <Camera size={14} strokeWidth={2.4} />}
          </span>
          <span
            className={isMuted ? 'video-tile__status-off' : 'video-tile__status-on'}
            title={isMuted ? 'Mic off' : 'Mic on'}
            aria-label={isMuted ? 'Mic off' : 'Mic on'}
          >
            {isMuted ? <MicOff size={14} strokeWidth={2.4} /> : <Mic size={14} strokeWidth={2.4} />}
          </span>
        </div>

        <footer className="video-tile__footer">
          <span className="video-tile__name">{name}</span>
          {isLocal ? <span className="video-tile__badge">You</span> : null}
        </footer>
      </div>
    </article>
  );
}

export default VideoTile;
