'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import {
  Check,
  AlertCircle,
  RotateCcw,
  Copy,
  Download,
  Receipt,
  Boxes,
  ArrowRight,
  ShieldCheck,
  User,
  Clock,
} from 'lucide-react';
import { cn, copyToClipboard } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

export type PaymentLifecycleStatus =
  | 'processing'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'refunded';

export interface PaymentReceiptItem {
  name: string;
  quantity?: number;
  price?: string | number;
}

export interface PaymentStatusProps {
  /** Current payment/loan status */
  status?: PaymentLifecycleStatus;
  /** Custom heading title (e.g. "Hardware Requisition Approved") */
  title?: string;
  /** Custom subtitle */
  subtitle?: string;
  /** Operation type: 'loan' or 'payment' */
  type?: 'payment' | 'loan';
  /** Formatted count/amount (e.g. "3 items" or "$128.00") */
  amount?: string | number;
  /** Label for amount/units (e.g. "Total Units" or "Total") */
  amountLabel?: string;
  /** Currency code or symbol */
  currency?: string;
  /** Unique transaction reference ID */
  transactionId?: string;
  /** Custom label for transaction ID */
  transactionLabel?: string;
  /** Transaction date */
  date?: string | Date;
  /** Payment method or borrower label */
  paymentMethod?: string;
  /** Custom label for payment method */
  paymentMethodLabel?: string;
  /** Card or account last 4 digits */
  last4?: string;
  /** Custom error message when status is 'failed' */
  errorMessage?: string;
  /** Refund reason or note when status is 'refunded' */
  refundReason?: string;
  /** Itemized summary items for receipt view */
  items?: PaymentReceiptItem[];
  /** Merchant or laboratory name */
  merchantName?: string;
  /** Primary button action label */
  primaryActionLabel?: string;
  /** Close / Finish action */
  onClose?: () => void;
  /** Retry handler */
  onRetry?: () => void;
  /** Custom handler when downloading receipt */
  onDownloadReceipt?: () => void;
  /** Custom handler when viewing receipt */
  onViewReceipt?: () => void;
  /** Custom class name */
  className?: string;
}

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  status = 'success',
  title,
  subtitle,
  type = 'loan',
  amount,
  amountLabel,
  currency = '',
  transactionId = `REQ-${Date.now().toString(36).toUpperCase()}`,
  transactionLabel,
  date = new Date(),
  paymentMethod = 'CICR Member',
  paymentMethodLabel,
  last4,
  errorMessage = "Requisition couldn't be completed. Please check inventory stock.",
  refundReason = 'Hardware returned to laboratory inventory.',
  items = [],
  merchantName = 'CICR Robotics Lab',
  primaryActionLabel = 'Done',
  onClose,
  onRetry,
  onDownloadReceipt,
  onViewReceipt,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [showReceiptDetails, setShowReceiptDetails] = useState(false);

  const isLoan = type === 'loan';

  const defaultTitle = isLoan
    ? status === 'success'
      ? 'Hardware Requisition Dispatched'
      : status === 'processing'
      ? 'Registering Requisition...'
      : status === 'failed'
      ? 'Requisition Could Not Be Completed'
      : 'Hardware Returned'
    : status === 'success'
    ? 'Payment Successful'
    : status === 'processing'
    ? 'Processing Payment'
    : status === 'failed'
    ? "Payment Couldn't Be Completed"
    : 'Payment Refunded';

  const defaultSubtitle = isLoan
    ? status === 'success'
      ? `Your requisition from ${merchantName} has been recorded in the database.`
      : status === 'failed'
      ? errorMessage
      : 'Requisition recorded.'
    : status === 'success'
    ? `Your transaction with ${merchantName} is confirmed.`
    : status === 'failed'
    ? errorMessage
    : refundReason;

  const resolvedAmount =
    amount !== undefined
      ? typeof amount === 'number'
        ? `${currency}${amount}`
        : `${currency}${amount}`
      : `${items.reduce((acc, i) => acc + (i.quantity || 1), 0)} units`;

  const formattedDate =
    date instanceof Date
      ? date.toLocaleDateString('en-GB', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : date;

  const handleCopyId = () => {
    copyToClipboard(transactionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (onDownloadReceipt) {
      onDownloadReceipt();
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5',
      });

      const pageWidth = 148;

      // 1. Top Decorative Brand Bar
      doc.setFillColor(37, 99, 235); // Blue #2563EB
      doc.rect(0, 0, pageWidth, 12, 'F');

      // 2. Organization Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text('CICR ROBOTICS & EMBEDDED SYSTEMS LAB', pageWidth / 2, 22, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(79, 70, 229); // Indigo-600
      doc.text('OFFICIAL HARDWARE REQUISITION GATE PASS', pageWidth / 2, 28, { align: 'center' });

      // Subtle Divider
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.4);
      doc.line(14, 32, pageWidth - 14, 32);

      // 3. Status Badge Box
      doc.setFillColor(240, 253, 244); // Green-50
      doc.setDrawColor(34, 197, 94); // Green-500
      doc.roundedRect(14, 36, pageWidth - 28, 14, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(22, 101, 52); // Green-800
      doc.text('CLEARANCE STATUS: AUTHORIZED & VERIFIED', 20, 44);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(21, 128, 61);
      doc.text(type === 'loan' ? 'Component Loan Issued' : 'Requisition Cleared', pageWidth - 20, 44, { align: 'right' });

      // 4. Requisition Information Block
      doc.setFillColor(248, 250, 252); // Slate-50
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.roundedRect(14, 54, pageWidth - 28, 38, 2, 2, 'FD');

      const leftX = 20;
      const rightX = pageWidth / 2 + 6;
      let curY = 62;

      // Row 1: Pass ID & Date
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text('REQUISITION ID', leftX, curY);
      doc.text('ISSUE DATE & TIME', rightX, curY);

      curY += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text(transactionId, leftX, curY);
      doc.text(formattedDate, rightX, curY);

      // Row 2: Borrower & Total Units
      curY += 9;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('AUTHORIZED BORROWER', leftX, curY);
      doc.text('TOTAL HARDWARE UNITS', rightX, curY);

      curY += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(paymentMethod || 'Authorized Member', leftX, curY);
      doc.text(String(resolvedAmount || '1 Unit'), rightX, curY);

      // 5. Itemized Hardware Table
      curY = 100;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text('ITEMIZED HARDWARE CLEARANCE', 14, curY);

      curY += 4;
      // Table Header Row
      doc.setFillColor(241, 245, 249); // Slate-100
      doc.rect(14, curY, pageWidth - 28, 7, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text('COMPONENT DESCRIPTION', 18, curY + 5);
      doc.text('QTY', pageWidth - 20, curY + 5, { align: 'right' });

      curY += 7;

      // Table Rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      items.forEach((item, idx) => {
        const rowBg = idx % 2 === 0 ? 255 : 250;
        doc.setFillColor(rowBg, rowBg, rowBg);
        doc.rect(14, curY, pageWidth - 28, 8, 'F');

        doc.setDrawColor(241, 245, 249);
        doc.line(14, curY + 8, pageWidth - 14, curY + 8);

        doc.setTextColor(15, 23, 42);
        doc.text(item.name, 18, curY + 5.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text(`${item.quantity || 1} unit(s)`, pageWidth - 20, curY + 5.5, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        curY += 8;
      });

      // 6. Storage Bay & Instructions Box
      curY += 6;
      doc.setFillColor(254, 252, 232); // Amber-50
      doc.setDrawColor(251, 191, 36); // Amber-400
      doc.roundedRect(14, curY, pageWidth - 28, 18, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(180, 83, 9); // Amber-700
      doc.text('LAB DISPATCH & STORAGE BAY LOCATION:', 18, curY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(146, 64, 14);
      doc.text('Main Component Cabinet / Lab 2 Shelf Area', 18, curY + 11);
      doc.text('Please verify component status and return in original condition.', 18, curY + 15);

      // 7. Footer Official Authorization
      curY += 24;
      doc.setDrawColor(203, 213, 225);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(pageWidth - 65, curY, pageWidth - 14, curY);
      doc.setLineDashPattern([], 0);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Authorized Lab Administrator', pageWidth - 14, curY + 4, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('CICR Laboratory Automation Portal - Verified Digital Clearance', 14, curY + 12);

      // Save PDF file
      doc.save(`requisition-${transactionId}.pdf`);
    } catch (err) {
      console.error('Error generating PDF receipt:', err);
      // Fallback in case of unexpected environment issue
      const receiptText = `CICR ROBOTICS LAB / REQUISITION PASS\nRequisition ID: ${transactionId}\nBorrower: ${paymentMethod}\nStatus: ${status}\nItems:\n${items.map((i) => `- ${i.name} (x${i.quantity || 1})`).join('\n')}`;
      const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `requisition-${transactionId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      className={cn(
        'w-full max-w-md mx-auto rounded-3xl border-2 border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c14] p-6 sm:p-7 text-left font-sans shadow-2xl transition-all select-none text-slate-900 dark:text-slate-100',
        className
      )}
    >
      <div className="flex flex-col items-center text-center">
        {/* Status Animated Indicator Badge */}
        <div className="relative mb-5">
          {status === 'processing' && (
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#141414] border border-slate-300 dark:border-zinc-700 flex items-center justify-center relative">
              <motion.div
                className="absolute inset-0 rounded-full border border-blue-500/30 border-t-blue-600 dark:border-purple-500/30 dark:border-t-purple-500"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              />
              <Boxes className="w-5 h-5 text-blue-600 dark:text-purple-400" />
            </div>
          )}

          {status === 'verifying' && (
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#141414] border border-slate-300 dark:border-zinc-700 flex items-center justify-center relative">
              <motion.div
                className="absolute inset-1 rounded-full border border-sky-400/40 border-t-sky-400"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <ShieldCheck className="w-6 h-6 text-sky-500 dark:text-sky-400" />
            </div>
          )}

          {status === 'success' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={motionTransitions.springSnappy}
              className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 relative shadow-lg shadow-emerald-500/10"
            >
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <motion.path
                  d="M20 6L9 17l-5-5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
                />
              </svg>
            </motion.div>
          )}

          {status === 'failed' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={motionTransitions.springSnappy}
              className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-500/40 flex items-center justify-center text-rose-600 dark:text-rose-400"
            >
              <AlertCircle className="w-7 h-7" />
            </motion.div>
          )}

          {status === 'refunded' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={motionTransitions.springSnappy}
              className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#141414] border border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-500 dark:text-zinc-400"
            >
              <RotateCcw className="w-6 h-6" />
            </motion.div>
          )}
        </div>

        {/* Heading and Subtext */}
        <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
          {title || defaultTitle}
        </h3>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 mt-1.5 max-w-xs leading-relaxed">
          {subtitle || defaultSubtitle}
        </p>

        {/* Amount / Units Pill */}
        <div className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-100 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800">
          <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 font-bold">
            {amountLabel || (isLoan ? 'Units' : 'Total')}
          </span>
          <span className="text-xs font-black font-mono text-slate-900 dark:text-white">
            {resolvedAmount}
          </span>
        </div>
      </div>

      {/* Transaction Details Staggered Card */}
      <AnimatePresence mode="wait">
        {(status === 'success' || status === 'refunded') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={motionTransitions.springGentle}
            className="mt-6 pt-5 border-t border-slate-200 dark:border-zinc-800 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600 dark:text-zinc-400 font-medium">
                {transactionLabel || (isLoan ? 'Requisition Ref' : 'Transaction ID')}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex items-center gap-1 font-mono text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 cursor-pointer font-bold"
                title="Copy Reference ID"
              >
                <span>{transactionId.slice(0, 16)}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
              </button>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600 dark:text-zinc-400 font-medium">Date & Time</span>
              <span className="font-mono text-slate-900 dark:text-white font-bold">{formattedDate}</span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600 dark:text-zinc-400 font-medium">
                {paymentMethodLabel || (isLoan ? 'Borrower' : 'Payment Method')}
              </span>
              <span className="text-slate-900 dark:text-white font-bold flex items-center gap-1.5">
                {isLoan ? (
                  <User className="w-3.5 h-3.5 text-blue-600 dark:text-purple-400" />
                ) : (
                  <Boxes className="w-3.5 h-3.5 text-blue-600 dark:text-purple-400" />
                )}
                {paymentMethod} {last4 ? `(•••• ${last4})` : ''}
              </span>
            </div>

            {/* Receipt Actions */}
            <div className="pt-3 mt-1 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReceiptDetails(!showReceiptDetails);
                  onViewReceipt?.();
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                <span>{showReceiptDetails ? 'Hide Items' : 'View Items'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                <span>Download Pass</span>
              </button>
            </div>

            {/* Unfolding Receipt Item Breakdown */}
            <AnimatePresence>
              {showReceiptDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={motionTransitions.springGentle}
                  className="overflow-hidden pt-2 space-y-1.5 bg-slate-50 dark:bg-[#07070c] p-3 rounded-xl border border-slate-200 dark:border-zinc-800"
                >
                  <p className="text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-bold tracking-wider mb-1">
                    Itemized Components
                  </p>
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-slate-700 dark:text-zinc-300">
                      <span className="truncate pr-2">
                        {item.quantity ? `${item.quantity}x ` : ''}
                        {item.name}
                      </span>
                      <span className="font-mono text-slate-900 dark:text-white font-bold shrink-0">{item.price || `${item.quantity || 1} units`}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Primary Action Button (e.g. Done) */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md cursor-pointer"
              >
                <span>{primaryActionLabel}</span>
              </button>
            )}
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={motionTransitions.springGentle}
            className="mt-6 pt-5 border-t border-slate-200 dark:border-zinc-800 space-y-2"
          >
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Close</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
