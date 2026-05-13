const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.resolve(__dirname, 'db.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

// Initialize database schema
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
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );
`);

const meetingColumns = db.prepare('PRAGMA table_info(meetings)').all();
if (!meetingColumns.some((column) => column.name === 'user_id')) {
  db.prepare('ALTER TABLE meetings ADD COLUMN user_id TEXT REFERENCES users(id)').run();
}

// Helper functions for Database Queries

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
  if (!meeting) return null;
  
  meeting.markers = db.prepare('SELECT * FROM markers WHERE meeting_id = ? ORDER BY timestamp_seconds ASC').all(id);
  meeting.clips = db.prepare('SELECT * FROM clips WHERE meeting_id = ? ORDER BY start_time ASC').all(id);
  
  return meeting;
};

const createClip = (meetingId, label, startTime, endTime, filePath) => {
  const id = uuidv4();
  const stmt = db.prepare('INSERT INTO clips (id, meeting_id, label, start_time, end_time, file_path) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(id, meetingId, label, startTime, endTime, filePath);
  return getClipById(id);
};

const getClipById = (id) => {
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id);
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
  getClipById
};
