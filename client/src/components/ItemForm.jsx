import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from '../utils/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Save, X } from "lucide-react";

const ItemForm = ({ initialData, onSuccess }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    category: initialData?.category || '',
    quantity: initialData?.quantity || 0,
    location: initialData?.location || '',
    status: initialData?.status || 'AVAILABLE',
    description: initialData?.description || '',
    serialNumber: initialData?.serialNumber || '',
    barcode: initialData?.barcode || '',
    manufacturer: initialData?.manufacturer || '',
    purchaseDate: initialData?.purchaseDate ? new Date(initialData.purchaseDate).toISOString().split('T')[0] : '',
    warrantyExpiry: initialData?.warrantyExpiry ? new Date(initialData.warrantyExpiry).toISOString().split('T')[0] : '',
    minimumStock: initialData?.minimumStock || 0,
    price: initialData?.price || ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (initialData?.id) {
        await api.put(`/inventory/${initialData.id}`, formData);
        toast.success('Item updated successfully');
      } else {
        await api.post('/inventory', formData);
        toast.success('Item created successfully');
      }
      onSuccess?.();
      navigate('/dashboard');
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.message || 'Failed to save item');
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  return (
    <Card className="max-w-2xl mx-auto mt-8 bg-zinc-900/50 border-white/10 backdrop-blur-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
          {initialData ? 'Edit' : 'Add New'} Item
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-white/70">Name</Label>
              <Input
                type="text"
                name="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="bg-zinc-800/50 border-white/10 text-white/90 focus:ring-purple-500/30"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Category</Label>
              <Input
                type="text"
                name="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
                className="bg-zinc-800/50 border-white/10 text-white/90"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Quantity</Label>
              <Input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                required
                min="0"
                className="bg-zinc-800/50 border-white/10 text-white/90"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Status</Label>
              <Select 
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="bg-zinc-800/50 border-white/10 text-white/90">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-white/10">
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                  <SelectItem value="IN_MAINTENANCE">In Maintenance</SelectItem>
                  <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
                  <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Location</Label>
              <Input
                type="text"
                name="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
                className="bg-zinc-800/50 border-white/10 text-white/90"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Price</Label>
              <Input
                type="number"
                name="price"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                step="0.01"
                min="0"
                className="bg-zinc-800/50 border-white/10 text-white/90"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-white/70">Description</Label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-zinc-800/50 border-white/10 text-white/90 min-h-[100px]"
              />
            </div>
          </div>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="serialNumber" className="text-right text-white/70">
                Serial Number
              </Label>
              <Input
                id="serialNumber"
                name="serialNumber"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                className="col-span-3 bg-zinc-900/50 border-white/10 text-white/90"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="barcode" className="text-right text-white/70">
                Barcode
              </Label>
              <Input
                id="barcode"
                name="barcode"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="col-span-3 bg-zinc-900/50 border-white/10 text-white/90"
                placeholder="Enter product barcode"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="manufacturer" className="text-right text-white/70">
                Manufacturer
              </Label>
              <Input
                id="manufacturer"
                name="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="col-span-3 bg-zinc-900/50 border-white/10 text-white/90"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="purchaseDate" className="text-right text-white/70">
                Purchase Date
              </Label>
              <Input
                id="purchaseDate"
                name="purchaseDate"
                value={formData.purchaseDate}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                className="col-span-3 bg-zinc-900/50 border-white/10 text-white/90"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="warrantyExpiry" className="text-right text-white/70">
                Warranty Expiry
              </Label>
              <Input
                id="warrantyExpiry"
                name="warrantyExpiry"
                value={formData.warrantyExpiry}
                onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                className="col-span-3 bg-zinc-900/50 border-white/10 text-white/90"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="minimumStock" className="text-right text-white/70">
                Minimum Stock
              </Label>
              <Input
                id="minimumStock"
                name="minimumStock"
                value={formData.minimumStock}
                onChange={(e) => setFormData({ ...formData, minimumStock: parseInt(e.target.value) || 0 })}
                className="col-span-3 bg-zinc-900/50 border-white/10 text-white/90"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-6">
            <Button
              type="button"
              onClick={handleCancel}
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
              <Save className="w-4 h-4 mr-2" />
              {initialData ? 'Update' : 'Create'} Item
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default ItemForm;