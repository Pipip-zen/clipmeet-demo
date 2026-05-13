const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const path = require('path');
const meetingsRouter = require('./routes/meetings');
const authRouter = require('./routes/auth');

const ROOM_CLEANUP_GRACE_MS = 60_000;

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
}));

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/clips', express.static(path.join(__dirname, '../clips')));

app.use('/api', authRouter);
app.use('/api', meetingsRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Signaling server is running' });
});

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();
const socketToRoom = new Map();
const socketToParticipantName = new Map();
const socketToMediaState = new Map();

function normalizeRoomCode(roomCode) {
  return typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
}

function createRoomState(roomCode, roomName = roomCode) {
  return {
    roomId: roomCode,
    roomName,
    startedAt: Date.now(),
    participants: new Map(),
    markers: [],
    recordingStatus: {
      isRecording: false,
    },
    cleanupTimer: null,
  };
}

function ensureRoom(roomCode, roomName = roomCode) {
  const existingRoom = rooms.get(roomCode);
  if (existingRoom) {
    if (roomName && roomName !== roomCode) {
      existingRoom.roomName = roomName;
    }
    return existingRoom;
  }

  const room = createRoomState(roomCode, roomName);
  rooms.set(roomCode, room);
  return room;
}

function roomExists(roomCode) {
  return rooms.has(roomCode);
}

function cancelRoomCleanup(room) {
  if (!room?.cleanupTimer) {
    return;
  }

  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
}

function scheduleRoomCleanup(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.participants.size > 0 || room.cleanupTimer) {
    return;
  }

  room.cleanupTimer = setTimeout(() => {
    const latestRoom = rooms.get(roomCode);
    if (!latestRoom || latestRoom.participants.size > 0) {
      return;
    }

    rooms.delete(roomCode);
    console.log(`Room ${roomCode} deleted after grace period`);
  }, ROOM_CLEANUP_GRACE_MS);
}

function serializeParticipant([socketId, participant]) {
  return {
    socketId,
    participantName: participant.participantName,
    mediaState: participant.mediaState || { isMuted: false, isCameraOff: false },
  };
}

function serializeRoomState(room) {
  return {
    roomId: room.roomId,
    roomCode: room.roomId,
    roomName: room.roomName,
    startedAt: room.startedAt,
    participants: Array.from(room.participants.entries()).map(serializeParticipant),
    markers: room.markers,
    recordingStatus: room.recordingStatus,
  };
}

function getRoomHostSocketId(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.participants.size === 0) {
    return null;
  }

  return room.participants.keys().next().value;
}

