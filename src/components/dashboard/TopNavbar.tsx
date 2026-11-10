import React from 'react';
import { CicrLogo } from '../common/CicrLogo';
import { NotificationBell, Notification } from '../ui/notification-bell';
import { LiquidToggle } from '../ui/liquid-toggle';
import { ActiveView } from '../layout/BottomNavbar';
import { AlertTriangle, Menu, ShoppingBag } from 'lucide-react';

interface TopNavbarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isAdmin?: boolean;
  isLeadOrAdmin: boolean;
  cartCount?: number;
  onOpenCart?: () => void;
  notifications: Notification[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onClearNotifications: () => void;
  onDismissNotification?: (id: string) => void;
  lowReservesCount: number;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
  mobileBadgeCount?: number;
}

/**
 * Top navigation header rendering a full width bar with a sidebar hamburger toggle
 * on mobile (< md) and the floating capsule header at md and above for laptop viewports.
 */
export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeView,
  setActiveView,
  isAdmin,
  isLeadOrAdmin: _isLeadOrAdmin,
  cartCount,
  onOpenCart,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearNotifications,
  onDismissNotification,
  lowReservesCount,
  isMobileMenuOpen = false,
  onToggleMobileMenu,
  mobileBadgeCount = 0,
}) => {
  const getBreadcrumbLabel = () => {
    switch (activeView) {
      case 'dashboard':
        return 'DASHBOARD';
      case 'inventory':
        return 'COMPONENT VAULT';
      case 'review-requests':
        return isAdmin ? 'CLEARANCE PORTAL' : 'MY REQUISITIONS';
      case 'logs':
        return 'MANAGEMENT HUB';
      case 'developers':
        return 'MEET DEVELOPERS';
      default:
        return 'DASHBOARD';
    }
  };

  return (
    <div className="fixed top-0 md:top-3 inset-x-0 z-40 md:z-50 max-w-[1720px] w-full mx-auto px-0 md:px-6 lg:px-8 xl:px-10 pointer-events-none">
      <header className="pointer-events-auto rounded-none border-x-0 border-t-0 border-b-2 md:rounded-full md:border-2 bg-white/95 dark:bg-[#0f0f16]/95 backdrop-blur-2xl border-slate-200 dark:border-[#222230] px-3 sm:px-6 py-2 flex items-center justify-between shadow-md md:shadow-xl shadow-slate-900/5 dark:shadow-2xl dark:shadow-black/80 gap-2">
        {/* Left: Mobile Sidebar Toggle + Laptop CICR Logo + Breadcrumbs Capsule */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileMenuOpen}
              className="relative md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#151520] hover:bg-slate-200 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors shrink-0 cursor-pointer active:scale-95"
            >
              <Menu className="w-5 h-5" />
              {mobileBadgeCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-purple-500 ring-2 ring-white dark:ring-[#0f0f16]"
                />
              )}
            </button>
          )}

          {/* Laptop/Desktop Brand Button (hidden on mobile; mobile displays the CICR logo inside MobileSidebar) */}
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="hidden md:flex items-center gap-2.5 cursor-pointer group shrink-0 focus-visible:outline-none"
            title="CICR Inventory Dashboard"
          >
            <CicrLogo size={42} className="rounded-2xl shadow-sm group-hover:scale-105 transition-transform shrink-0" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-xs sm:text-sm font-black tracking-tight text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors">
                CICR Inventory
              </span>
            </div>
          </button>

          {/* Breadcrumb Capsule */}
          <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full bg-slate-100 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-bold text-slate-600 dark:text-zinc-400 min-w-0">
            <span
              className="hidden sm:inline text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
              onClick={() => setActiveView('dashboard')}
            >
              HOME
            </span>
            <span className="hidden sm:inline text-zinc-600 dark:text-zinc-600 font-mono">/</span>
            <span className="text-blue-600 dark:text-purple-400 font-extrabold uppercase tracking-wide truncate max-w-[140px] sm:max-w-[200px] md:max-w-none">
              {getBreadcrumbLabel()}
            </span>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Low Reserves Warning Pill (clickable to filter low reserves in vault) */}
          {isAdmin && lowReservesCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveView('inventory')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold transition-all cursor-pointer animate-pulse shrink-0"
              title={`${lowReservesCount} items running low on reserves`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{lowReservesCount} Low</span>
            </button>
          )}

          {/* Cart Button: Visible strictly and only on the inventory page */}
          {activeView === 'inventory' && onOpenCart && (
            <button
              type="button"
              onClick={onOpenCart}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
              title={`View Hardware Cart (${cartCount ?? 0} items)`}
              aria-label="View hardware requisition cart"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cart</span>
              {(cartCount ?? 0) > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-white font-mono font-black text-[10px]">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          {/* Notification Bell */}
          <NotificationBell
            notifications={notifications}
            onMarkAsRead={onMarkNotificationRead}
            onMarkAllAsRead={onMarkAllNotificationsRead}
            onClearAll={onClearNotifications}
            onDismiss={onDismissNotification}
          />

          {/* Liquid Theme Switcher */}
          <LiquidToggle className="flex shrink-0" />
        </div>
      </header>
    </div>
  );
};
