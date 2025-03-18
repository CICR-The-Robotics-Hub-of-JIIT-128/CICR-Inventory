import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from '../utils/api';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Edit2, Trash2, Send, Download, Filter, RefreshCcw, ScanLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BarcodeScanner from './BarcodeScanner';

const InventoryTable = ({ items: itemsData, loading, onRefresh }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER';
  const hasAdminAccess = isAdmin || isManager;
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const items = itemsData?.items || [];

  // Get unique categories and statuses for filters
  const categories = [...new Set(items.map(item => item.category))];
  const statuses = [...new Set(items.map(item => item.status))];

  const handleEdit = (item) => {
    navigate(`/items/${item.id}/edit`);
  };

  const handleRequest = (item) => {
    navigate(`/requests/new/${item.id}`);
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await api.delete(`/inventory/${itemToDelete.id}`);
      toast.success('Item deleted successfully');
      onRefresh();
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast.error('Failed to delete item');
      console.error('Delete error:', error);
    }
  };

  const handleScanSuccess = (item) => {
    setIsBarcodeScannerOpen(false);
    
    // If admin, navigate to edit the item
    if (hasAdminAccess) {
      navigate(`/items/${item.id}/edit`);
    } 
    // If regular user, navigate to request the item
    else if (item.status === 'AVAILABLE') {
      navigate(`/requests/new/${item.id}`);
    } else {
      toast.info(`Item "${item.name}" is not available for request.`);
    }
  };

  // Export functions
  const exportToCsv = () => {
    const headers = ['ID', 'Name', 'Category', 'Quantity', 'Status', 'Location', 'Price'];
    
    const csvContent = [
      headers.join(','),
      ...filteredItems.map(item => [
        item.id,
        `"${item.name.replace(/"/g, '""')}"`,
        `"${item.category.replace(/"/g, '""')}"`,
        item.quantity,
        item.status,
        `"${item.location.replace(/"/g, '""')}"`,
        item.price || '0'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV file exported successfully');
  };
  
  const exportToJson = () => {
    const dataToExport = filteredItems.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      status: item.status,
      location: item.location,
      price: item.price,
      description: item.description,
      serialNumber: item.serialNumber,
      manufacturer: item.manufacturer,
      purchaseDate: item.purchaseDate,
      warrantyExpiry: item.warrantyExpiry
    }));
    
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('JSON file exported successfully');
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = categoryFilter ? item.category === categoryFilter : true;
    const matchesStatus = statusFilter ? item.status === statusFilter : true;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-pulse text-purple-400">Loading inventory items...</div>
      </div>
    );
  }

  if (!itemsData || !itemsData.items) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-white/70">No items found</p>
        <Button
          onClick={onRefresh}
          className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
        >
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-zinc-900/50 border-white/10 text-white/90 w-[300px]"
            />
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsBarcodeScannerOpen(true)}
            className="border-white/10 text-white/70 hover:bg-white/5"
          >
            <ScanLine className="h-4 w-4 mr-2" />
            Scan Barcode
          </Button>
        </div>
        
        <div className="flex gap-2 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-white/10 text-white/70 hover:bg-white/5">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-zinc-900 border border-white/10">
              <DropdownMenuLabel className="text-purple-400">Filters</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              
              <div className="p-2">
                <label className="text-xs text-white/70 block mb-1">Category</label>
                <select 
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-zinc-800 text-white text-sm rounded border border-white/10 p-1"
                >
                  <option value="">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              
              <div className="p-2">
                <label className="text-xs text-white/70 block mb-1">Status</label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-zinc-800 text-white text-sm rounded border border-white/10 p-1"
                >
                  <option value="">All Statuses</option>
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              
              <DropdownMenuSeparator className="bg-white/10" />
              <div className="p-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full border-white/10 text-white/70 hover:bg-white/5"
                  onClick={() => {
                    setCategoryFilter('');
                    setStatusFilter('');
                  }}
                >
                  <RefreshCcw className="h-3 w-3 mr-2" />
                  Reset Filters
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {hasAdminAccess && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/10 text-white/70 hover:bg-white/5">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-900 border border-white/10">
                <DropdownMenuLabel className="text-purple-400">Export Options</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem 
                  onClick={exportToCsv}
                  className="text-white/70 hover:bg-white/5 cursor-pointer"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={exportToJson}
                  className="text-white/70 hover:bg-white/5 cursor-pointer"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {isAdmin && (
            <Button
              onClick={() => navigate('/items/new')}
              className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
            >
              + Add Item
            </Button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <p className="text-white/70">No items found matching your criteria</p>
          <Button
            onClick={() => {
              setSearchTerm('');
              setCategoryFilter('');
              setStatusFilter('');
              onRefresh();
            }}
            className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
          >
            Clear Filters & Refresh
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-white/10 overflow-hidden">
          <Table>
            <TableHeader className="bg-zinc-900/50">
              <TableRow>
                <TableHead className="text-purple-400">Name</TableHead>
                <TableHead className="text-purple-400">Category</TableHead>
                <TableHead className="text-purple-400">Quantity</TableHead>
                <TableHead className="text-purple-400">Status</TableHead>
                <TableHead className="text-purple-400">Location</TableHead>
                <TableHead className="text-purple-400">Price</TableHead>
                <TableHead className="text-purple-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="text-white/80">{item.name}</TableCell>
                  <TableCell className="text-white/60">{item.category}</TableCell>
                  <TableCell className="text-white/60">{item.quantity}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      item.status === 'AVAILABLE' ? 'bg-green-500/20 text-green-400' :
                      item.status === 'OUT_OF_STOCK' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-white/60">{item.location}</TableCell>
                  <TableCell className="text-white/60">${item.price}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {isAdmin ? (
                        <>
                          <Button
                            onClick={() => handleEdit(item)}
                            variant="ghost"
                            size="sm"
                            className="text-purple-400 hover:text-purple-300"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteClick(item)}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => handleRequest(item)}
                          variant="ghost"
                          size="sm"
                          className="text-blue-400 hover:text-blue-300"
                          disabled={item.status !== 'AVAILABLE'}
                        >
                          <Send className="h-4 w-4" />
                          Request
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="p-4 border-t border-white/10 bg-zinc-900/30">
            <p className="text-sm text-white/50">
              Showing {filteredItems.length} of {items.length} items
              {(searchTerm || categoryFilter || statusFilter) && ' (filtered)'}
            </p>
          </div>
        </div>
      )}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-zinc-900 border border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Confirm Deletion</DialogTitle>
            <DialogDescription className="text-white/70">
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
                className="border-white/10 text-white/70 hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDelete}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
              >
                Delete
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBarcodeScannerOpen} onOpenChange={setIsBarcodeScannerOpen}>
        <DialogContent className="bg-transparent border-0 shadow-none p-0 max-w-md">
          <BarcodeScanner 
            onScanSuccess={handleScanSuccess} 
            onClose={() => setIsBarcodeScannerOpen(false)} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryTable;