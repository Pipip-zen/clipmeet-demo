import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function HomePage() {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const newRoomId = uuidv4();
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim() !== '') {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold tracking-tight text-primary">ClipMeet</CardTitle>
          <CardDescription className="text-lg mt-2">
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
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full"
            />
            <Button 
              type="submit" 
              variant="outline" 
              className="w-full font-semibold" 
              size="lg"
            >
              Join Room
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
  );
}

export default HomePage;
