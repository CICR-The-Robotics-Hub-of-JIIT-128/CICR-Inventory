import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Login from './components/Login';
import DashboardLayout from './components/DashboardLayout';
import InventoryTable from './components/InventoryTable';
import ItemForm from './components/ItemForm';
import { api } from './utils/api';

const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const App = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const data = await api.get('/inventory');
      setItems(data);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') === 'true') {
      fetchItems();
    }
  }, []);

  return (
    <Router>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route 
            path="dashboard" 
            element={
              <InventoryTable 
                items={items} 
                loading={loading}
                onRefresh={fetchItems}
              />
            } 
          />
          <Route path="items/new" element={<ItemForm onSuccess={fetchItems} />} />
          <Route path="items/:id/edit" element={<ItemForm onSuccess={fetchItems} />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App; 