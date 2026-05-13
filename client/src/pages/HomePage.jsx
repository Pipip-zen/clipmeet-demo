import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '@/context/useAuth';
import heroImg from '@/assets/hero.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import './HomePage.css';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3001';
const ROOM_CODE_PATTERN = /^[A-Z]{6}$/;

function HomePage() {
  const [roomId, setRoomId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateRoom = () => {
    navigate('/create-room');
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const roomCode = roomId.trim().toUpperCase();

    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      setJoinError('Room Code wajib 6 huruf A-Z.');
      return;
    }

    setIsCheckingRoom(true);
    setJoinError('');

    const socket = io(SIGNALING_SERVER_URL, {
      transports: ['websocket'],
    });

    try {
      const roomInfo = await new Promise((resolve, reject) => {
        socket.on('connect_error', reject);
        socket.emit('get-room-info', roomCode, resolve);
      });

      if (!roomInfo?.exists) {
        setJoinError('Room tidak ditemukan. Masukkan kode room yang valid.');
        return;
      }

      navigate(`/lobby/${roomCode}`);
    } catch {
      setJoinError('Gagal memeriksa room. Pastikan server berjalan.');
    } finally {
      setIsCheckingRoom(false);
      socket.disconnect();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="home-auth-bar">
        <span>
          Halo, <strong>{user?.username}</strong>
        </span>
        <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 max-w-6xl w-full items-center">
        <div className="hidden lg:block relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <img 
            src={heroImg} 
            alt="Hero Illustration" 
            className="relative w-full h-auto rounded-[2rem] shadow-2xl object-cover transform hover:scale-[1.02] transition-transform duration-500" 
          />
        </div>

        <Card className="w-full max-w-md mx-auto border-none shadow-2xl bg-background/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-6 p-3 rounded-2xl bg-primary/10 w-fit">
              <img src="/icon.png" alt="ClipMeet Logo" className="w-16 h-16 object-contain" />
            </div>
            <CardTitle className="text-5xl font-extrabold tracking-tight text-primary bg-gradient-to-br from-primary to-blue-700 bg-clip-text text-transparent">
              ClipMeet
            </CardTitle>
            <CardDescription className="text-lg mt-3 font-medium">
              Real-time meeting with easy video clipping
            </CardDescription>
          </CardHeader>
        
        <CardContent className="space-y-6">
          <Button 
            className="w-full font-semibold" 
            size="lg" 
            onClick={handleCreateRoom}
          >
            Create New Room
          </Button>

          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            <Separator className="flex-1" />
            <span>OR</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <Input
              type="text"
              placeholder="Enter Room Code"
              value={roomId}
              maxLength={6}
              onChange={(e) => {
                setRoomId(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6));
                setJoinError('');
              }}
              className="w-full home-room-code-input"
            />
            {joinError ? <p className="home-form-error">{joinError}</p> : null}
            <Button 
              type="submit" 
              variant="outline" 
              className="w-full font-semibold" 
              size="lg"
              disabled={isCheckingRoom || roomId.trim().length !== 6}
            >
              {isCheckingRoom ? 'Checking...' : 'Join'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center pt-2">
          <Button 
            variant="link" 
            className="text-muted-foreground hover:text-primary" 
            onClick={() => navigate('/dashboard')}
          >
            Go to Dashboard
          </Button>
        </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default HomePage;
