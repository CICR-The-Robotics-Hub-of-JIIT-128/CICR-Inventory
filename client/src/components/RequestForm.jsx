import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from '../utils/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Send, X } from "lucide-react";

const RequestForm = () => {
  const navigate = useNavigate();
  const { itemId } = useParams();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    quantity: '',
    purpose: '',
    notes: ''
  });

  useEffect(() => {
    const fetchItem = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/inventory/${itemId}`);
        if (!response) {
          throw new Error('Item not found');
        }
        setItem(response);
      } catch (error) {
        toast.error('Failed to load item details');
        console.error('Error:', error);
        navigate('/dashboard'); // Redirect on error
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      fetchItem();
    }
  }, [itemId, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const requestData = {
        itemId: itemId,
        quantity: formData.quantity,
        purpose: formData.purpose,
        notes: formData.notes
      };
  
      await api.post('/requests', requestData);
      toast.success('Request submitted successfully');
      navigate('/requests/history');
    } catch (error) {
      toast.error(error.message || 'Failed to submit request');
      console.error('Submit error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-pulse text-purple-400">Loading...</div>
      </div>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto bg-zinc-900/50 border-white/10 backdrop-blur-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
          CICR Inventory Request
        </CardTitle>
      </CardHeader>
      <CardContent>
        {item && (
          <div className="mb-6 p-4 rounded-lg bg-zinc-800/50 border border-white/10">
            <h3 className="text-lg font-medium text-white/90 mb-2">{item.name}</h3>
            <div className="text-sm text-white/70">
              <p>Category: {item.category}</p>
              <p>Available Quantity: {item.quantity}</p>
              <p>Location: {item.location}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label className="text-white/70">Quantity Required</Label>
            <Input
              type="number"
              required
              min="1"
              max={item?.quantity}
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
              className="bg-zinc-800/50 border-white/10 text-white/90"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">Purpose</Label>
            <Textarea
              required
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="bg-zinc-800/50 border-white/10 text-white/90 min-h-[100px]"
              placeholder="Please describe the purpose of this request..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">Additional Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-zinc-800/50 border-white/10 text-white/90"
              placeholder="Any additional information..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-6">
            <Button
              type="button"
              onClick={() => navigate('/dashboard')}
              variant="outline"
              className="border-white/10 text-white/70 hover:bg-white/5"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
            >
              <Send className="w-4 h-4 mr-2" />
              Submit Request
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default RequestForm;