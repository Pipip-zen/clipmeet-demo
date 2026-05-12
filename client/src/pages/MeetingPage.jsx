import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

function MeetingPage() {
  const { roomId } = useParams();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-6 text-foreground">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Meeting Page</h1>
        <p className="text-xl text-muted-foreground">Room ID: <span className="font-mono bg-muted px-2 py-1 rounded">{roomId}</span></p>
        <Button asChild variant="outline" className="mt-8">
          <Link to="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}

export default MeetingPage;
