const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

ffmpeg.setFfmpegPath(ffmpegStatic);

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const meetingId = req.params.id;
    cb(null, `${meetingId}-${Date.now()}.webm`);
  },
});
const upload = multer({ storage });

function sanitizeFileSegment(value, fallback) {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || fallback;
}

function buildAbsoluteMediaPath(relativePath) {
  if (!relativePath) {
    return '';
  }

  return path.join(__dirname, '../../', relativePath.replace(/^\//, ''));
}

function removeFileIfExists(filePath) {
  if (!filePath) {
    return;
  }

  const absolutePath = buildAbsoluteMediaPath(filePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function sendDownload(res, absolutePath, downloadName) {
  return res.download(absolutePath, downloadName, (downloadError) => {
    if (!downloadError || res.headersSent) {
      return;
    }

    res.status(500).json({ error: 'Failed to send file.' });
  });
}

function formatClipFileName(meeting, clip) {
  const sequence = String(clip.sequence_number || 1).padStart(3, '0');
  const roomCode = sanitizeFileSegment(meeting.room_id, 'ROOM');
  const ext = path.extname(clip.file_path || '.webm') || '.webm';
  return `clip-${sequence}-room-${roomCode}${ext}`;
}

function formatRecordingFileName(meeting) {
  const roomCode = sanitizeFileSegment(meeting.room_id, 'ROOM');
  const ext = path.extname(meeting.file_path || '.webm') || '.webm';
  return `recording-room-${roomCode}${ext}`;
}

function buildZipBuffer(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const dataBuffer = file.data;
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(file.crc32 >>> 0, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(file.crc32 >>> 0, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localChunks.push(localHeader, nameBuffer, dataBuffer);
    centralChunks.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, endRecord]);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function calculateCrc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function queueClipProcessing(meeting, clip) {
  const sourcePath = buildAbsoluteMediaPath(meeting.file_path);
  const outputName = formatClipFileName(meeting, {
    ...clip,
    file_path: '.webm',
  });
  const outputRelativePath = `/clips/${outputName}`;
  const outputAbsolutePath = path.join(__dirname, '../../clips', outputName);

  if (fs.existsSync(outputAbsolutePath)) {
    fs.unlinkSync(outputAbsolutePath);
  }

  ffmpeg(sourcePath)
    .setStartTime(clip.start_time)
    .setDuration(clip.end_time - clip.start_time)
    .output(outputAbsolutePath)
    .on('end', () => {
      try {
        db.updateClip(clip.id, {
          filePath: outputRelativePath,
          status: 'ready',
          errorMessage: null,
        });
      } catch (error) {
        console.error('Failed to mark clip as ready:', error);
      }
    })
    .on('error', (error) => {
      console.error('FFmpeg error:', error);
      db.updateClip(clip.id, {
        filePath: null,
        status: 'failed',
        errorMessage: error.message,
      });
    })
    .run();
}

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

router.get('/meetings', authenticateToken, (req, res) => {
  try {
    const meetings = db.getAllMeetings(req.user.userId);
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/meetings/:id', authenticateToken, (req, res) => {
  try {
    const meeting = db.getMeetingById(req.params.id, req.user.userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recordings/:recordingId/download', authenticateToken, (req, res) => {
  try {
    const meeting = db.getMeetingById(req.params.recordingId, req.user.userId);
    if (!meeting || !meeting.file_path) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const absolutePath = buildAbsoluteMediaPath(meeting.file_path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Recording file not found on disk' });
    }

    return sendDownload(res, absolutePath, formatRecordingFileName(meeting));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/recordings/:recordingId', authenticateToken, (req, res) => {
  try {
    const meeting = db.getMeetingById(req.params.recordingId, req.user.userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    db.deleteMeetingById(req.params.recordingId, req.user.userId);

    try {
      removeFileIfExists(meeting.file_path);
      (meeting.clips || []).forEach((clip) => {
        removeFileIfExists(clip.file_path);
      });
    } catch (fileError) {
      console.error('Failed to remove recording files:', fileError);
      return res.status(500).json({ error: 'Recording deleted but file cleanup failed.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/meetings/:id/upload', authenticateToken, upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    const filePath = `/uploads/${req.file.filename}`;
    const meeting = db.updateMeetingFile(req.params.id, filePath, req.user.userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    return res.json(meeting);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/meetings/:id/end', authenticateToken, (req, res) => {
  try {
    const meeting = db.endMeeting(req.params.id, req.user.userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meetings/:id/markers', authenticateToken, (req, res) => {
  const { label, timestamp_seconds: timestampSeconds } = req.body;
  if (!label || timestampSeconds === undefined) {
    return res.status(400).json({ error: 'Label and timestamp_seconds are required' });
  }
  try {
    const meeting = db.getMeetingById(req.params.id, req.user.userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const marker = db.createMarker(req.params.id, label, timestampSeconds);
    res.status(201).json(marker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clips', authenticateToken, (req, res) => {
  const { meetingId, label, startTime, endTime } = req.body;
  if (!meetingId || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'meetingId, startTime, and endTime are required' });
  }

  if (Number(endTime) <= Number(startTime)) {
    return res.status(400).json({ error: 'endTime must be greater than startTime' });
  }

  try {
    const meeting = db.getMeetingById(meetingId, req.user.userId);
    if (!meeting || !meeting.file_path) {
      return res.status(404).json({ error: 'Meeting or source video file not found' });
    }

    const sourcePath = buildAbsoluteMediaPath(meeting.file_path);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source video file not found on disk' });
    }

    const clip = db.createClip(meetingId, label || 'Clip', Number(startTime), Number(endTime), {
      status: 'processing',
      filePath: null,
      errorMessage: null,
    });

    res.status(202).json(clip);
    queueClipProcessing(meeting, clip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clips/:clipId/retry', authenticateToken, (req, res) => {
  try {
    const clip = db.getClipByIdForUser(req.params.clipId, req.user.userId);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    const meeting = db.getMeetingById(clip.meeting_id, req.user.userId);
    if (!meeting || !meeting.file_path) {
      return res.status(404).json({ error: 'Meeting or source video file not found' });
    }

    const sourcePath = buildAbsoluteMediaPath(meeting.file_path);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source video file not found on disk' });
    }

    const nextClip = db.updateClip(clip.id, {
      status: 'processing',
      errorMessage: null,
      filePath: null,
    });

    res.json(nextClip);
    queueClipProcessing(meeting, nextClip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clips/:clipId/download', authenticateToken, (req, res) => {
  try {
    const clip = db.getClipByIdForUser(req.params.clipId, req.user.userId);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    if (clip.status === 'processing') {
      return res.status(409).json({ error: 'Clip is still processing.' });
    }
    if (clip.status === 'failed') {
      return res.status(409).json({ error: 'Clip processing failed.' });
    }
    if (!clip.file_path) {
      return res.status(404).json({ error: 'Clip file not found' });
    }

    const meeting = db.getMeetingById(clip.meeting_id, req.user.userId);
    const absolutePath = buildAbsoluteMediaPath(clip.file_path);
    if (!meeting || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Clip file not found on disk' });
    }

    return sendDownload(res, absolutePath, formatClipFileName(meeting, clip));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/recordings/:recordingId/clips/download-zip', authenticateToken, (req, res) => {
  try {
    const meeting = db.getMeetingById(req.params.recordingId, req.user.userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const readyClips = (meeting.clips || []).filter((clip) => clip.status === 'ready' && clip.file_path);
    if (readyClips.length === 0) {
      return res.status(404).json({ error: 'No ready clips available for download.' });
    }

    const zipEntries = [];
    for (const clip of readyClips) {
      const absolutePath = buildAbsoluteMediaPath(clip.file_path);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const fileBuffer = fs.readFileSync(absolutePath);
      zipEntries.push({
        name: formatClipFileName(meeting, clip),
        data: fileBuffer,
        crc32: calculateCrc32(fileBuffer),
      });
    }

    if (zipEntries.length === 0) {
      return res.status(404).json({ error: 'No clip files found on disk.' });
    }

    const zipBuffer = buildZipBuffer(zipEntries);
    const roomCode = sanitizeFileSegment(meeting.room_id, 'ROOM');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="clips-room-${roomCode}.zip"`);
    return res.send(zipBuffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/clips/:id', authenticateToken, (req, res) => {
  try {
    const clip = db.getClipByIdForUser(req.params.id, req.user.userId);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    return res.json(clip);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
