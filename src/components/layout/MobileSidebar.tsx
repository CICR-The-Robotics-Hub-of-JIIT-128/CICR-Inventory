/**
 * Mobile only slide out navigation sidebar drawer matching the repository's classic
 * sidebar layout while preserving all desktop BottomNavbar views, vault categories,
 * badges, operator profile metadata, and sign out controls.
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutGrid,
  Boxes,
  Bell,
  ShieldCheck,
  Code2,
  ChevronDown,
  Bug,
  ExternalLink,
  AlertTriangle,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { CicrLogo } from '../common/CicrLogo';
import { MobileSidebarFooter } from './MobileSidebarFooter';
import {
  ActiveView,
  VAULT_CATEGORY_ITEMS,
  BUG_FEEDBACK_FORM_URL,
  resolveNavigationOperatorMeta,
} from '../../utils/navigationProfile';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  pendingAccountsCount?: number;
  lowReservesCount?: number;
}

interface PrimaryNavItem {
  view: ActiveView;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeAlert?: boolean;
}

/**
 * Renders the mobile slide out navigation drawer below the md breakpoint.
 * Automatically hidden at md and above where the laptop floating dock is active.
 */
export const MobileSidebar: React.FC<MobileSidebarProps> = ({
  isOpen,
  onClose,
  activeView,
  setActiveView,
  activeCategory = 'all',
  onSelectCategory,
  pendingAccountsCount = 0,
  lowReservesCount = 0,
}) => {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { requests } = useInventory();
  const [vaultOpen, setVaultOpen] = useState(true);

  const meta = resolveNavigationOperatorMeta({ user, profile, isAdmin, requests });

  // Close drawer on Escape and prevent background scrolling while drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleNavigate = (view: ActiveView) => {
    setActiveView(view);
    onClose();
  };

  const handleSelectCategory = (categoryKey: string) => {
    if (onSelectCategory) onSelectCategory(categoryKey);
    setActiveView('inventory');
    onClose();
  };

  const primaryItems: PrimaryNavItem[] = [
    { view: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { view: 'inventory', label: 'Inventory Vault', icon: Boxes },
    { view: 'review-requests', label: 'Requests', icon: Bell, badge: meta.pendingCount },
    ...(isAdmin
      ? [{ view: 'logs' as ActiveView, label: 'Management', icon: ShieldCheck, badge: pendingAccountsCount, badgeAlert: true }]
      : []),
    { view: 'developers', label: 'Team', icon: Code2 },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden select-none" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          {/* Translucent Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* Slide In Sidebar Panel */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="fixed inset-y-0 left-0 w-[290px] max-w-[85vw] bg-white dark:bg-[#0c0c14] border-r-2 border-slate-200 dark:border-[#222230] shadow-2xl flex flex-col justify-between overflow-hidden z-10"
          >
            {/* Header Bar */}
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
              <button type="button" onClick={() => handleNavigate('dashboard')} className="flex items-center gap-2.5 text-left cursor-pointer">
                <CicrLogo size={36} className="rounded-xl shrink-0" />
                <div>
                  <span className="block text-sm font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                    CICR Inventory
                  </span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-purple-400">
                    Navigation
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation menu"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Navigation Links */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-5">
              {/* Section 1: Core Workspace */}
              <div className="space-y-1">
                <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  Core Workspace
                </p>
                {primaryItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.view;
                  return (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => handleNavigate(item.view)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-sm font-bold'
                          : 'text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/70 font-semibold'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                            item.badgeAlert
                              ? 'bg-red-600 text-white'
                              : isActive
                              ? 'bg-white text-blue-600 dark:text-purple-600'
                              : 'bg-blue-600 dark:bg-purple-600 text-white'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Section 2: Collapsible Vault Category Filters */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setVaultOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  <span>Vault Categories</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${vaultOpen ? '' : '-rotate-90'}`} />
                </button>

                {vaultOpen && (
                  <div className="space-y-1 pt-0.5">
                    {VAULT_CATEGORY_ITEMS.map((cat) => {
                      const isSelected =
                        activeView === 'inventory' &&
                        (activeCategory === cat.key || (cat.key === 'mcu' && activeCategory === 'microcontrollers'));
                      const Icon = cat.icon;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => handleSelectCategory(cat.key)}
                          className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-purple-950/60 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-500/40 font-bold'
                              : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60 font-medium border border-transparent'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-600 dark:text-purple-400' : 'text-slate-400 dark:text-zinc-500'}`} />
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 3: Alerts & Support */}
              <div className="space-y-1">
                <p className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  Quick Actions
                </p>

                {isAdmin && lowReservesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleNavigate('inventory')}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Low Stock Items</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black">{lowReservesCount}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    window.open(BUG_FEEDBACK_FORM_URL, '_blank');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Bug className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Submit Bugs / Feedback</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                </button>
              </div>
            </div>

            <MobileSidebarFooter
              meta={meta}
              onSignOut={() => {
                onClose();
                signOut();
              }}
            />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
