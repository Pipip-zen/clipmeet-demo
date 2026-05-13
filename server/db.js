const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.resolve(__dirname, 'db.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    room_id TEXT,
    started_at TEXT,
    ended_at TEXT,
    file_path TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS markers (
    id TEXT PRIMARY KEY,
    meeting_id TEXT,
    label TEXT,
    timestamp_seconds REAL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    meeting_id TEXT,
    label TEXT,
    start_time REAL,
    end_time REAL,
    file_path TEXT,
    status TEXT DEFAULT 'ready',
    error_message TEXT,
    sequence_number INTEGER,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );
`);

const meetingColumns = db.prepare('PRAGMA table_info(meetings)').all();
if (!meetingColumns.some((column) => column.name === 'user_id')) {
  db.prepare('ALTER TABLE meetings ADD COLUMN user_id TEXT REFERENCES users(id)').run();
}

const clipColumns = db.prepare('PRAGMA table_info(clips)').all();
if (!clipColumns.some((column) => column.name === 'status')) {
  db.prepare("ALTER TABLE clips ADD COLUMN status TEXT DEFAULT 'ready'").run();
}
if (!clipColumns.some((column) => column.name === 'error_message')) {
  db.prepare('ALTER TABLE clips ADD COLUMN error_message TEXT').run();
}
if (!clipColumns.some((column) => column.name === 'sequence_number')) {
  db.prepare('ALTER TABLE clips ADD COLUMN sequence_number INTEGER').run();
}

db.prepare(`
  UPDATE clips
  SET status = 'ready'
  WHERE status IS NULL OR status = ''
`).run();

db.prepare(`
  UPDATE clips
  SET sequence_number = (
    SELECT COUNT(*)
    FROM clips AS ranked
    WHERE ranked.meeting_id = clips.meeting_id
      AND (
        ranked.start_time < clips.start_time
        OR (ranked.start_time = clips.start_time AND ranked.id <= clips.id)
      )
  )
  WHERE sequence_number IS NULL
`).run();

const createUser = (username, passwordHash) => {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, username, passwordHash, createdAt);
  return getUserById(id);
};

const getUserByUsername = (username) => {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
};

const getUserById = (id) => {
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);
};

const createMeeting = (title, roomId, userId) => {
  const id = uuidv4();
  const startedAt = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO meetings (id, user_id, title, room_id, started_at) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, userId, title, roomId, startedAt);
  return getMeetingById(id, userId);
};

const updateMeetingFile = (id, filePath, userId) => {
  const stmt = db.prepare('UPDATE meetings SET file_path = ? WHERE id = ? AND user_id = ?');
  stmt.run(filePath, id, userId);
  return getMeetingById(id, userId);
};

const endMeeting = (id, userId) => {
  const endedAt = new Date().toISOString();
  const stmt = db.prepare('UPDATE meetings SET ended_at = ? WHERE id = ? AND user_id = ?');
  stmt.run(endedAt, id, userId);
  return getMeetingById(id, userId);
};

const createMarker = (meetingId, label, timestampSeconds) => {
  const id = uuidv4();
  const stmt = db.prepare('INSERT INTO markers (id, meeting_id, label, timestamp_seconds) VALUES (?, ?, ?, ?)');
  stmt.run(id, meetingId, label, timestampSeconds);
  return db.prepare('SELECT * FROM markers WHERE id = ?').get(id);
};

const getAllMeetings = (userId) => {
  return db
    .prepare('SELECT * FROM meetings WHERE user_id = ? ORDER BY started_at DESC')
    .all(userId);
};

const getMeetingById = (id, userId) => {
  const meeting = userId
    ? db.prepare('SELECT * FROM meetings WHERE id = ? AND user_id = ?').get(id, userId)
    : db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  if (!meeting) {
    return null;
  }

  meeting.markers = db.prepare('SELECT * FROM markers WHERE meeting_id = ? ORDER BY timestamp_seconds ASC').all(id);
  meeting.clips = db.prepare('SELECT * FROM clips WHERE meeting_id = ? ORDER BY sequence_number ASC, start_time ASC').all(id);

  return meeting;
};

const getNextClipSequenceNumber = (meetingId) => {
  const result = db
    .prepare('SELECT COALESCE(MAX(sequence_number), 0) AS maxSequence FROM clips WHERE meeting_id = ?')
    .get(meetingId);
  return (result?.maxSequence || 0) + 1;
};

const createClip = (meetingId, label, startTime, endTime, options = {}) => {
  const id = uuidv4();
  const sequenceNumber = options.sequenceNumber || getNextClipSequenceNumber(meetingId);
  const stmt = db.prepare(`
    INSERT INTO clips (
      id,
      meeting_id,
      label,
      start_time,
      end_time,
      file_path,
      status,
      error_message,
      sequence_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    meetingId,
    label,
    startTime,
    endTime,
    options.filePath || null,
    options.status || 'ready',
    options.errorMessage || null,
    sequenceNumber
  );
  return getClipById(id);
};

const updateClip = (id, updates = {}) => {
  const assignments = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'label')) {
    assignments.push('label = ?');
    values.push(updates.label);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'startTime')) {
    assignments.push('start_time = ?');
    values.push(updates.startTime);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'endTime')) {
    assignments.push('end_time = ?');
    values.push(updates.endTime);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'filePath')) {
    assignments.push('file_path = ?');
    values.push(updates.filePath);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    assignments.push('status = ?');
    values.push(updates.status);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'errorMessage')) {
    assignments.push('error_message = ?');
    values.push(updates.errorMessage);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'sequenceNumber')) {
    assignments.push('sequence_number = ?');
    values.push(updates.sequenceNumber);
  }

  if (assignments.length === 0) {
    return getClipById(id);
  }

  values.push(id);
  db.prepare(`UPDATE clips SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
  return getClipById(id);
};

const getClipById = (id) => {
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id);
};

const getClipByIdForUser = (id, userId) => {
  return db.prepare(`
    SELECT clips.*, meetings.room_id, meetings.user_id
    FROM clips
    INNER JOIN meetings ON meetings.id = clips.meeting_id
    WHERE clips.id = ? AND meetings.user_id = ?
  `).get(id, userId);
};

const getClipsByMeetingId = (meetingId) => {
  return db.prepare(`
    SELECT *
    FROM clips
    WHERE meeting_id = ?
    ORDER BY sequence_number ASC, start_time ASC
  `).all(meetingId);
};

const deleteMeetingById = (meetingId, userId) => {
  const meeting = getMeetingById(meetingId, userId);
  if (!meeting) {
    return null;
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM markers WHERE meeting_id = ?').run(meetingId);
    db.prepare('DELETE FROM clips WHERE meeting_id = ?').run(meetingId);
    db.prepare('DELETE FROM meetings WHERE id = ? AND user_id = ?').run(meetingId, userId);
  });

  transaction();
  return meeting;
};

module.exports = {
  db,
  createUser,
  getUserByUsername,
  getUserById,
  createMeeting,
  updateMeetingFile,
  endMeeting,
  createMarker,
  getAllMeetings,
  getMeetingById,
  createClip,
  updateClip,
  getClipById,
  getClipByIdForUser,
  getClipsByMeetingId,
  getNextClipSequenceNumber,
  deleteMeetingById,
};
