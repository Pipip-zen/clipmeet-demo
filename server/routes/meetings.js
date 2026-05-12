const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');

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
router.post('/', (req, res) => {
  const { title, roomId } = req.body;
  if (!title || !roomId) {
    return res.status(400).json({ error: 'Title and roomId are required' });
  }
  try {
    const meeting = db.createMeeting(title, roomId);
    res.status(201).json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings — ambil semua meeting, urutkan terbaru dulu.
router.get('/', (req, res) => {
  try {
    const meetings = db.getAllMeetings();
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meetings/:id — ambil detail satu meeting beserta markers dan clips-nya.
router.get('/:id', (req, res) => {
  try {
    const meeting = db.getMeetingById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/upload — terima file .webm dari client
router.post('/:id/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }
  
  try {
    // Simpan relative path untuk diakses via express.static nanti
    const filePath = `/uploads/${req.file.filename}`;
    const meeting = db.updateMeetingFile(req.params.id, filePath);
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/meetings/:id/end — update ended_at meeting.
router.patch('/:id/end', (req, res) => {
  try {
    const meeting = db.endMeeting(req.params.id);
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meetings/:id/markers — tambah marker ke DB.
router.post('/:id/markers', (req, res) => {
  const { label, timestamp_seconds } = req.body;
  if (!label || timestamp_seconds === undefined) {
    return res.status(400).json({ error: 'Label and timestamp_seconds are required' });
  }
  try {
    const marker = db.createMarker(req.params.id, label, timestamp_seconds);
    res.status(201).json(marker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
