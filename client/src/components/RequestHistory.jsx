import { useState, useEffect } from 'react';
import axios from '../axios';
import { toast } from 'react-hot-toast';
import { Check, X, Clock, Archive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function RequestHistory({ isAdmin }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Use different endpoint based on user role
      const endpoint = isAdmin ? '/requests/all' : '/requests/my-requests';
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setRequests(response.data);
    } catch (error) {
      console.error('Fetch requests error:', error);
      toast.error('Failed to load request history');
    } finally {
      setLoading(false);
    }
  };

  // Move useEffect after fetchRequests definition and add proper dependency
  useEffect(() => {
    fetchRequests();
  }, []); // Remove isAdmin from dependencies since it's not changing

  const handleStatusUpdate = async (requestId, newStatus) => {
    try {
      await axios.put(`/requests/${requestId}/status`, 
        { status: newStatus },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      toast.success('Request status updated');
      fetchRequests();
    } catch (error) {
      console.error('Status update error:', error);
      toast.error('Failed to update request status');
    }
  };

  const getStatusBadgeColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      DENIED: 'bg-red-100 text-red-800',
      COMPLETED: 'bg-blue-100 text-blue-800',
      CANCELLED: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
        {isAdmin ? 'Manage Equipment Requests' : 'My Equipment Requests'}
      </h2>
      {requests.length === 0 ? (
        <p className="text-gray-400 text-center py-4">No requests found</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-zinc-900/50">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Purpose</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                {isAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-zinc-900/30 divide-y divide-white/10">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-zinc-800/50">
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {request.user.username}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {request.item.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {request.quantity}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {request.purpose}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(request.status)}`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {new Date(request.createdAt).toLocaleDateString()}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <select
                        className="bg-zinc-800 text-gray-300 rounded-md border-white/10 focus:border-purple-500 focus:ring-purple-500 text-sm"
                        value={request.status}
                        onChange={(e) => handleStatusUpdate(request.id, e.target.value)}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approve</option>
                        <option value="DENIED">Deny</option>
                        <option value="COMPLETED">Complete</option>
                        <option value="CANCELLED">Cancel</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}