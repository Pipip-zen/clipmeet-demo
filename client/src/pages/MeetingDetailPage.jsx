import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

function MeetingDetailPage() {
  const { meetingId } = useParams();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-6 text-foreground">
      <Card className="max-w-3xl w-full">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Meeting Detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm text-muted-foreground font-medium">Meeting ID</p>
            <p className="font-mono mt-1 text-lg">{meetingId}</p>
          </div>
          
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default MeetingDetailPage;
