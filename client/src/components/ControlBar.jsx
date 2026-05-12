function ControlBar({
  isMuted,
  isCameraOff,
  isRecording,
  onToggleMute,
  onToggleCamera,
  onToggleRecording,
  onAddMarker,
  onLeaveMeeting,
}) {
  return (
    <div className="control-bar">
      <button
        type="button"
        className={`control-button${isMuted ? ' control-button--active' : ''}`}
        onClick={onToggleMute}
      >
        {isMuted ? 'Unmute Mic' : 'Mute Mic'}
      </button>

      <button
        type="button"
        className={`control-button${isCameraOff ? ' control-button--active' : ''}`}
        onClick={onToggleCamera}
      >
        {isCameraOff ? 'Camera On' : 'Camera Off'}
      </button>

      <button
        type="button"
        className={`control-button control-button--record${isRecording ? ' control-button--recording' : ''}`}
        onClick={onToggleRecording}
      >
        <span className="control-button__record-dot" />
        {isRecording ? 'Stop Record' : 'Start Record'}
      </button>

      <button
        type="button"
        className="control-button"
        onClick={onAddMarker}
        disabled={!isRecording}
      >
        Add Marker
      </button>

      <button
        type="button"
        className="control-button control-button--leave"
        onClick={onLeaveMeeting}
      >
        Leave Meeting
      </button>
    </div>
  );
}

export default ControlBar;