function removeParticipantFromRoom(socket, options = {}) {
  const roomCode = socketToRoom.get(socket.id);
  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  if (room) {
    room.participants.delete(socket.id);
    if (room.participants.size === 0) {
      scheduleRoomCleanup(roomCode);
    }
  }

  socketToRoom.delete(socket.id);
  socketToParticipantName.delete(socket.id);
  socketToMediaState.delete(socket.id);
  socket.leave(roomCode);

  console.log(`User ${socket.id} left room ${roomCode}`);

  if (!options.silent) {
    socket.broadcast.to(roomCode).emit('user-left', { socketId: socket.id });
    socket.broadcast.to(roomCode).emit('peer-left', { socketId: socket.id });
  }
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('get-room-info', (roomCode, callback) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const room = rooms.get(normalizedRoomCode);
    const roomInfo = {
      roomCode: normalizedRoomCode,
      roomName: room?.roomName || normalizedRoomCode,
      exists: Boolean(room),
      startedAt: room?.startedAt || null,
    };

    socket.emit('room-info', roomInfo);

    if (typeof callback === 'function') {
      callback(roomInfo);
    }
  });

  socket.on('create-room', (payload = {}, callback) => {
    const roomCode = normalizeRoomCode(payload.roomCode);
    const roomName =
      typeof payload.roomName === 'string' && payload.roomName.trim()
        ? payload.roomName.trim()
        : roomCode;

    if (!/^[A-Z]{6}$/.test(roomCode)) {
      const errorMessage = 'Room code must be exactly 6 uppercase letters.';
      if (typeof callback === 'function') {
        callback({ ok: false, error: errorMessage });
      }
      return;
    }

    const room = ensureRoom(roomCode, roomName);

    if (typeof callback === 'function') {
      callback({
        ok: true,
        roomCode,
        roomName: room.roomName,
        startedAt: room.startedAt,
      });
    }
  });

  socket.on('get-room-state', (payload = {}, callback) => {
    const roomCode = normalizeRoomCode(typeof payload === 'string' ? payload : payload.roomCode);
    const room = rooms.get(roomCode);

    if (!room) {
      const errorPayload = {
        roomCode,
        message: 'Room tidak ditemukan.',
      };
      socket.emit('room-join-error', errorPayload);
      if (typeof callback === 'function') {
        callback({ ok: false, error: errorPayload.message });
      }
      return;
    }

    const roomState = serializeRoomState(room);
    socket.emit('room-state', roomState);

    if (typeof callback === 'function') {
      callback({ ok: true, roomState });
    }
  });

  socket.on('join-room', (payload = {}, callback) => {
    const roomCode = normalizeRoomCode(typeof payload === 'string' ? payload : payload.roomCode);
    const participantName =
      typeof payload === 'string' ? 'Guest' : payload.participantName || 'Guest';
    const roomName = typeof payload === 'string' ? roomCode : payload.roomName || roomCode;
    const mediaState = typeof payload === 'string'
      ? { isMuted: false, isCameraOff: false }
      : {
          isMuted: Boolean(payload.isMuted),
          isCameraOff: Boolean(payload.isCameraOff),
        };

    if (!roomExists(roomCode)) {
      const errorPayload = {
        roomCode,
        message: 'Room tidak ditemukan. Pastikan kode room benar atau buat room terlebih dahulu.',
      };
      socket.emit('room-join-error', errorPayload);
      if (typeof callback === 'function') {
        callback({ ok: false, error: errorPayload.message });
      }
      return;
    }

    if (socketToRoom.has(socket.id)) {
      removeParticipantFromRoom(socket, { silent: true });
    }

    const room = ensureRoom(roomCode, roomName);
    cancelRoomCleanup(room);

    room.participants.set(socket.id, {
      participantName,
      mediaState,
    });

    socketToRoom.set(socket.id, roomCode);
    socketToParticipantName.set(socket.id, participantName);
    socketToMediaState.set(socket.id, mediaState);
    socket.join(roomCode);

    const roomState = serializeRoomState(room);

    socket.emit('room-info', {
      roomCode,
      roomName: room.roomName,
      startedAt: room.startedAt,
    });
    socket.emit('room-state', roomState);
    socket.emit(
      'existing-peers',
      roomState.participants.filter((participant) => participant.socketId !== socket.id)
    );

    socket.broadcast.to(roomCode).emit('user-joined', {
      socketId: socket.id,
      participantName,
      mediaState,
    });

    if (typeof callback === 'function') {
      callback({ ok: true, roomState });
    }

    console.log(`User ${socket.id} joined room ${roomCode}`);
  });

  socket.on('offer', ({ target, caller, participantName, mediaState, offer }) => {
    io.to(target).emit('offer', {
      caller: caller || socket.id,
      participantName: participantName || socketToParticipantName.get(socket.id) || 'Guest',
      mediaState: mediaState || socketToMediaState.get(socket.id) || { isMuted: false, isCameraOff: false },
      offer,
    });
  });

  socket.on('answer', ({ target, caller, participantName, mediaState, answer }) => {
    io.to(target).emit('answer', {
      caller: caller || socket.id,
      participantName: participantName || socketToParticipantName.get(socket.id) || 'Guest',
      mediaState: mediaState || socketToMediaState.get(socket.id) || { isMuted: false, isCameraOff: false },
      answer,
    });
  });

  socket.on('ice-candidate', ({ target, caller, candidate }) => {
    io.to(target).emit('ice-candidate', {
      caller: caller || socket.id,
      candidate,
    });
  });

  socket.on('media-state-changed', ({ isMuted, isCameraOff }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      return;
    }

    const room = rooms.get(roomCode);
    const mediaState = {
      isMuted: Boolean(isMuted),
      isCameraOff: Boolean(isCameraOff),
    };

    socketToMediaState.set(socket.id, mediaState);

    const participant = room?.participants.get(socket.id);
    if (participant) {
      participant.mediaState = mediaState;
    }

    socket.broadcast.to(roomCode).emit('media-state-changed', {
      socketId: socket.id,
      ...mediaState,
    });
  });

  socket.on('request-screenshare', ({ roomCode, requesterName }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const hostSocketId = getRoomHostSocketId(normalizedRoomCode);

    if (!hostSocketId) {
      socket.emit('screenshare-rejected', {
        message: 'Host tidak tersedia.',
      });
      return;
    }

    io.to(hostSocketId).emit('screenshare-request', {
      roomCode: normalizedRoomCode,
      requesterSocketId: socket.id,
      requesterName: requesterName || socketToParticipantName.get(socket.id) || 'Guest',
    });
  });

  socket.on('screenshare-approved', ({ roomCode, requesterSocketId }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const hostSocketId = getRoomHostSocketId(normalizedRoomCode);

    if (hostSocketId !== socket.id) {
      return;
    }

    io.to(requesterSocketId).emit('screenshare-approved', {
      roomCode: normalizedRoomCode,
    });
  });

  socket.on('screenshare-rejected', ({ roomCode, requesterSocketId }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const hostSocketId = getRoomHostSocketId(normalizedRoomCode);

    if (hostSocketId !== socket.id) {
      return;
    }

    io.to(requesterSocketId).emit('screenshare-rejected', {
      message: 'Permintaan ditolak oleh host.',
    });
  });

  socket.on('screenshare-started', ({ roomCode, sharerName }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    io.to(normalizedRoomCode).emit('screenshare-started', {
      sharerSocketId: socket.id,
      sharerName: sharerName || socketToParticipantName.get(socket.id) || 'Guest',
    });
  });

  socket.on('screenshare-stopped', ({ roomCode }) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    io.to(normalizedRoomCode).emit('screenshare-stopped', {
      sharerSocketId: socket.id,
    });
  });

  socket.on('leave-room', () => {
    removeParticipantFromRoom(socket);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    removeParticipantFromRoom(socket);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
