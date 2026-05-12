const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.resolve(__dirname, 'db.sqlite');
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    room_id TEXT,
    started_at TEXT,
    ended_at TEXT,
    file_path TEXT
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

// Helper functions for Database Queries

const createMeeting = (title, roomId) => {
  const id = uuidv4();
  const startedAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO meetings (id, title, room_id, started_at) VALUES (?, ?, ?, ?)');
  stmt.run(id, title, roomId, startedAt);
  return getMeetingById(id);
};

const updateMeetingFile = (id, filePath) => {
  const stmt = db.prepare('UPDATE meetings SET file_path = ? WHERE id = ?');
  stmt.run(filePath, id);
  return getMeetingById(id);
};

const endMeeting = (id) => {
  const endedAt = new Date().toISOString();
  const stmt = db.prepare('UPDATE meetings SET ended_at = ? WHERE id = ?');
  stmt.run(endedAt, id);
  return getMeetingById(id);
};

const createMarker = (meetingId, label, timestampSeconds) => {
  const id = uuidv4();
  const stmt = db.prepare('INSERT INTO markers (id, meeting_id, label, timestamp_seconds) VALUES (?, ?, ?, ?)');
  stmt.run(id, meetingId, label, timestampSeconds);
  return db.prepare('SELECT * FROM markers WHERE id = ?').get(id);
};

const getAllMeetings = () => {
  return db.prepare('SELECT * FROM meetings ORDER BY started_at DESC').all();
};

const getMeetingById = (id) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  if (!meeting) return null;
  
  meeting.markers = db.prepare('SELECT * FROM markers WHERE meeting_id = ? ORDER BY timestamp_seconds ASC').all(id);
  meeting.clips = db.prepare('SELECT * FROM clips WHERE meeting_id = ? ORDER BY start_time ASC').all(id);
  
  return meeting;
};

module.exports = {
  db,
  createMeeting,
  updateMeetingFile,
  endMeeting,
  createMarker,
  getAllMeetings,
  getMeetingById
};
