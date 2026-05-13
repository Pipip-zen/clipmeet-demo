function TopBar({
  roomId,
  roomName,
  participantCount,
  duration,
  onCopyRoomId,
  onCopyInviteLink,
  copyState,
}) {
  return (
    <header className="meeting-topbar">
      <div className="meeting-topbar__main">
        <p className="meeting-topbar__eyebrow">Live meeting</p>
        <h1 className="meeting-topbar__title">{roomName}</h1>
        <p className="meeting-topbar__room-id">Room ID: {roomId}</p>
      </div>

      <div className="meeting-topbar__meta">
        <div className="meeting-topbar__stats">
          <div className="meeting-pill">
            <span className="meeting-pill__label">Participants</span>
            <strong>{participantCount}</strong>
          </div>
          <div className="meeting-pill meeting-pill--timer">
            <span className="meeting-pill__dot" />
            <span className="meeting-pill__label">Duration</span>
            <strong>{duration}</strong>
          </div>
        </div>

        <div className="meeting-topbar__actions">
          <button type="button" className="meeting-topbar__button" onClick={onCopyRoomId}>
            {copyState === 'roomId' ? 'Copied!' : 'Copy Room ID'}
          </button>
          <button type="button" className="meeting-topbar__button" onClick={onCopyInviteLink}>
            {copyState === 'inviteLink' ? 'Copied!' : 'Copy Invite Link'}
          </button>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
