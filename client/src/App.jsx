import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import InventoryTable from './components/InventoryTable';
import ItemForm from './components/ItemForm';
import RequestForm from './components/RequestForm';
import RequestHistory from './components/RequestHistory';
import NotFound from './components/NotFound';
import { api } from './utils/api';
import { toast } from 'react-toastify';
import Analytics from './components/Analytics';

const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER';
  const hasElevatedPermissions = isAdmin || isManager;

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.get('/inventory');
      setItems(response);
      setError(null);
    } catch (error) {
      console.error('Error fetching items:', error);
      setError(error.message);
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (isAuthenticated) {
      fetchItems();
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Router>
        <ToastContainer theme="dark" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardLayout>
                  <InventoryTable 
                    items={items} 
                    loading={loading} 
                    onRefresh={fetchItems}
                  />
                </DashboardLayout>
              </PrivateRoute>
            }
          />
          {isAdmin && (
            <>
              <Route
                path="/items/new"
                element={
                  <PrivateRoute>
                    <DashboardLayout>
                      <ItemForm onSuccess={fetchItems} />
                    </DashboardLayout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/items/:id/edit"
                element={
                  <PrivateRoute>
                    <DashboardLayout>
                      <ItemForm onSuccess={fetchItems} />
                    </DashboardLayout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/requests/manage"
                element={
                  <PrivateRoute>
                    <DashboardLayout>
                      <RequestHistory isAdmin={hasElevatedPermissions} />
                    </DashboardLayout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <PrivateRoute>
                    <DashboardLayout>
                      <Analytics />
                    </DashboardLayout>
                  </PrivateRoute>
                }
              />
            </>
          )}
          <Route
            path="/requests/new/:itemId"
            element={
              <PrivateRoute>
                <DashboardLayout>
                  <RequestForm />
                </DashboardLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/requests/manage"
            element={
              <PrivateRoute>
                <DashboardLayout>
                  <RequestHistory isAdmin={true} />
                </DashboardLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/requests/history"
            element={
              <PrivateRoute>
                <DashboardLayout>
                  <RequestHistory isAdmin={false} />
                </DashboardLayout>
              </PrivateRoute>
            }
          />
          {/* Catch-all route for 404 errors */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;