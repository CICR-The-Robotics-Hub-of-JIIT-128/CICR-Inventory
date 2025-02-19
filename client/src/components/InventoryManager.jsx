import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ItemForm from './ItemForm';
import axios from 'axios';
import toast from 'react-hot-toast';

const InventoryManager = () => {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);

  const handleSubmit = async (formData) => {
    try {
      if (selectedItem) {
        // Update existing item
        const response = await axios.put(`/api/inventory/${selectedItem.id}`, formData);
        setItems(items.map(item => 
          item.id === selectedItem.id ? response.data : item
        ));
      } else {
        // Create new item
        const response = await axios.post('/api/inventory', formData);
        setItems([response.data, ...items]);
      }
      setShowForm(false);
      setSelectedItem(null);
      toast.success(`Item ${selectedItem ? 'updated' : 'created'} successfully!`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save item');
      throw error;
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/inventory/${id}`);
      setItems(items.filter(item => item.id !== id));
      toast.success('Item deleted successfully!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete item');
    }
  };

  return (
    <div className="container mx-auto p-4">
      {user?.role === 'ADMIN' && (
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary mb-4"
        >
          Add New Item
        </button>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">
              {selectedItem ? 'Edit Item' : 'Add New Item'}
            </h2>
            <ItemForm
              initialData={selectedItem}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setSelectedItem(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Rest of your inventory display code */}
    </div>
  );
};

export default InventoryManager; 