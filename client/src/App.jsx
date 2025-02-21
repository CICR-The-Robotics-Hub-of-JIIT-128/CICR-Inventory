import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import InventoryTable from './components/InventoryTable';
import ItemForm from './components/ItemForm';
import { api } from './utils/api';
import { toast } from 'react-toastify';

const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    <Router>
      <ToastContainer />
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
      </Routes>
    </Router>
  );
}

export default App;