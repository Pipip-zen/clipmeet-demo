function TopBar({ roomName, participantCount, duration }) {
  return (
    <header className="meeting-topbar">
      <div>
        <p className="meeting-topbar__eyebrow">Live meeting</p>
        <h1 className="meeting-topbar__title">{roomName}</h1>
      </div>

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
    </header>
  );
}

export default TopBar;
