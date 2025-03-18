import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-4xl font-bold text-white">404</h1>
        <h2 className="text-2xl font-semibold text-purple-400">Page Not Found</h2>
        <p className="text-white/70">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="border-white/10 text-white/70 hover:bg-white/5"
          >
            Go Back
          </Button>
          <Button
            onClick={() => navigate('/dashboard')}
            className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound; 