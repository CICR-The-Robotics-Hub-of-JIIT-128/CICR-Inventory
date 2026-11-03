import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { BorrowStatusBadge } from '../common/Badge';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  Clock,
  User
} from 'lucide-react';

export const RequestsList: React.FC = () => {
  const { requests, updateBorrowStatus, items } = useInventory();
  const { user, profile, isLeadOrAdmin } = useAuth();
  const { showToast } = useToast();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const filteredRequests = requests.filter((req) => {
    const matchesStatus = filterStatus === 'all' || req.status === filterStatus;
    const matchesSearch =
      req.item_name.toLowerCase().includes(search.toLowerCase()) ||
      req.project_name.toLowerCase().includes(search.toLowerCase()) ||
      req.user_name.toLowerCase().includes(search.toLowerCase()) ||
      req.user_email.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const handleAction = async (
    requestId: string,
    action: 'approved' | 'rejected' | 'returned'
  ) => {
    setProcessingId(requestId);
    const note = adminNotes[requestId];
    const res = await updateBorrowStatus(requestId, action, note);
    setProcessingId(null);

    if (res.success) {
      showToast(
        action === 'approved' ? 'success' : action === 'returned' ? 'info' : 'warning',
        `Request ${action.toUpperCase()}`,
        `Borrow status updated to ${action}.`
      );
    } else {
      showToast('error', 'Update Failed', res.error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-cyan-400" />
              Equipment Borrowing Queue
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Manage member checkouts, approvals, and component return verification
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold">
              {requests.filter((r) => r.status === 'pending').length} Pending Approvals
            </span>
          </div>
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer pr-2"
            >
              <option value="all" className="bg-slate-900">All Requests</option>
              <option value="pending" className="bg-slate-900">Pending</option>
              <option value="approved" className="bg-slate-900">Approved / Active</option>
              <option value="returned" className="bg-slate-900">Returned</option>
              <option value="rejected" className="bg-slate-900">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Feed */}
      {filteredRequests.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <Clock className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No borrow requests found</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {filterStatus === 'all'
              ? 'No borrow requests have been made yet.'
              : `No requests with status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const isProcessing = processingId === req.id;
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isOwnRequest = user?.id === req.user_id || user?.email === req.user_email;

            return (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
              >
                {/* Top Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{req.item_name}</span>
                    <span className="px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-400 font-mono text-xs font-semibold border border-cyan-800">
                      {req.quantity} unit{req.quantity > 1 ? 's' : ''}
                    </span>
                    <BorrowStatusBadge status={req.status} adminNotes={req.admin_notes} />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Return by: <strong className="text-slate-200">{req.expected_return_date}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Middle Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      Project / Purpose
                    </span>
                    <p className="font-semibold text-cyan-300">{req.project_name}</p>
                    <p className="text-slate-400 mt-1 leading-relaxed">{req.purpose}</p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                      Borrower Details
                    </span>
                    <div className="flex items-center gap-1.5 font-medium text-slate-200">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{req.user_name}</span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-0.5">{req.user_email}</p>
                    {req.approved_by && (
                      <p className="text-slate-300 text-[11px] mt-1 font-semibold">
                        <span className="text-slate-500 font-normal">
                          {req.status === 'rejected' ? 'Rejected by:' : 'Approved by:'}{' '}
                        </span>
                        {req.approved_by}
                      </p>
                    )}
                    {req.admin_notes && (
                      <div className="mt-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-amber-300">
                        <strong>Admin Note:</strong> {req.admin_notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Actions Bar */}
                {isLeadOrAdmin && (isPending || isApproved) && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <input
                      type="text"
                      placeholder="Optional admin approval/return note..."
                      value={adminNotes[req.id] || ''}
                      onChange={(e) =>
                        setAdminNotes({ ...adminNotes, [req.id]: e.target.value })
                      }
                      className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 flex-1 max-w-sm"
                    />

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {isPending && (
                        <>
                          <button
                            onClick={() => handleAction(req.id, 'approved')}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Approve Checkout</span>
                          </button>
                          <button
                            onClick={() => handleAction(req.id, 'rejected')}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {isApproved && (
                        <button
                          onClick={() => handleAction(req.id, 'returned')}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                          <span>Mark as Returned to Lab</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

