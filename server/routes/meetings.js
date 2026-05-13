const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

ffmpeg.setFfmpegPath(ffmpegStatic);

const router = express.Router();

// Setup multer untuk upload file .webm ke folder uploads/ (di luar folder server)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // __dirname adalah server/routes, jadi ../../uploads menuju e:\My App\Projek Web\clipmeet\uploads
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const meetingId = req.params.id;
    cb(null, `${meetingId}-${Date.now()}.webm`);
  }
});
const upload = multer({ storage });

// POST /api/meetings — buat record meeting baru.
router.post('/meetings', authenticateToken, (req, res) => {
  const { title, roomId } = req.body;
  if (!title || !roomId) {
    return res.status(400).json({ error: 'Title and roomId are required' });
  }
  try {
    const meeting = db.createMeeting(title, roomId, req.user.userId);
    res.status(201).json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings — ambil semua meeting, urutkan terbaru dulu.
router.get('/meetings', authenticateToken, (req, res) => {
  try {
    const meetings = db.getAllMeetings(req.user.userId);
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/:id — ambil detail satu meeting beserta markers dan clips-nya.
router.get('/meetings/:id', authenticateToken, (req, res) => {
  try {
    const meeting = db.getMeetingById(req.params.id, req.user.userId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/upload — terima file .webm dari client
router.post('/meetings/:id/upload', authenticateToken, upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }
  
  try {
    // Simpan relative path untuk diakses via express.static nanti
    const filePath = `/uploads/${req.file.filename}`;
    const meeting = db.updateMeetingFile(req.params.id, filePath, req.user.userId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/meetings/:id/end — update ended_at meeting.
router.patch('/meetings/:id/end', authenticateToken, (req, res) => {
  try {
    const meeting = db.endMeeting(req.params.id, req.user.userId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/markers — tambah marker ke DB.
router.post('/meetings/:id/markers', authenticateToken, (req, res) => {
  const { label, timestamp_seconds } = req.body;
  if (!label || timestamp_seconds === undefined) {
    return res.status(400).json({ error: 'Label and timestamp_seconds are required' });
  }
  try {
    const meeting = db.getMeetingById(req.params.id, req.user.userId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const marker = db.createMarker(req.params.id, label, timestamp_seconds);
    res.status(201).json(marker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clips — Buat clip video menggunakan FFmpeg
router.post('/clips', authenticateToken, (req, res) => {
  const { meetingId, label, startTime, endTime } = req.body;
  if (!meetingId || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'meetingId, startTime, and endTime are required' });
  }

  try {
    const meeting = db.getMeetingById(meetingId, req.user.userId);
    if (!meeting || !meeting.file_path) {
      return res.status(404).json({ error: 'Meeting or source video file not found' });
    }

    // Resolve absolute path for source file
    const sourcePath = path.join(__dirname, '../../', meeting.file_path);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source video file not found on disk' });
    }

    // Because createClip in DB uses its own uuid, we can just generate a random filename here.
    // However, it's cleaner to have a matching ID if possible. We'll let DB handle ID,
    // and just use a random filename.
    const clipFileName = `clip-${uuidv4()}.webm`;
    const clipFilePath = path.join(__dirname, '../../clips', clipFileName);

    const duration = endTime - startTime;

    ffmpeg(sourcePath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(clipFilePath)
      .on('end', () => {
        try {
          const dbFilePath = `/clips/${clipFileName}`;
          const clip = db.createClip(meetingId, label || 'Clip', startTime, endTime, dbFilePath);
          res.status(201).json(clip);
        } catch (err) {
          res.status(500).json({ error: 'Failed to save clip to database: ' + err.message });
        }
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Failed to process video: ' + err.message });
      })
      .run();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clips/:id — ambil detail clip dari DB
router.get('/clips/:id', (req, res) => {
  try {
    const clip = db.getClipById(req.params.id);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    res.json(clip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
