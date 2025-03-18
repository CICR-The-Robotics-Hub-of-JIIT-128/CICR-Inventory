import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, LogOut, Plus, Settings, ClipboardList, History, Bell, X } from "lucide-react";
import { api } from '../utils/api';
import { toast } from 'react-toastify';

const DashboardLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);

    // Fetch low stock items for notifications if user is admin or manager
    if (userData.role === 'ADMIN' || userData.role === 'MANAGER') {
      fetchLowStockItems();
    }
  }, []);

  const fetchLowStockItems = async () => {
    try {
      const response = await api.get('/inventory?lowStock=true');
      if (response && response.items) {
        const lowStockItems = response.items.filter(item => 
          item.quantity <= (item.minimumStock || 5)
        );

        if (lowStockItems.length > 0) {
          const notificationItems = lowStockItems.map(item => ({
            id: `lowstock-${item.id}`,
            type: 'LOW_STOCK',
            title: 'Low Stock Alert',
            message: `${item.name} is running low (${item.quantity} left)`,
            itemId: item.id,
            read: false,
            timestamp: new Date().toISOString()
          }));
          
          setNotifications(notificationItems);
          setUnreadCount(notificationItems.length);
          
          // Show toast notification for the first low stock item
          if (notificationItems.length > 0) {
            toast.warning(`${notificationItems.length} items running low on stock!`);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching low stock items:', error);
    }
  };

  const markAsRead = (notificationId) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(notif => ({ ...notif, read: true }))
    );
    setUnreadCount(0);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isAuthenticated');
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const isAdmin = user && user.role === 'ADMIN';
  const isManager = user && user.role === 'MANAGER';
  const hasElevatedPermissions = isAdmin || isManager;

  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900 border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold text-white">CICR Inventory</h1>
          <p className="text-gray-400 text-sm">{user?.name || 'User'}</p>
        </div>
        <div className="flex-1 py-6 flex flex-col space-y-1">
          <NavItem 
            to="/dashboard" 
            icon={<Database />} 
            label="Inventory" 
            isActive={location.pathname === '/dashboard'} 
          />
          
          {isAdmin && (
            <>
              <NavItem 
                to="/analytics" 
                icon={<BarChart3 />} 
                label="Analytics" 
                isActive={location.pathname === '/analytics'} 
              />
            </>
          )}
          
          <NavItem 
            to="/requests/history" 
            icon={<ClipboardList />} 
            label="My Requests" 
            isActive={location.pathname === '/requests/history'} 
          />
          
          {hasElevatedPermissions && (
            <NavItem 
              to="/requests/manage" 
              icon={<ClipboardList />} 
              label="Manage Requests" 
              isActive={location.pathname === '/requests/manage'} 
            />
          )}
          
          <button 
            onClick={handleLogout}
            className="flex items-center px-6 py-3 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-5 w-5 mr-3" />
            <span>Logout</span>
          </button>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-white/10 bg-zinc-900/50 flex justify-between items-center px-6">
          <h2 className="text-xl font-semibold text-white">
            {location.pathname === '/dashboard' && 'Inventory'}
            {location.pathname === '/analytics' && 'Analytics'}
            {location.pathname === '/requests/history' && 'My Requests'}
            {location.pathname === '/requests/manage' && 'Manage Requests'}
            {location.pathname.startsWith('/items/') && 'Inventory Item'}
            {location.pathname.startsWith('/requests/new/') && 'New Request'}
          </h2>
          
          <div className="flex items-center space-x-4">
            {hasElevatedPermissions && (
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-zinc-900 border border-white/10 rounded-md shadow-lg z-10">
                    <div className="p-3 border-b border-white/10 flex justify-between items-center">
                      <h3 className="text-white font-semibold">Notifications</h3>
                      <div className="flex items-center space-x-2">
                        {unreadCount > 0 && (
                          <button 
                            onClick={markAllAsRead}
                            className="text-xs text-purple-400 hover:text-purple-300"
                          >
                            Mark all as read
                          </button>
                        )}
                        <button 
                          onClick={() => setShowNotifications(false)}
                          className="text-gray-400 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto py-2">
                      {notifications.length === 0 ? (
                        <p className="text-center py-4 text-gray-400">No notifications</p>
                      ) : (
                        notifications.map(notification => (
                          <div 
                            key={notification.id}
                            className={`p-3 border-b border-white/5 hover:bg-white/5 transition-colors ${notification.read ? 'opacity-60' : ''}`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-sm font-semibold text-white">{notification.title}</h4>
                                <p className="text-sm text-gray-400">{notification.message}</p>
                                <span className="text-xs text-gray-500">
                                  {new Date(notification.timestamp).toLocaleString()}
                                </span>
                              </div>
                              {!notification.read && (
                                <button 
                                  onClick={() => markAsRead(notification.id)}
                                  className="text-purple-400 hover:text-purple-300 text-xs"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                            {notification.type === 'LOW_STOCK' && (
                              <Link 
                                to={`/items/${notification.itemId}/edit`}
                                className="mt-2 text-xs inline-block text-purple-400 hover:text-purple-300"
                                onClick={() => markAsRead(notification.id)}
                              >
                                View Item →
                              </Link>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white">
              {user?.name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>
        
        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

const NavItem = ({ to, icon, label, isActive }) => (
  <Link
    to={to}
    className={`flex items-center px-6 py-3 transition-colors ${
      isActive 
        ? 'bg-purple-500/10 text-purple-400 border-l-2 border-purple-500' 
        : 'text-gray-400 hover:text-white hover:bg-white/5'
    }`}
  >
    <span className="mr-3">{icon}</span>
    <span>{label}</span>
  </Link>
);

export default DashboardLayout;