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

// Setup CORS
app.use(cors({
  origin: 'http://localhost:5173', // Origin client
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
}));

app.use(express.json());

// Serve static files for uploads and clips
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/clips', express.static(path.join(__dirname, '../clips')));

// Setup Routes
app.use('/api', authRouter);
app.use('/api', meetingsRouter);

// Endpoint /health untuk cek status server
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Signaling server is running' });
});

// Setup Socket.IO dengan CORS
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// In-memory state untuk menyimpan room dan user
// rooms: Map<roomCode, Map<socketId, participantName>>
const rooms = new Map();
const roomNames = new Map();
const createdRooms = new Set();
// socketToRoom: Map<socketId, roomCode>
const socketToRoom = new Map();
const socketToParticipantName = new Map();
const socketToMediaState = new Map();

function normalizeRoomCode(roomCode) {
  return typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
}

function roomExists(roomCode) {
  return createdRooms.has(roomCode) || rooms.has(roomCode);
}

function getRoomHostSocketId(roomCode) {
  const usersInRoom = rooms.get(roomCode);
  if (!usersInRoom || usersInRoom.size === 0) {
    return null;
  }

  return usersInRoom.keys().next().value;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('get-room-info', (roomCode, callback) => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const roomInfo = {
      roomCode: normalizedRoomCode,
      roomName: roomNames.get(normalizedRoomCode) || normalizedRoomCode,
      exists: roomExists(normalizedRoomCode),
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

    createdRooms.add(roomCode);
    roomNames.set(roomCode, roomName);

    if (typeof callback === 'function') {
      callback({
        ok: true,
        roomCode,
        roomName,
      });
    }
  });

  // Event saat user join room
  socket.on('join-room', (payload) => {
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
      socket.emit('room-join-error', {
        roomCode,
        message: 'Room tidak ditemukan. Pastikan kode room benar atau buat room terlebih dahulu.',
      });
      return;
    }

    socket.join(roomCode);

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, new Map());
    }
    if (roomName && roomName !== roomCode) {
      roomNames.set(roomCode, roomName);
    }

    const usersInRoom = rooms.get(roomCode);
    
    // Ambil daftar user yang sudah ada di room (kecuali user yang baru join)
    const existingPeers = Array.from(usersInRoom.entries()).map(([socketId, name]) => ({
      socketId,
      participantName: name,
      mediaState: socketToMediaState.get(socketId) || { isMuted: false, isCameraOff: false },
    }));

    // Tambahkan user baru ke dalam state
    usersInRoom.set(socket.id, participantName);
    socketToRoom.set(socket.id, roomCode);
    socketToParticipantName.set(socket.id, participantName);
    socketToMediaState.set(socket.id, mediaState);

    console.log(`User ${socket.id} joined room ${roomCode}`);

    // Emit daftar socket ID yang sudah ada ke user yang baru join
    socket.emit('room-info', {
      roomCode,
      roomName: roomNames.get(roomCode) || roomName || roomCode,
    });
    socket.emit('existing-peers', existingPeers);
    
    // Optional: memberitahu user lain bahwa ada user baru yang join
    // socket.broadcast.to(roomId).emit('user-joined', socket.id);
  });

  // Event meneruskan WebRTC Offer
  socket.on('offer', ({ target, caller, participantName, mediaState, offer }) => {
    io.to(target).emit('offer', {
      caller: caller || socket.id,
      participantName: participantName || socketToParticipantName.get(socket.id) || 'Guest',
      mediaState: mediaState || socketToMediaState.get(socket.id) || { isMuted: false, isCameraOff: false },
      offer
    });
  });

  // Event meneruskan WebRTC Answer
  socket.on('answer', ({ target, caller, participantName, mediaState, answer }) => {
    io.to(target).emit('answer', {
      caller: caller || socket.id,
      participantName: participantName || socketToParticipantName.get(socket.id) || 'Guest',
      mediaState: mediaState || socketToMediaState.get(socket.id) || { isMuted: false, isCameraOff: false },
      answer
    });
  });

  // Event meneruskan ICE Candidate
  socket.on('ice-candidate', ({ target, caller, candidate }) => {
    io.to(target).emit('ice-candidate', {
      caller: caller || socket.id,
      candidate
    });
  });

  socket.on('media-state-changed', ({ isMuted, isCameraOff }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      return;
    }

    const mediaState = {
      isMuted: Boolean(isMuted),
      isCameraOff: Boolean(isCameraOff),
    };
    socketToMediaState.set(socket.id, mediaState);

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

  // Fungsi untuk handle user keluar dari room
  const handleLeaveRoom = () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
        const usersInRoom = rooms.get(roomId);
        if (usersInRoom) {
        usersInRoom.delete(socket.id);
        if (usersInRoom.size === 0) {
          rooms.delete(roomId); // Hapus room jika kosong
          roomNames.delete(roomId);
        }
      }
      
      socketToRoom.delete(socket.id);
      socketToParticipantName.delete(socket.id);
      socketToMediaState.delete(socket.id);
      socket.leave(roomId);
      
      console.log(`User ${socket.id} left room ${roomId}`);
      
      // Broadcast event peer-left ke semua user di room
      socket.broadcast.to(roomId).emit('peer-left', { socketId: socket.id });
    }
  };

  // Event saat user sengaja leave-room
  socket.on('leave-room', handleLeaveRoom);

  // Event saat user terputus koneksinya secara tidak sengaja (misal: tutup tab)
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    handleLeaveRoom();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
