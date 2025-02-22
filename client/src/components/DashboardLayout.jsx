import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, LogOut, Plus, Settings, ClipboardList, History } from "lucide-react";

const DashboardLayout = ({ children }) => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'ADMIN';

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isAuthenticated');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <nav className="relative border-b border-white/10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-4">
              <Database className="h-6 w-6 text-purple-400" />
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-500 to-cyan-500">
                CICR Inventory System
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {isAdmin ? (
                <>
                  <Button
                    onClick={() => navigate('/items/new')}
                    className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90 transition-all duration-200 shadow-lg shadow-purple-500/20"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                  <Button
                    onClick={() => navigate('/requests/manage')}
                    className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90 transition-all duration-200 shadow-lg shadow-purple-500/20"
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Manage Requests
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => navigate('/requests/history')}
                  className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90 transition-all duration-200 shadow-lg shadow-purple-500/20"
                >
                  <History className="h-4 w-4 mr-2" />
                  My Requests
                </Button>
              )}
              <Card className="bg-zinc-900/50 border border-white/10 px-4 py-2 rounded-lg backdrop-blur-md shadow-lg shadow-purple-500/5">
                <span className="text-sm text-white/90 flex items-center gap-2">
                  <Settings className="h-4 w-4 text-purple-400" />
                  {user.username} ({user.role})
                </span>
              </Card>
              <Button
                onClick={handleLogout}
                variant="destructive"
                size="sm"
                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 shadow-lg shadow-red-500/5"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 z-10">
        <div className="bg-zinc-900/50 border border-white/10 rounded-lg backdrop-blur-md p-6 shadow-xl shadow-purple-500/5">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;