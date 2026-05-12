import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 p-6 text-foreground">
      <div className="max-w-4xl w-full text-center space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-lg text-muted-foreground">Manage your meetings and clips here.</p>
        
        <div className="mt-8">
          <Button asChild variant="default">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
