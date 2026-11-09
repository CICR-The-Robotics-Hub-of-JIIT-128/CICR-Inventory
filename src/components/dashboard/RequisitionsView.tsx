import React, { useState } from 'react';
import {
  Bell,
  Search,
  Plus,
  Inbox,
  Boxes,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  User,
  Calendar,
  Ticket,
  AlertCircle,
} from 'lucide-react';
import { BorrowRequest, InventoryItem, isReturnRequested } from '../../types/inventory';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../common/Toast';
import {
  extractIdentityFromEmail,
  isDirtyOrPlaceholderName,
  stripRollTokensFromName,
  toCleanDisplayName,
} from '../../lib/identity';

interface RequisitionsViewProps {
  requests: BorrowRequest[];
  items: InventoryItem[];
  allMembers?: any[];
  isLeadOrAdmin: boolean;
  userEmail?: string;
  userId?: string;
  onNavigateToVault: () => void;
  onBorrowAction: (
    requestId: string,
    action: 'approved' | 'rejected' | 'returned',
    note?: string
  ) => void | Promise<void>;
  onOpenIssuePass: (req: BorrowRequest) => void;
}

export const RequisitionsView: React.FC<RequisitionsViewProps> = ({
  requests,
  items,
  allMembers = [],
  isLeadOrAdmin,
  userEmail,
  userId,
  onNavigateToVault,
  onBorrowAction,
  onOpenIssuePass,
}) => {
  const { requestItemReturn, cancelReturnRequest } = useInventory();
  const { showToast } = useToast();

  const [requestStatusTab, setRequestStatusTab] = useState<
    'all' | 'pending' | 'returns' | 'approved' | 'rejected' | 'returned'
  >('all');
  const [requestSearch, setRequestSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmReturnId, setConfirmReturnId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');

  const activeRequestsList = isLeadOrAdmin
    ? requests
    : requests.filter(
        (r) =>
          r.user_email === userEmail ||
          r.user_id === userId ||
          (userEmail && r.user_email?.toLowerCase() === userEmail.toLowerCase())
      );

  const pendingCount = activeRequestsList.filter((r) => r.status === 'pending').length;
  const returnRequestsCount = activeRequestsList.filter((r) => isReturnRequested(r)).length;
  const normalApprovedCount = activeRequestsList.filter(
    (r) => r.status === 'approved' && !isReturnRequested(r)
  ).length;
  const rejectedCount = activeRequestsList.filter((r) => r.status === 'rejected').length;
  const returnedCount = activeRequestsList.filter((r) => r.status === 'returned').length;

  const resolveBorrowerIdentity = (req: BorrowRequest) => {
    const emailLower = (req.user_email || '').toLowerCase().trim();
    const matchedMember = allMembers.find(
      (m) =>
        (req.user_id && m.id === req.user_id) ||
        (emailLower && m.email?.toLowerCase().trim() === emailLower)
    );

    const metaNameCandidate =
      matchedMember?.full_name && !isDirtyOrPlaceholderName(matchedMember.full_name, req.user_email)
        ? matchedMember.full_name
        : !isDirtyOrPlaceholderName(req.user_name, req.user_email)
        ? req.user_name
        : matchedMember?.full_name || req.user_name;

    const extracted = extractIdentityFromEmail(req.user_email, {
      full_name: metaNameCandidate,
      enrollment_no: matchedMember?.roll_number || matchedMember?.enrollment_no,
    });

    const cleanName = !isDirtyOrPlaceholderName(metaNameCandidate, req.user_email)
      ? toCleanDisplayName(metaNameCandidate)
      : extracted.fullName || 'Member';

    const enrollmentNo = (
      matchedMember?.roll_number ||
      matchedMember?.enrollment_no ||
      extracted.enrollmentNo ||
      ''
    ).trim();

    return { cleanName, enrollmentNo };
  };

  const filteredList = activeRequestsList.filter((req) => {
    let matchesTab = true;
    if (requestStatusTab === 'pending') {
      matchesTab = req.status === 'pending';
    } else if (requestStatusTab === 'returns') {
      matchesTab = isReturnRequested(req);
    } else if (requestStatusTab === 'approved') {
      matchesTab = req.status === 'approved' && !isReturnRequested(req);
    } else if (requestStatusTab === 'rejected') {
      matchesTab = req.status === 'rejected';
    } else if (requestStatusTab === 'returned') {
      matchesTab = req.status === 'returned';
    }

    const q = requestSearch.toLowerCase().trim();
    const borrower = resolveBorrowerIdentity(req);
    const matchesSearch =
      !q ||
      req.item_name.toLowerCase().includes(q) ||
      req.project_name.toLowerCase().includes(q) ||
      req.user_name.toLowerCase().includes(q) ||
      borrower.cleanName.toLowerCase().includes(q) ||
      (borrower.enrollmentNo && borrower.enrollmentNo.toLowerCase().includes(q)) ||
      req.user_email.toLowerCase().includes(q);

    return matchesTab && matchesSearch;
  });

  const handleAdminBorrowAction = async (
    requestId: string,
    action: 'approved' | 'rejected' | 'returned'
  ) => {
    if (actionLoadingId) return;
    setActionLoadingId(requestId);
    try {
      await onBorrowAction(requestId, action);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMemberSubmitReturn = async (requestId: string) => {
    if (actionLoadingId) return;
    setActionLoadingId(requestId);
    try {
      const res = await requestItemReturn(requestId, returnNote.trim() || undefined);
      setConfirmReturnId(null);
      setReturnNote('');

      if (res.success) {
        showToast(
          'success',
          'Return Request Sent',
          'Component return request submitted to the Admin Portal. An admin will inspect and approve the return.'
        );
      } else {
        showToast('error', 'Return Request Failed', res.error);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAdminDeclineReturn = async (requestId: string) => {
    if (actionLoadingId) return;
    setActionLoadingId(requestId);
    try {
      const res = await cancelReturnRequest(requestId, 'Inspected by admin — return cancelled or item still with member');

      if (res.success) {
        showToast('info', 'Return Request Declined', 'Requisition remains in active loan status.');
      } else {
        showToast('error', 'Action Failed', res.error);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-7 rounded-3xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-[#20202c] space-y-4 sm:space-y-6 shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 pb-4 sm:pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white flex items-start lg:items-center gap-2 sm:gap-2.5 tracking-tight">
            <Bell className="w-5 h-5 text-blue-600 dark:text-purple-400 shrink-0 mt-0.5 lg:mt-0" />
            {isLeadOrAdmin ? (
              <span className="leading-snug lg:leading-normal">
                <span className="block lg:inline">Requisition &amp; Return </span>
                <span className="block lg:inline text-sm sm:text-lg lg:text-2xl text-slate-800 dark:text-zinc-200 lg:text-slate-900 lg:dark:text-white">
                  Approval Portal <span className="text-blue-600 dark:text-purple-400 font-extrabold">(Admin Clearance)</span>
                </span>
              </span>
            ) : (
              <span>My Hardware Requisitions &amp; Issues</span>
            )}
          </h2>
        </div>

        {!isLeadOrAdmin && (
          <button
            type="button"
            onClick={onNavigateToVault}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-md shadow-blue-600/25 dark:shadow-purple-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>Borrow Hardware</span>
          </button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 pb-1 sm:pb-0">
            {[
              { key: 'all', label: 'All', count: activeRequestsList.length },
              { key: 'pending', label: 'Pending Approvals', count: pendingCount, pulse: pendingCount > 0 },
              { key: 'returns', label: 'Return Requests', count: returnRequestsCount, pulse: returnRequestsCount > 0, highlight: true },
              { key: 'approved', label: 'Active Loans', count: normalApprovedCount },
              { key: 'returned', label: 'Returned', count: returnedCount },
              { key: 'rejected', label: 'Rejected', count: rejectedCount },
            ].map((tab) => {
              const isTabActive = requestStatusTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRequestStatusTab(tab.key as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isTabActive
                      ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-sm font-bold'
                      : tab.highlight && tab.count > 0
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-2 border-purple-400 dark:border-purple-600'
                      : 'bg-slate-100 dark:bg-[#151520] text-slate-700 dark:text-zinc-400 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isTabActive
                        ? 'bg-white text-blue-600 dark:text-purple-400'
                        : tab.pulse
                        ? 'bg-amber-500 text-black animate-pulse'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={requestSearch}
              onChange={(e) => setRequestSearch(e.target.value)}
              placeholder="Search requests..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 dark:focus:border-purple-500 transition-colors"
            />
          </div>
        </div>

        {/* Requests List */}
        {filteredList.length === 0 ? (
          <div className="py-16 text-center rounded-2xl bg-slate-50 dark:bg-[#121219] border-2 border-slate-200 dark:border-zinc-800/70 p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-purple-950/40 border-2 border-blue-200 dark:border-purple-500/30 text-blue-600 dark:text-purple-400 flex items-center justify-center mx-auto">
              <Inbox className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {requestStatusTab === 'all'
                ? 'No borrow requests found'
                : requestStatusTab === 'returns'
                ? 'No return requests awaiting clearance'
                : `No ${requestStatusTab} requests found`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
              {!isLeadOrAdmin
                ? 'You currently have no requisitions in this tab. Explore our component vault to check out electronics.'
                : 'No requisitions currently match this filter criteria.'}
            </p>
            {!isLeadOrAdmin && (
              <button
                type="button"
                onClick={onNavigateToVault}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-md shadow-blue-600/25 dark:shadow-purple-950/40"
              >
                <Boxes className="w-4 h-4" />
                <span>Browse Component Vault</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
            {filteredList.map((req) => {
              const matchedItem = items.find((i) => i.id === req.item_id);
              const returnPending = isReturnRequested(req);
              const isOwner =
                (userId && req.user_id === userId) ||
                (userEmail && req.user_email?.toLowerCase() === userEmail.toLowerCase());
              const borrower = resolveBorrowerIdentity(req);
              const cleanApprover =
                stripRollTokensFromName(req.approved_by) || req.approved_by || '';

              return (
                <div
                  key={req.id}
                  className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#14141c] border-2 transition-all flex flex-col justify-between gap-4 text-xs shadow-sm ${
                    returnPending
                      ? 'border-purple-500/70 dark:border-purple-500/60 shadow-lg shadow-purple-500/10'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-purple-500'
                  }`}
                >
                  {/* Return Requested Banner for Admin / Member */}
                  {returnPending && (
                    <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-[#191032] border border-purple-200 dark:border-purple-800/80 flex items-center justify-between text-xs text-purple-800 dark:text-purple-300">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 animate-spin" />
                        <span className="font-bold">
                          {isLeadOrAdmin
                            ? `Return Submitted by ${borrower.cleanName} — Admin Approval Needed`
                            : 'Return Request Sent to Admin Portal (Awaiting Clearance)'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-200/60 dark:bg-purple-900/60 font-black">
                        ACTION REQUIRED
                      </span>
                    </div>
                  )}

                  {/* Info Column */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">
                        {req.item_name}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-purple-950/60 border border-blue-200 dark:border-purple-500/40 text-blue-700 dark:text-purple-300 font-mono text-[11px] font-bold">
                        x{req.quantity}
                      </span>

                      {/* Status Tag */}
                      {returnPending ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 bg-purple-950 text-purple-300 border border-purple-700 animate-pulse">
                          <Clock className="w-3 h-3 text-purple-400" />
                          <span>Return Requested (Pending Approval)</span>
                        </span>
                      ) : (
                        <span
                          className={`capitalize px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 ${
                            req.status === 'approved'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : req.status === 'pending'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                              : req.status === 'rejected'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                          }`}
                        >
                          {req.status === 'approved' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          {req.status === 'pending' && <Clock className="w-3 h-3 text-amber-400" />}
                          {req.status === 'rejected' && <XCircle className="w-3 h-3 text-rose-400" />}
                          {req.status === 'returned' && <RotateCcw className="w-3 h-3 text-blue-600 dark:text-purple-400" />}
                          {req.status === 'approved' ? 'Active Loan / Issued' : req.status === 'pending' ? 'Pending Admin Clearance' : req.status}
                        </span>
                      )}
                    </div>

                    {/* Borrower Info (prominent for Admins) */}
                    {isLeadOrAdmin && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-700 dark:text-zinc-400 text-xs font-medium">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <User className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-slate-500 dark:text-zinc-400">Borrower:</span>
                          <strong className="text-slate-900 dark:text-white font-bold">{borrower.cleanName}</strong>
                        </div>
                        {borrower.enrollmentNo && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-mono text-[10px] font-bold">
                            Roll: {borrower.enrollmentNo}
                          </span>
                        )}
                        <span className="text-slate-600 dark:text-zinc-400 font-mono text-[11px] break-all">
                          ({req.user_email})
                        </span>
                      </div>
                    )}

                    {/* Project & Purpose */}
                    <div className="text-slate-700 dark:text-zinc-300 space-y-1">
                      <div>
                        <span className="text-slate-600 dark:text-zinc-400 font-semibold">Project: </span>
                        <span className="text-blue-600 dark:text-purple-400 font-semibold">{req.project_name}</span>
                        {req.purpose && (
                          <>
                            <span className="text-zinc-600 mx-1.5">|</span>
                            <span className="text-slate-700 dark:text-zinc-300">{req.purpose}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Dates Timeline & Storage Location */}
                    <div className="flex items-center gap-4 text-[11px] text-slate-700 dark:text-zinc-300 pt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        <span className="text-slate-600 dark:text-zinc-400 font-semibold">Requested: </span>
                        <strong className="text-slate-800 dark:text-zinc-300 font-medium">
                          {req.created_at ? req.created_at.split('T')[0] : 'Recently'}
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400/80" />
                        <span className="text-slate-600 dark:text-zinc-400 font-semibold">Expected Return: </span>
                        <strong className="text-amber-700 dark:text-amber-300 font-bold">{req.expected_return_date}</strong>
                      </span>
                      {req.actual_return_date && (
                        <span className="text-blue-600 dark:text-purple-400 font-semibold">
                          Returned: {req.actual_return_date}
                        </span>
                      )}
                      {cleanApprover && (req.status === 'approved' || req.status === 'returned' || req.status === 'rejected') && (
                        <span className="flex items-center gap-1">
                          {req.status === 'rejected' ? (
                            <XCircle className="w-3 h-3 text-rose-500" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-purple-400" />
                          )}
                          <span className="text-slate-600 dark:text-zinc-400 font-semibold">
                            {req.status === 'rejected' ? 'Rejected by:' : 'Approved by:'}{' '}
                          </span>
                          <strong className={
                            req.status === 'rejected'
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : 'text-slate-900 dark:text-zinc-200 font-bold'
                          }>
                            {cleanApprover}
                          </strong>
                        </span>
                      )}
                    </div>

                    {/* Admin Note / Instructions */}
                    {req.admin_notes && (
                      <div className="mt-2 p-2 rounded-xl bg-slate-50 dark:bg-[#1b1b26] border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300">
                        <span className="font-bold text-slate-900 dark:text-white">Admin Note: </span>
                        {req.admin_notes.replace(/\[RETURN_REQUESTED\][^\n|]*/g, '').trim() || req.admin_notes}
                      </div>
                    )}
                  </div>

                  {/* Action Column for Both Admins & Members */}
                  <div className="flex flex-col sm:items-end gap-2.5 shrink-0 pt-2 border-t border-slate-200 dark:border-zinc-800">
                    {isLeadOrAdmin ? (
                      /* Admin Actions */
                      <div className="w-full sm:w-auto space-y-2">
                        {req.status === 'pending' && (
                          <div className="space-y-2 w-full sm:w-auto">
                            <div className="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              <span>Awaiting Admin Approval to Issue</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={actionLoadingId === req.id}
                                onClick={() => handleAdminBorrowAction(req.id, 'approved')}
                                className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{actionLoadingId === req.id ? 'Approving...' : 'Approve & Authorize Issue'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoadingId === req.id}
                                onClick={() => handleAdminBorrowAction(req.id, 'rejected')}
                                className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>{actionLoadingId === req.id ? 'Rejecting...' : 'Reject'}</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {req.status === 'approved' && (
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            {returnPending ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAdminBorrowAction(req.id, 'returned')}
                                  disabled={actionLoadingId === req.id}
                                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                  <span>{actionLoadingId === req.id ? 'Restocking...' : 'Approve Return & Restock'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdminDeclineReturn(req.id)}
                                  disabled={actionLoadingId === req.id}
                                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                  <span>Decline</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={actionLoadingId === req.id}
                                onClick={() => handleAdminBorrowAction(req.id, 'returned')}
                                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs cursor-pointer shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-white" />
                                <span>{actionLoadingId === req.id ? 'Restocking...' : 'Mark Returned & Restock'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Regular Member Clearance Actions */
                      <div className="flex flex-col sm:items-end gap-1.5">
                        {req.status === 'pending' && (
                          <div className="flex flex-col sm:items-end gap-1">
                            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 animate-spin" />
                              <span>Pending Admin Clearance</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 text-right max-w-xs">
                              Cannot issue yet. Sent to Admin Portal for clearance.
                            </span>
                          </div>
                        )}

                        {req.status === 'approved' && (
                          <div className="flex flex-col sm:items-end gap-2 w-full">
                            {returnPending ? (
                              <div className="flex flex-col sm:items-end gap-1">
                                <div className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                                  <Clock className="w-3.5 h-3.5 text-purple-500" />
                                  <span>Return Request Sent to Admin</span>
                                </div>
                                <span className="text-[10px] text-slate-500 dark:text-zinc-400 text-right max-w-xs">
                                  Component submitted for return. Awaiting admin clearance to restock.
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenIssuePass(req)}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-sm transition-colors flex items-center gap-1.5"
                                  title="View Issue Pass"
                                >
                                  <Ticket className="w-3.5 h-3.5 text-white" />
                                  <span>Issue Pass</span>
                                </button>

                                {/* STRICT: Only the borrower who issued it can return it! */}
                                {isOwner && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmReturnId(req.id)}
                                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-blue-600/25 dark:shadow-purple-950/40 transition-colors flex items-center gap-1.5"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-white" />
                                    <span>Return Component</span>
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Inline Confirm Modal/Drawer for Member */}
                            {confirmReturnId === req.id && (
                              <div className="w-full mt-2 p-3 rounded-xl bg-slate-50 dark:bg-[#0c081a] border-2 border-blue-200 dark:border-purple-800 space-y-2 text-xs">
                                <div className="flex items-start gap-2 text-slate-700 dark:text-zinc-300 text-[11px]">
                                  <AlertCircle className="w-4 h-4 text-blue-600 dark:text-purple-400 shrink-0 mt-0.5" />
                                  <span>
                                    Confirm returning <strong>{req.quantity}x {req.item_name}</strong>. Request will be submitted to Admin Portal for clearance.
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  value={returnNote}
                                  onChange={(e) => setReturnNote(e.target.value)}
                                  placeholder="Optional return notes (e.g., returned to lab drawer)..."
                                  className="w-full px-3 py-1.5 bg-white dark:bg-black/50 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500 dark:focus:border-purple-500"
                                />
                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmReturnId(null);
                                      setReturnNote('');
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMemberSubmitReturn(req.id)}
                                    disabled={actionLoadingId === req.id}
                                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{actionLoadingId === req.id ? 'Submitting...' : 'Send Return Request to Admin'}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {req.status === 'rejected' && (
                          <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Requisition Rejected</span>
                          </div>
                        )}

                        {req.status === 'returned' && (
                          <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-bold flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                            <span>Returned &amp; Restocked</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
