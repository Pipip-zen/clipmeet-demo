const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Setup CORS
app.use(cors({
  origin: 'http://localhost:5173', // Origin client
  methods: ['GET', 'POST']
}));

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
// rooms: Map<roomId, Set<socketId>>
const rooms = new Map();
// socketToRoom: Map<socketId, roomId>
const socketToRoom = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Event saat user join room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const usersInRoom = rooms.get(roomId);
    
    // Ambil daftar user yang sudah ada di room (kecuali user yang baru join)
    const existingPeers = Array.from(usersInRoom);

    // Tambahkan user baru ke dalam state
    usersInRoom.add(socket.id);
    socketToRoom.set(socket.id, roomId);

    console.log(`User ${socket.id} joined room ${roomId}`);

    // Emit daftar socket ID yang sudah ada ke user yang baru join
    socket.emit('existing-peers', existingPeers);
    
    // Optional: memberitahu user lain bahwa ada user baru yang join
    // socket.broadcast.to(roomId).emit('user-joined', socket.id);
  });

  // Event meneruskan WebRTC Offer
  socket.on('offer', ({ target, caller, offer }) => {
    io.to(target).emit('offer', {
      caller: caller || socket.id,
      offer
    });
  });

  // Event meneruskan WebRTC Answer
  socket.on('answer', ({ target, caller, answer }) => {
    io.to(target).emit('answer', {
      caller: caller || socket.id,
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
        }
      }
      
      socketToRoom.delete(socket.id);
      socket.leave(roomId);
      
      console.log(`User ${socket.id} left room ${roomId}`);
      
      // Broadcast event peer-left ke semua user di room
      socket.broadcast.to(roomId).emit('peer-left', socket.id);
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
