const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const path = require('path');
const meetingsRouter = require('./routes/meetings');

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
// socketToRoom: Map<socketId, roomCode>
const socketToRoom = new Map();
const socketToParticipantName = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('get-room-info', (roomCode) => {
    socket.emit('room-info', {
      roomCode,
      roomName: roomNames.get(roomCode) || roomCode,
    });
  });

  // Event saat user join room
  socket.on('join-room', (payload) => {
    const roomCode = typeof payload === 'string' ? payload : payload.roomCode;
    const participantName =
      typeof payload === 'string' ? 'Guest' : payload.participantName || 'Guest';
    const roomName = typeof payload === 'string' ? roomCode : payload.roomName || roomCode;

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
    }));

    // Tambahkan user baru ke dalam state
    usersInRoom.set(socket.id, participantName);
    socketToRoom.set(socket.id, roomCode);
    socketToParticipantName.set(socket.id, participantName);

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
  socket.on('offer', ({ target, caller, participantName, offer }) => {
    io.to(target).emit('offer', {
      caller: caller || socket.id,
      participantName: participantName || socketToParticipantName.get(socket.id) || 'Guest',
      offer
    });
  });

  // Event meneruskan WebRTC Answer
  socket.on('answer', ({ target, caller, participantName, answer }) => {
    io.to(target).emit('answer', {
      caller: caller || socket.id,
      participantName: participantName || socketToParticipantName.get(socket.id) || 'Guest',
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

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
