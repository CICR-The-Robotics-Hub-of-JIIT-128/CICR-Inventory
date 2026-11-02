'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  X,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

export interface Notification {
  id: string;
  title?: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date | string;
  read: boolean;
  action?: () => void;
}

export interface NotificationBellProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onClearAll?: () => void;
  onDismiss?: (id: string) => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  showCount?: boolean;
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onDismiss,
  isOpen: controlledIsOpen,
  onOpenChange,
  showCount = true,
  className,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all');
  const [isShaking, setIsShaking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isPanelOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setPanelOpen = useCallback(
    (open: boolean) => {
      if (onOpenChange) onOpenChange(open);
      else setInternalIsOpen(open);
    },
    [onOpenChange]
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const prevCountRef = useRef(unreadCount);

  // Trigger subtle bell shake when new unread notifications arrive
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 600);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // Click & touch outside listener for mobile and desktop
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanelOpen(false);
      }
    };

    if (isPanelOpen) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleOutside);
        document.removeEventListener('touchstart', handleOutside);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isPanelOpen, setPanelOpen]);

  const filteredNotifications = useMemo(() => {
    if (filterTab === 'unread') {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [notifications, filterTab]);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      {/* Bell Trigger Button */}
      <motion.button
        type="button"
        onClick={() => setPanelOpen(!isPanelOpen)}
        animate={
          isShaking
            ? {
                rotate: [0, -12, 10, -8, 6, -2, 0],
              }
            : {}
        }
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-expanded={isPanelOpen}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : 'Notifications'
        }
        className={cn(
          'relative p-2 sm:p-2.5 rounded-full border-2 transition-all focus-visible:outline-none cursor-pointer',
          isPanelOpen
            ? 'bg-blue-50 border-blue-600 dark:border-purple-600 text-blue-600 dark:text-purple-400 dark:bg-purple-950/60 dark:border-purple-500 dark:text-purple-300 shadow-md shadow-blue-500/20 dark:shadow-purple-900/30'
            : 'bg-slate-100 dark:bg-[#151520] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-700'
        )}
      >
        <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />

        {/* Unread Badge / Count Indicator */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={motionTransitions.springSnappy}
              className={cn(
                'absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-600 text-white font-mono font-black border-2 border-white dark:border-[#0f0f16] shadow-sm',
                showCount
                  ? 'min-w-[18px] h-[18px] px-1 text-[10px]'
                  : 'w-2.5 h-2.5'
              )}
            >
              {showCount && (unreadCount > 99 ? '99+' : unreadCount)}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Floating Notification Panel & Mobile Backdrop */}
      <AnimatePresence>
        {isPanelOpen && (
          <>
            {/* Mobile Touch Backdrop */}
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setPanelOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 sm:hidden pointer-events-auto"
              aria-hidden="true"
            />

            {/* Notification Dropdown Container */}
            <motion.div
              key="notification-panel"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={motionTransitions.springSnappy}
              className={cn(
                // Mobile Viewport Centering & Clamping
                "fixed top-[4.5rem] inset-x-2.5 mx-auto w-[calc(100vw-1.25rem)] max-w-sm sm:max-w-none",
                // Desktop Viewport Anchor & Dimensions
                "sm:absolute sm:top-full sm:inset-x-auto sm:right-0 sm:left-auto sm:translate-x-0 sm:mt-2.5 sm:w-[410px]",
                // Theme, Border, Blur, Shadow, Radius
                "rounded-3xl bg-white/95 dark:bg-[#0c0c14]/95 backdrop-blur-2xl border-2 border-slate-200/90 dark:border-[#252538]",
                "shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]",
                "z-50 overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col pointer-events-auto max-h-[calc(100vh-6.5rem)] sm:max-h-[580px]"
              )}
            >
              {/* Header: Title, Unread Count & Action Controls */}
              <div className="flex items-center justify-between px-4 py-3 sm:px-4.5 sm:py-3.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-[#101018]/80 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-blue-100 dark:bg-purple-950/60 text-blue-600 dark:text-purple-400 shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 text-[10px] font-mono font-bold animate-pulse">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                </div>

                {/* Top Quick Actions: Read All, Clear, Close */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {unreadCount > 0 && onMarkAllAsRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAllAsRead();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-blue-50 dark:hover:bg-purple-950/50 transition-colors cursor-pointer"
                      title="Mark all notifications as read"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">Read all</span>
                    </button>
                  )}

                  {notifications.length > 0 && onClearAll && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClearAll();
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 p-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer relative z-20 shrink-0"
                      title="Clear all notifications"
                      aria-label="Clear all notifications"
                    >
                      <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    aria-label="Close notifications"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Filter Tabs: All vs Unread */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c14] shrink-0 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={cn(
                    "relative px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer",
                    filterTab === 'all'
                      ? "text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  )}
                >
                  {filterTab === 'all' && (
                    <motion.span
                      layoutId="notif-tab-indicator"
                      transition={motionTransitions.springMorph}
                      className="absolute inset-0 rounded-full bg-blue-600 dark:bg-purple-600 shadow-sm"
                    />
                  )}
                  <span className="relative z-10">All ({notifications.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('unread')}
                  className={cn(
                    "relative px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer",
                    filterTab === 'unread'
                      ? "text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                  )}
                >
                  {filterTab === 'unread' && (
                    <motion.span
                      layoutId="notif-tab-indicator"
                      transition={motionTransitions.springMorph}
                      className="absolute inset-0 rounded-full bg-blue-600 dark:bg-purple-600 shadow-sm"
                    />
                  )}
                  <span className="relative z-10">Unread ({unreadCount})</span>
                </button>
              </div>

              {/* Scrollable Notification List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80 bg-white dark:bg-[#07070a] overscroll-contain">
                {filteredNotifications.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto mb-3 shadow-sm">
                      {filterTab === 'unread' ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      ) : (
                        <Bell className="w-6 h-6" />
                      )}
                    </div>
                    <h4 className="text-xs font-extrabold text-slate-800 dark:text-zinc-200">
                      {filterTab === 'unread' ? "You're all caught up!" : "No notifications right now"}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                      {filterTab === 'unread'
                        ? "There are no unread notifications waiting for your review."
                        : "All hardware requisitions, reservations, and inventory alerts are in order."}
                    </p>
                    {filterTab === 'unread' && notifications.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterTab('all')}
                        className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        <span>View All Notifications</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredNotifications.map((item) => {
                    const dateString =
                      typeof item.timestamp === 'string'
                        ? item.timestamp
                        : item.timestamp instanceof Date
                        ? item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Just now';

                    const typeColor =
                      item.type === 'warning'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : item.type === 'error'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                        : item.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-blue-500/10 text-blue-600 dark:text-purple-400 border-blue-500/30';

                    const TypeIcon =
                      item.type === 'warning'
                        ? AlertTriangle
                        : item.type === 'error'
                        ? AlertCircle
                        : item.type === 'success'
                        ? CheckCircle2
                        : Info;

                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={motionTransitions.springGentle}
                        onClick={() => {
                          if (!item.read) onMarkAsRead(item.id);
                          if (item.action) {
                            item.action();
                            setPanelOpen(false);
                          }
                        }}
                        className={cn(
                          "group relative p-3.5 sm:p-4 flex items-start gap-3 transition-all cursor-pointer text-xs",
                          item.read
                            ? "bg-white dark:bg-[#07070a] hover:bg-slate-50 dark:hover:bg-[#101018]"
                            : "bg-blue-50/70 dark:bg-[#140e24] hover:bg-blue-100/80 dark:hover:bg-[#1a1230]"
                        )}
                      >
                        {/* Left Type Icon Capsule */}
                        <div className={cn("p-2 rounded-xl border shrink-0 mt-0.5", typeColor)}>
                          <TypeIcon className="w-3.5 h-3.5" />
                        </div>

                        {/* Middle Content: Title, Message, Date & Action */}
                        <div className="flex-1 min-w-0">
                          {item.title && (
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {!item.read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0 animate-pulse" />
                              )}
                              <h5 className={cn(
                                "text-xs leading-snug truncate",
                                item.read
                                  ? "font-semibold text-slate-800 dark:text-zinc-200"
                                  : "font-extrabold text-blue-600 dark:text-purple-400"
                              )}>
                                {item.title}
                              </h5>
                            </div>
                          )}

                          <p className={cn(
                            "text-[11px] sm:text-xs leading-relaxed",
                            item.read
                              ? "text-slate-600 dark:text-zinc-400 font-normal"
                              : "text-slate-900 dark:text-zinc-100 font-semibold"
                          )}>
                            {item.message}
                          </p>

                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                              {dateString}
                            </span>

                            {item.action && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform">
                                <span>Open View</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right Item Actions: Mark Read & Dismiss */}
                        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          {!item.read && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMarkAsRead(item.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:text-zinc-500 dark:hover:text-purple-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Mark as read"
                              aria-label="Mark notification as read"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {onDismiss && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDismiss(item.id);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              className="p-2 -mr-1 rounded-lg text-slate-400 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer relative z-20 shrink-0"
                              title="Dismiss notification"
                              aria-label="Dismiss notification"
                            >
                              <X className="w-3.5 h-3.5 pointer-events-none" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
