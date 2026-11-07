import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { isReturnRequested } from '../../types/inventory';
import { motionTransitions } from '../../lib/motion-tokens';
import {
  LayoutGrid,
  Boxes,
  Bell,
  ShieldCheck,
  Code2,
  ChevronDown,
  LogOut,
  Cpu,
  Radio,
  Compass,
  Wrench,
  Zap,
  User,
  Key,
  Bug,
  ExternalLink,
} from 'lucide-react';

export type ActiveView = 'dashboard' | 'inventory' | 'review-requests' | 'logs' | 'developers' | 'profile';

interface BottomNavbarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  onOpenChangePassword?: () => void;
  pendingAccountsCount?: number;
}

export const BottomNavbar: React.FC<BottomNavbarProps> = ({
  activeView,
  setActiveView,
  activeCategory = 'all',
  onSelectCategory,
  onOpenChangePassword = () => {},
  pendingAccountsCount = 0,
}) => {
  const { user, profile, signOut } = useAuth();
  const { requests } = useInventory();

  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const navContainerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isLead = profile?.role === 'lead';
  const roleName = isAdmin ? 'ADMIN' : isLead ? 'LEAD' : 'MEMBER';
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const isLeadOrAdmin = isAdmin || isLead;
  const pendingCount = isLeadOrAdmin
    ? requests.filter((r) => r.status === 'pending' || isReturnRequested(r)).length
    : requests.filter((r) => (r.user_id === user?.id || r.user_email?.toLowerCase() === user?.email?.toLowerCase()) && (r.status === 'pending' || isReturnRequested(r))).length;

  // Dock is expanded when hovered (mouse), opened on tap (mobile), or when any menu is open
  const isExpanded = isHovered || mobileExpanded || submenuOpen || profileMenuOpen;

  // Mouse hover handlers strictly guarded to 'mouse' pointer type (prevents mobile touch from triggering hover leave)
  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 120);
  };

  // Auto-close dropdowns and collapse dock on outside click / tap or page scroll
  useEffect(() => {
    let initialScrollY = typeof window !== 'undefined' ? window.scrollY : 0;

    function handleClickOutside(event: MouseEvent | TouchEvent | PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (navContainerRef.current && navContainerRef.current.contains(target)) {
        return;
      }
      setSubmenuOpen(false);
      setProfileMenuOpen(false);
      setMobileExpanded(false);
      setIsHovered(false);
    }

    function handleScroll() {
      if (typeof window !== 'undefined') {
        const currentScrollY = window.scrollY;
        // Only collapse on genuine page scroll of > 35px (avoiding mobile touch micro-jitter)
        if (Math.abs(currentScrollY - initialScrollY) > 35) {
          if (mobileExpanded || isHovered) {
            setMobileExpanded(false);
            setIsHovered(false);
            setSubmenuOpen(false);
            setProfileMenuOpen(false);
          }
          initialScrollY = currentScrollY;
        }
      }
    }

    document.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [mobileExpanded, isHovered]);

  const getInitial = () => {
    if (displayName) return displayName.charAt(0).toUpperCase();
    return 'U';
  };

  const handleSelectCategory = (key: string) => {
    if (onSelectCategory) {
      onSelectCategory(key);
    }
    setActiveView('inventory');
    setSubmenuOpen(false);
  };

  const categoryItems = [
    { key: 'all', label: 'All Catalog', icon: Boxes },
    { key: 'mcu', label: 'Microcontrollers', icon: Cpu },
    { key: 'sensors', label: 'Sensors', icon: Radio },
    { key: 'actuators', label: 'Actuators', icon: Compass },
    { key: 'power', label: 'Power', icon: Zap },
    { key: 'tools', label: 'Tools', icon: Wrench },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none select-none">
      {/* Docked Centered Floating Navbar with Dynamic Hover Expand & Auto Collapse */}
      <nav className="relative flex flex-col items-center px-2 py-2 sm:p-3 pointer-events-none" ref={navContainerRef}>
        {/* Fluid Morphing Submenu Bar (Centered directly above the navbar dock) */}
        <AnimatePresence>
          {activeView === 'inventory' && submenuOpen && (
            <motion.div
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={motionTransitions.springGentle}
              className="pointer-events-auto mb-2 sm:mb-2.5 flex items-center gap-1 sm:gap-1.5 rounded-full border-2 border-slate-200 dark:border-[#252538] bg-white/95 dark:bg-[#0c0c14]/95 backdrop-blur-2xl p-1 sm:p-1.5 shadow-2xl shadow-slate-900/15 dark:shadow-black z-50 whitespace-nowrap overflow-x-auto max-w-[calc(100vw-1.5rem)] sm:max-w-max no-scrollbar"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {categoryItems.map((cat) => {
                const isSelected = activeCategory === cat.key || (cat.key === 'mcu' && activeCategory === 'microcontrollers');
                const Icon = cat.icon;
                return (
                  <motion.button
                    key={cat.key}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSelectCategory(cat.key)}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? 'text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="easyui-pill-cat-indicator"
                        transition={motionTransitions.springMorph}
                        className="absolute inset-0 rounded-full bg-purple-600 shadow-sm"
                      />
                    )}
                    <Icon className={`relative z-10 w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`} />
                    <span className="relative z-10">{cat.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Expanding/Collapsing Floating Dock Container */}
        <div
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={() => {
            if (!isExpanded) {
              setMobileExpanded(true);
            }
          }}
          className={`pointer-events-auto relative inline-flex items-center justify-center rounded-full bg-white/95 dark:bg-[#0c0c14]/95 backdrop-blur-2xl border-2 border-slate-200/90 dark:border-[#252538] shadow-[0_12px_36px_-6px_rgba(15,23,42,0.18)] dark:shadow-[0_10px_35px_-5px_rgba(0,0,0,0.85)] max-w-[calc(100vw-1rem)] sm:max-w-max transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] select-none will-change-[width,max-width,transform] cursor-pointer ${isExpanded ? "px-2 py-1 sm:px-3 sm:py-1.5 overflow-x-auto no-scrollbar" : "p-1 sm:p-1.5 overflow-visible"}`}
        >
          {/* Main Segmented Pill Tabs */}
          <div role="tablist" className={`flex items-center shrink-0 ${isExpanded ? "gap-0.5 sm:gap-1" : ""}`}>
            {/* 1. Dashboard Tab */}
            <div
              className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded
                  ? 'max-w-[170px] opacity-100 pointer-events-auto scale-100 overflow-hidden'
                  : activeView === 'dashboard'
                  ? 'opacity-100 pointer-events-auto scale-100 overflow-visible'
                  : 'hidden'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'dashboard'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isExpanded) {
                    setMobileExpanded(true);
                    return;
                  }
                  if (activeView === 'dashboard') {
                    setMobileExpanded(false);
                    setIsHovered(false);
                    return;
                  }
                  setActiveView('dashboard');
                  setSubmenuOpen(false);
                  setMobileExpanded(false);
                  setIsHovered(false);
                }}
                className={`relative flex items-center justify-center gap-1 sm:gap-2 ${
                  activeView === 'dashboard'
                    ? 'px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white shadow-none'
                    : 'w-7 h-7 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                } rounded-full text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 whitespace-nowrap select-none active:scale-95`}
              >
                <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className={activeView === 'dashboard' ? 'inline' : 'hidden sm:inline'}>Dashboard</span>
              </button>
            </div>

            {/* 2. Inventory Tab with Submenu Indicator */}
            <div
              className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded
                  ? 'max-w-[180px] opacity-100 pointer-events-auto scale-100 overflow-hidden'
                  : activeView === 'inventory'
                  ? 'opacity-100 pointer-events-auto scale-100 overflow-visible'
                  : 'hidden'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'inventory'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isExpanded) {
                    setMobileExpanded(true);
                    return;
                  }
                  if (activeView === 'inventory') {
                    setSubmenuOpen((prev) => !prev);
                  } else {
                    setActiveView('inventory');
                    setSubmenuOpen(true);
                    setMobileExpanded(false);
                    setIsHovered(false);
                  }
                }}
                className={`relative flex items-center justify-center gap-1 sm:gap-2 ${
                  activeView === 'inventory'
                    ? 'px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white shadow-none'
                    : 'w-7 h-7 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                } rounded-full text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 whitespace-nowrap select-none active:scale-95`}
              >
                <Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className={activeView === 'inventory' ? 'inline' : 'hidden sm:inline'}>Inventory</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 ${
                    activeView === 'inventory' ? 'inline' : 'hidden sm:inline'
                  } ${submenuOpen && activeView === 'inventory' ? 'rotate-180' : 'opacity-70'}`}
                />
              </button>
            </div>

            {/* 3. Requests Tab */}
            <div
              className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded
                  ? 'max-w-[170px] opacity-100 pointer-events-auto scale-100 overflow-hidden'
                  : activeView === 'review-requests'
                  ? 'opacity-100 pointer-events-auto scale-100 overflow-visible'
                  : 'hidden'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'review-requests'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isExpanded) {
                    setMobileExpanded(true);
                    return;
                  }
                  if (activeView === 'review-requests') {
                    setMobileExpanded(false);
                    setIsHovered(false);
                    return;
                  }
                  setActiveView('review-requests');
                  setSubmenuOpen(false);
                  setMobileExpanded(false);
                  setIsHovered(false);
                }}
                className={`relative flex items-center justify-center gap-1 sm:gap-2 ${
                  activeView === 'review-requests'
                    ? 'px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white shadow-none'
                    : 'w-7 h-7 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                } rounded-full text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 whitespace-nowrap select-none active:scale-95`}
              >
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className={activeView === 'review-requests' ? 'inline' : 'hidden sm:inline'}>Requests</span>
                {pendingCount > 0 && (
                  <span
                    className={`px-1 py-0.1 sm:px-1.5 sm:py-0.2 rounded-full font-black text-[9px] sm:text-[10px] ${
                      activeView === 'review-requests'
                        ? 'bg-white text-purple-600'
                        : 'bg-purple-600 text-white'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>

            {/* 4. Management Tab (Admin Only) */}
            {isAdmin && (
              <div
                className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded
                  ? 'max-w-[190px] opacity-100 pointer-events-auto scale-100 overflow-hidden'
                  : activeView === 'logs'
                  ? 'opacity-100 pointer-events-auto scale-100 overflow-visible'
                  : 'hidden'
              }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'logs'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpanded) {
                      setMobileExpanded(true);
                      return;
                    }
                    if (activeView === 'logs') {
                      setMobileExpanded(false);
                      setIsHovered(false);
                      return;
                    }
                    setActiveView('logs');
                    setSubmenuOpen(false);
                    setMobileExpanded(false);
                    setIsHovered(false);
                  }}
                  className={`relative flex items-center justify-center gap-1 sm:gap-2 ${
                    activeView === 'logs'
                      ? 'px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white shadow-none'
                      : 'w-7 h-7 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                  } rounded-full text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 whitespace-nowrap select-none active:scale-95`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className={activeView === 'logs' ? 'inline' : 'hidden sm:inline'}>Management</span>
                  {pendingAccountsCount > 0 && (
                    <span className="px-1 py-0.1 sm:px-1.5 sm:py-0.2 rounded-full bg-red-600 text-white font-black text-[9px] sm:text-[10px] shadow-sm">
                      {pendingAccountsCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* 5. Team (Meet Developers) Tab */}
            <div
              className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded
                  ? 'max-w-[160px] opacity-100 pointer-events-auto scale-100 overflow-hidden'
                  : activeView === 'developers'
                  ? 'opacity-100 pointer-events-auto scale-100 overflow-visible'
                  : 'hidden'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'developers'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isExpanded) {
                    setMobileExpanded(true);
                    return;
                  }
                  if (activeView === 'developers') {
                    setMobileExpanded(false);
                    setIsHovered(false);
                    return;
                  }
                  setActiveView('developers');
                  setSubmenuOpen(false);
                  setMobileExpanded(false);
                  setIsHovered(false);
                }}
                className={`relative flex items-center justify-center gap-1 sm:gap-2 ${
                  activeView === 'developers'
                    ? 'px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white shadow-none'
                    : 'w-7 h-7 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                } rounded-full text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 whitespace-nowrap select-none active:scale-95`}
              >
                <Code2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className={activeView === 'developers' ? 'inline' : 'hidden sm:inline'}>Team</span>
              </button>
            </div>

            {/* 6. Profile Page Tab (if currently active on profile view and collapsed) */}
            {activeView === 'profile' && (
              <div
                className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  !isExpanded
                    ? 'opacity-100 pointer-events-auto scale-100 overflow-visible'
                    : 'hidden'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={true}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpanded) {
                      setMobileExpanded(true);
                    } else {
                      setMobileExpanded(false);
                      setIsHovered(false);
                    }
                  }}
                  className="relative flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer shrink-0 whitespace-nowrap select-none active:scale-95 bg-purple-600 hover:bg-purple-700 text-white shadow-none"
                >
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="inline">Profile</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Section: Divider & User Profile Capsule (Revealed on hover/expand) */}
          <div
            className={`shrink-0 flex items-center transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isExpanded
                ? 'max-w-[280px] opacity-100 pointer-events-auto scale-100 mx-0.5 overflow-hidden'
                : 'hidden'
            }`}
          >
            <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0 pl-0.5 pr-1 sm:pr-1.5 whitespace-nowrap min-w-max select-none">
              {/* Elegant Vertical Divider */}
              <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800 mx-0.5 shrink-0" />

              {/* User Profile Pill with Popover Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileMenuOpen((prev) => !prev);
                    setSubmenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 p-0.5 sm:px-2.5 sm:py-1 rounded-full transition-all duration-200 cursor-pointer border-0 sm:border active:scale-95 ${
                    profileMenuOpen
                      ? 'bg-slate-100 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700'
                      : activeView === 'profile'
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500/50 dark:border-purple-500/50'
                      : 'hover:bg-slate-100 dark:hover:bg-zinc-800/60 border-transparent hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                  title="Account Settings & Quick Actions"
                >
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-xs shrink-0 overflow-hidden shadow-sm">
                    {profile?.avatar_url &&
                    (profile.avatar_url.startsWith('data:image') || profile.avatar_url.startsWith('http')) ? (
                      <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      getInitial()
                    )}
                  </div>
                  <div className="text-left hidden sm:block">
                    <span className="block text-xs font-bold text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                      {displayName}
                    </span>
                    <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider block whitespace-nowrap">
                      {roleName}
                    </span>
                  </div>
                </button>

                {/* Floating Profile Action Menu */}
                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.95 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="absolute bottom-full right-0 mb-3 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-[#0c0c14] border-2 border-slate-300 dark:border-zinc-800 shadow-2xl p-2 z-50 text-slate-900 dark:text-slate-100 select-none overflow-hidden"
                    >
                      {/* Header */}
                      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-zinc-800/80 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            getInitial()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate text-slate-900 dark:text-white">{displayName}</p>
                          <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
                            {roleName}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-1 space-y-0.5 text-xs font-semibold">
                        {/* 1. My Profile Page */}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('profile');
                            setProfileMenuOpen(false);
                            setMobileExpanded(false);
                            setIsHovered(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors text-left cursor-pointer"
                        >
                          <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span>My Profile & Stats</span>
                        </button>

                        {/* 2. Submit Bugs / Feedback Button */}
                        <button
                          type="button"
                          onClick={() => {
                            window.open('https://docs.google.com/forms/d/e/1FAIpQLScF-vaE7NEi-teLfHsB3FkIkW2ggAzRLV3nr7jM0rp1pP5w8g/viewform', '_blank');
                            setProfileMenuOpen(false);
                            setMobileExpanded(false);
                            setIsHovered(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 transition-colors text-left cursor-pointer group"
                          title="Submit Bug or Feedback via Google Form"
                        >
                          <div className="flex items-center gap-2.5">
                            <Bug className="w-4 h-4 text-rose-500" />
                            <span>Submit Bugs / Feedback</span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-slate-400 dark:text-zinc-500 group-hover:text-rose-500 transition-colors" />
                        </button>

                        <div className="h-px bg-slate-200 dark:border-zinc-800/80 my-1" />

                        {/* 4. Sign Out */}
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setMobileExpanded(false);
                            setIsHovered(false);
                            signOut();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors text-left cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sign Out Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  signOut();
                }}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 dark:bg-[#151520] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-90 mr-0.5"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};
