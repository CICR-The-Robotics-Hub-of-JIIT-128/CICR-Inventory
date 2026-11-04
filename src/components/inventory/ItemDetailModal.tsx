import React, { useState } from 'react';
import { InventoryItem, isReturnRequested } from '../../types/inventory';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { DragToConfirm } from '../ui/drag-to-confirm';
import {
  X,
  ExternalLink,
  Layers,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
  Pencil,
  History,
} from 'lucide-react';

interface ItemDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onBorrow: (item: InventoryItem) => void;
  isAdmin?: boolean;
  onEdit?: (item: InventoryItem) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  onClose,
  onBorrow,
  isAdmin,
  onEdit,
}) => {
  const { user, isAdmin: authIsAdmin, profile } = useAuth();
  const isUserAdmin = Boolean(
    (isAdmin ?? true) && (profile?.role === 'admin' || authIsAdmin)
  );
  const { requests, requestItemReturn } = useInventory();
  const { showToast } = useToast();

  const [submittingReturnId, setSubmittingReturnId] = useState<string | null>(null);
  const [confirmReturnId, setConfirmReturnId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');

  if (!item) return null;

  const itemRequests = requests.filter((r) => r.item_id === item.id);

  // Active loans strictly belonging to the currently logged in user
  const myActiveLoans = requests.filter(
    (r) =>
      r.item_id === item.id &&
      r.status === 'approved' &&
      ((user?.id && r.user_id === user.id) ||
        (user?.email && r.user_email?.toLowerCase() === user.email.toLowerCase()))
  );

  const isAvailable = item.available_qty > 0;

  // Clean filename for terminal title bar
  const itemFilename = `${item.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 30)}.tsx`;

  const handleConfirmReturn = async (requestId: string) => {
    setSubmittingReturnId(requestId);
    const res = await requestItemReturn(requestId, returnNote.trim() || undefined);
    setSubmittingReturnId(null);
    setConfirmReturnId(null);
    setReturnNote('');

    if (res.success) {
      showToast(
        'success',
        'Return Request Dispatched',
        'Your clearance request has been forwarded to the Admin Portal.'
      );
    } else {
      showToast('error', 'Return Request Failed', res.error || 'Failed to submit return request');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in select-none">
      {/* Wide Container with Clean Border & No Neon Glow Shadow */}
      <div className="relative w-full max-w-xl sm:max-w-2xl bg-[#0c0a17] border border-zinc-800 rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden text-zinc-100">
        {/* macOS Terminal Title Bar (Symmetrically Balanced) */}
        <div className="select-none bg-[#131024] border-b border-zinc-800 px-5 py-3 flex items-center justify-between shrink-0">
          {/* Left: Window Dots */}
          <div className="flex items-center gap-2 w-16">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] inline-block shadow-sm" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] inline-block shadow-sm" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] inline-block shadow-sm" />
          </div>

          {/* Center: Monospace Filename */}
          <div className="font-mono text-xs font-semibold text-zinc-300 flex items-center justify-center gap-1.5 truncate flex-1 text-center">
            <span className="text-purple-400 font-bold">~</span>
            <span className="truncate">{itemFilename}</span>
          </div>

          {/* Right: Close Button */}
          <div className="flex items-center justify-end w-16">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 no-scrollbar">
          {/* 1. Component Name & Availability Badge */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
                {item.name}
              </h2>

              <span
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-mono font-medium border mt-0.5 ${
                  isAvailable
                    ? 'bg-purple-950/60 border-purple-500/30 text-purple-300'
                    : 'bg-rose-950/60 border-rose-500/30 text-rose-300'
                }`}
              >
                {isAvailable ? `${item.available_qty} / ${item.total_qty} Available` : 'Out of Stock'}
              </span>
            </div>

            {myActiveLoans.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                <PackageCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>Currently Issued to You ({myActiveLoans.reduce((s, l) => s + l.quantity, 0)} units)</span>
              </span>
            )}
          </div>

          {/* 2. Description */}
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal whitespace-pre-line text-left">
            {item.description || 'Standard laboratory hardware component for robotics prototyping and electronic development.'}
          </p>

          {/* 3. Category & Metadata */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>{item.category}</span>
            </span>

            {item.datasheet_url && (
              <a
                href={item.datasheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.08] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Datasheet</span>
              </a>
            )}
          </div>

          {/* 4. Recent Activity */}
          <div className="pt-2 space-y-2 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-purple-400" />
                <span>Recent Activity</span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                ({itemRequests.length} logged)
              </span>
            </div>

            {itemRequests.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-0.5">No recent activity logged for this component.</p>
            ) : (
              <div className="space-y-1.5 max-h-24 overflow-y-auto no-scrollbar pr-0.5">
                {itemRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-2.5 rounded-lg bg-white/[0.03] text-xs flex items-center justify-between text-zinc-300"
                  >
                    <span className="font-medium truncate pr-2">
                      {req.user_name} <span className="text-purple-300 font-mono text-[11px]">({req.quantity} units)</span>
                      <span className="text-zinc-500 text-[11px]"> &bull; {req.project_name}</span>
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono shrink-0">
                      {new Date(req.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Loans Return Tray (if user currently has this item checked out) */}
          {myActiveLoans.length > 0 && (
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-purple-200">
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                  <span>Your Active Loans</span>
                </div>
                <span className="text-xs font-mono font-medium bg-purple-500/15 px-2 py-0.5 rounded text-purple-300">
                  {myActiveLoans.reduce((sum, l) => sum + l.quantity, 0)} Units in Possession
                </span>
              </div>

              {myActiveLoans.map((loan) => {
                const isReturning = isReturnRequested(loan);
                const isConfirming = confirmReturnId === loan.id;

                return (
                  <div key={loan.id} className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-white">
                          {loan.quantity}x {loan.item_name}{' '}
                          <span className="text-purple-400 font-mono text-[11px]">({loan.project_name})</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Due: {loan.expected_return_date}
                        </div>
                      </div>

                      {!isConfirming && (
                        <div>
                          {isReturning ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-purple-500/20 text-purple-300">
                              <Clock className="w-3 h-3 text-purple-400" />
                              <span>Awaiting Admin</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmReturnId(loan.id)}
                              className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors cursor-pointer"
                            >
                              Return
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isConfirming && (
                      <div className="pt-2 border-t border-white/[0.08] space-y-2">
                        <div className="flex items-start gap-1.5 text-zinc-300 text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                          <span>Clearance request will be dispatched to Admin Portal.</span>
                        </div>
                        <input
                          type="text"
                          value={returnNote}
                          onChange={(e) => setReturnNote(e.target.value)}
                          placeholder="Optional return notes..."
                          className="w-full px-2.5 py-1.5 bg-black/60 border border-white/10 rounded-lg text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmReturnId(null);
                              setReturnNote('');
                            }}
                            className="px-2.5 py-1 text-zinc-400 hover:text-white text-xs cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmReturn(loan.id)}
                            disabled={submittingReturnId === loan.id}
                            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{submittingReturnId === loan.id ? 'Sending...' : 'Confirm'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 5. Bottom Actions: Centered Slide to Request with Circular Edit Icon Button beside it */}
          <div className="pt-2 flex items-center justify-center gap-3 w-full max-w-md sm:max-w-lg mx-auto">
            {isAvailable ? (
              <div className="flex-1 min-w-0">
                <DragToConfirm
                  size="md"
                  label="Slide to Request Item"
                  confirmedLabel="Component Selected!"
                  actionType="confirm"
                  variant="default"
                  onConfirm={() => {
                    setTimeout(() => {
                      onClose();
                      onBorrow(item);
                    }, 300);
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 py-3 px-4 rounded-full bg-rose-500/10 border border-rose-500/20 text-center font-medium text-xs text-rose-300">
                Out of Stock — 0 Units Available
              </div>
            )}

            {/* Edit Icon Button beside slider (Strictly Admin Only) */}
            {isUserAdmin && onEdit && (
              <button
                type="button"
                onClick={() => {
                  if (!isUserAdmin) {
                    showToast('error', 'Admin Clearance Required', 'Only administrators can edit components.');
                    return;
                  }
                  onEdit(item);
                }}
                className="w-12 h-12 rounded-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white border border-purple-500/25 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
                title="Edit Component (Admin Clearance)"
                aria-label="Edit Component"
              >
                <Pencil className="w-4.5 h-4.5 text-purple-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
