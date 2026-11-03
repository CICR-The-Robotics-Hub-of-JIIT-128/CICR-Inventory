import React, { useState } from 'react';
import { InventoryItem } from '../../types/inventory';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { notifyRequisitionSubmitted } from '../../utils/deviceNotification';
import { DragToConfirm } from '../ui/drag-to-confirm';
import { PaymentStatus, PaymentReceiptItem } from '../ui/payment-status';
import {
  X,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Boxes,
} from 'lucide-react';

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

interface RequestCartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
}

export const RequestCartModal: React.FC<RequestCartModalProps> = ({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const { user, profile } = useAuth();
  const { submitBorrowRequest } = useInventory();
  const { showToast } = useToast();

  const [projectName, setProjectName] = useState('');
  const [purpose, setPurpose] = useState('');
  
  // Default expected return date: 7 days from today
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  const [returnDate, setReturnDate] = useState(defaultDate.toISOString().split('T')[0]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedLoanData, setConfirmedLoanData] = useState<{
    transactionId: string;
    items: PaymentReceiptItem[];
    totalUnits: number;
  } | null>(null);

  if (!isOpen) return null;

  const totalUnits = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  const handleDispatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg('');

    if (cart.length === 0) {
      setErrorMsg('Your hardware cart is empty.');
      return;
    }

    if (!projectName.trim() || !purpose.trim() || !returnDate) {
      setErrorMsg('Please provide a Project Name, Purpose, and Expected Return Date.');
      return;
    }

    setIsSubmitting(true);
    try {
      let failureCount = 0;
      for (const cartItem of cart) {
        const res = await submitBorrowRequest({
          itemId: cartItem.item.id,
          quantity: cartItem.quantity,
          projectName: projectName.trim(),
          purpose: purpose.trim(),
          expectedReturnDate: returnDate,
        });

        if (!res.success) {
          failureCount++;
        }
      }

      if (failureCount === 0) {
        const receiptItems: PaymentReceiptItem[] = cart.map((c) => ({
          name: c.item.name,
          quantity: c.quantity,
          price: `${c.quantity}x unit`,
        }));
        setConfirmedLoanData({
          transactionId: `REQ-${Date.now().toString(36).toUpperCase()}`,
          items: receiptItems,
          totalUnits,
        });
        // Push to device notification panel
        notifyRequisitionSubmitted(totalUnits, projectName.trim());
      } else {
        showToast(
          'warning',
          'Partial Submission',
          `Some items could not be requested. Please check requests queue.`
        );
      }
    } catch {
      setErrorMsg('Failed to dispatch requisition. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (confirmedLoanData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
        <PaymentStatus
          type="loan"
          status="success"
          title="Requisition Sent to Admin Portal"
          subtitle="Your hardware requisition has been routed to the Admin Approval Portal. Hardware can only be issued and collected after an Administrator approves this requisition."
          amount={`${confirmedLoanData.totalUnits} items`}
          amountLabel="Requested Units"
          transactionId={confirmedLoanData.transactionId}
          transactionLabel="Requisition Ref"
          paymentMethod={user?.user_metadata?.full_name || profile?.full_name || user?.email || 'Member'}
          paymentMethodLabel="Borrower"
          items={confirmedLoanData.items}
          merchantName="CICR Robotics Lab"
          primaryActionLabel="Finish & Return to Vault"
          onClose={() => {
            onClearCart();
            setConfirmedLoanData(null);
            onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0f0f14] border-2 border-slate-200 dark:border-[#232330] rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-900/15 text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-purple-950/70 border border-blue-200 dark:border-purple-500/40 text-blue-600 dark:text-purple-400 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Hardware Request Cart</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {cart.length} unique component(s) • {totalUnits} total units staged
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 pr-3 sm:pr-4 space-y-5 modal-scrollbar">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-rose-500/10 border-2 border-red-500 text-red-900 dark:text-rose-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {cart.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-zinc-500 space-y-2">
              <Boxes className="w-10 h-10 text-slate-400 dark:text-zinc-700 mx-auto" />
              <p className="text-slate-900 dark:text-zinc-300 font-bold text-sm">Hardware cart is empty</p>
              <p className="text-slate-500 dark:text-zinc-500">
                Browse the Component Vault and click &quot;+ Add to Cart&quot; to stage equipment for loan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 px-1 font-bold">
                <span>STAGED HARDWARE</span>
                <button
                  type="button"
                  onClick={onClearCart}
                  className="text-red-600 hover:text-red-700 font-bold transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              {cart.map(({ item, quantity }) => (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 font-bold whitespace-nowrap">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-black whitespace-nowrap">
                        {item.available_qty} in Vault
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug break-words">
                      {item.name}
                    </h4>
                  </div>

                  {/* Quantity Stepper & Delete */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center rounded-xl bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-800 p-1 shadow-xs">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.id, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-9 text-center font-black text-slate-900 dark:text-white text-xs sm:text-sm font-mono">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        disabled={quantity >= item.available_qty}
                        onClick={() => onUpdateQuantity(item.id, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
                        title="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer shrink-0"
                      title="Remove from cart"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Loan Details Form */}
              <form onSubmit={handleDispatch} className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-900 dark:text-zinc-200 font-bold mb-1">
                      Project / Competition Name <span className="text-red-600 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="e.g. Autonomous Maze Rover"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white font-medium outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-900 dark:text-zinc-200 font-bold mb-1">
                      Expected Return Date <span className="text-red-600 font-bold">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        required
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white font-medium outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-slate-900 dark:text-zinc-200 font-bold mb-1">
                    Purpose / Technical Scope <span className="text-red-600 font-bold">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Specify project requirements, lab session testing, or breadboard assembly..."
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white font-medium outline-none resize-none transition-all"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 text-xs">
                  <span className="text-slate-500 dark:text-zinc-400 font-bold shrink-0">Borrower Identity</span>
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="text-slate-900 dark:text-white font-bold">
                      {profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Member'}
                    </span>
                    <span className="text-slate-500 dark:text-zinc-400 font-mono text-[11px] truncate">
                      ({user?.email})
                    </span>
                  </div>
                </div>

                <div className="pt-4 flex justify-center items-center w-full">
                  <DragToConfirm
                    size="md"
                    label={isSubmitting ? 'Dispatching Requisition...' : 'Slide to Dispatch Requisition'}
                    confirmedLabel="Requisition Dispatched!"
                    actionType="submit"
                    variant="default"
                    className="w-full max-w-sm mx-auto"
                    disabled={isSubmitting || cart.length === 0}
                    onConfirm={() => {
                      handleDispatch();
                    }}
                  />
                </div>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
