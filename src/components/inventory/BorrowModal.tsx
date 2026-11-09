import React, { useEffect, useState } from 'react';
import { InventoryItem } from '../../types/inventory';
import { useInventory } from '../../context/InventoryContext';
import { PaymentStatus } from '../ui/payment-status';
import { useAuth } from '../../context/AuthContext';
import { X, Send, AlertCircle, ShoppingBag } from 'lucide-react';
import {
  getDefaultReturnDateIso,
  getTodayIsoDate,
  validateExpectedReturnDate,
} from '../../utils/returnDate';

interface BorrowModalProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BorrowModal: React.FC<BorrowModalProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const { submitBorrowRequest } = useInventory();
  const { user, profile } = useAuth();
  const [confirmedLoan, setConfirmedLoan] = useState<boolean>(false);

  const [quantity, setQuantity] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [purpose, setPurpose] = useState('');
  
  // Default expected return date: 7 days from today in local calendar time
  const minReturnDate = getTodayIsoDate();
  const [expectedReturnDate, setExpectedReturnDate] = useState(() =>
    getDefaultReturnDateIso(7)
  );
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setExpectedReturnDate((prev) => {
      const check = validateExpectedReturnDate(prev);
      return check.valid && check.normalizedDate ? check.normalizedDate : getDefaultReturnDateIso(7);
    });
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const returnDateCheck = validateExpectedReturnDate(expectedReturnDate);
  const showInlineReturnDateError = Boolean(expectedReturnDate) && !returnDateCheck.valid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (quantity < 1 || quantity > item.available_qty) {
      setErrorMsg(`Quantity must be between 1 and ${item.available_qty}`);
      return;
    }

    if (!projectName.trim() || !purpose.trim() || !expectedReturnDate) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    const validatedDate = validateExpectedReturnDate(expectedReturnDate);
    if (!validatedDate.valid || !validatedDate.normalizedDate) {
      setErrorMsg(validatedDate.error || 'Expected return date cannot be in the past.');
      return;
    }

    setLoading(true);
    const res = await submitBorrowRequest({
      itemId: item.id,
      quantity,
      projectName: projectName.trim(),
      purpose: purpose.trim(),
      expectedReturnDate: validatedDate.normalizedDate,
    });

    setLoading(false);

    if (res.success) {
      setConfirmedLoan(true);
    } else {
      setErrorMsg(res.error || 'Failed to submit borrow request.');
    }
  };

  if (confirmedLoan) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
        <PaymentStatus
          type="loan"
          status="success"
          title="Requisition Sent to Admin Portal"
          subtitle={`Requisition for ${quantity}x ${item.name} has been sent to Admin Portal. Hardware will be ready to issue once approved.`}
          amount={`${quantity} item(s)`}
          amountLabel="Requested Units"
          transactionId={`REQ-${Date.now().toString(36).toUpperCase()}`}
          transactionLabel="Requisition Ref"
          paymentMethod={user?.user_metadata?.full_name || profile?.full_name || user?.email || 'Member'}
          paymentMethodLabel="Borrower"
          items={[{ name: item.name, quantity, price: `${quantity}x unit` }]}
          merchantName="CICR Robotics Lab"
          primaryActionLabel="Done"
          onClose={() => {
            setConfirmedLoan(false);
            onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-slate-900/15 overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-purple-950/60 text-blue-600 dark:text-purple-400 border border-blue-200 dark:border-purple-800">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Borrow Equipment Request</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Submit component requisition to CICR Lab Inventory
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Component Card */}
        <div className="my-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#080512] border-2 border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono text-blue-600 dark:text-purple-400 font-bold block">{item.category}</span>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</h4>
            
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500 dark:text-zinc-400 block font-semibold">Available</span>
            <span className="text-xl font-black text-blue-600 dark:text-purple-400">{item.available_qty}</span>
            <span className="text-[10px] text-slate-400 block font-medium">units</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border-2 border-red-500 text-red-900 dark:text-red-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-900 dark:text-zinc-200 mb-1">
                Requested Qty <span className="text-red-600 font-bold">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={item.available_qty}
                required
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white font-bold outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-900 dark:text-zinc-200 mb-1">
                Return Date <span className="text-red-600 font-bold">*</span>
              </label>
              <input
                type="date"
                required
                min={minReturnDate}
                value={expectedReturnDate}
                aria-invalid={showInlineReturnDateError}
                onChange={(e) => {
                  setExpectedReturnDate(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                className={`w-full px-3 py-2 bg-white dark:bg-[#14141c] border-2 rounded-xl text-slate-900 dark:text-white font-bold outline-none ${
                  showInlineReturnDateError
                    ? 'border-red-500 dark:border-rose-500 focus:border-red-600 dark:focus:border-rose-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-rose-500/20'
                    : 'border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100'
                }`}
              />
              {showInlineReturnDateError && (
                <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-rose-400">
                  {returnDateCheck.error}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-900 dark:text-zinc-200 mb-1">
              Project Name <span className="text-red-600 font-bold">*</span>
            </label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Autonomous Maze Rover"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium outline-none transition-all"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-900 dark:text-zinc-200 mb-1">
              Purpose &amp; Technical Scope <span className="text-red-600 font-bold">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Describe how the component will be integrated in your project..."
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium outline-none resize-none transition-all"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-300 dark:border-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white shadow-md shadow-blue-600/25 dark:shadow-purple-950/40 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Submitting...' : 'Dispatch Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
