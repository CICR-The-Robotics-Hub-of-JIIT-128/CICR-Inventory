import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import {
  Bell,
  LayoutGrid,
  Layers,
  Shield,
  ScrollText,
  Cpu,
  Radar,
  Compass,
  Wrench,
  Code2,
  User,
  LogOut,
  ChevronDown,
  X
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'inventory'
  | 'logs'
  | 'review-requests'
  | 'vault-all'
  | 'vault-micro'
  | 'vault-sensors'
  | 'vault-actuators'
  | 'vault-power'
  | 'vault-tools'
  | 'developers'
  | 'profile';

interface AppSidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenChangePassword?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onClose,
  onOpenChangePassword,
}) => {
  const { user, profile, signOut } = useAuth();
  const { requests } = useInventory();

  // Collapsible section state
  const [coreOpen, setCoreOpen] = useState(true);
  const [vaultOpen, setVaultOpen] = useState(true);
  const [miscOpen, setMiscOpen] = useState(true);

  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;

  const handleSelect = (tab: NavTab) => {
    setActiveTab(tab);
    onClose();
  };

  const getInitial = () => {
    const name = profile?.full_name || user?.user_metadata?.full_name || user?.email;
    return name ? name.charAt(0).toUpperCase() : 'M';
  };

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Member';
  const roleName = (
    profile?.role ||
    (user?.email && ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com', '992501030399@mail.jiit.ac.in'].includes(user.email.toLowerCase()) ? 'ADMIN' : 'MEMBER')
  ).toUpperCase();

  const getNavItemClass = (tab: NavTab) => {
    const isActive = activeTab === tab;
    if (isActive) {
      return 'bg-[#1b1915] text-[#f5efe4] border border-[#4a4335] shadow-md font-bold';
    }
    return 'text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#141418] border border-transparent font-medium';
  };

  const getIconClass = (tab: NavTab) => {
    const isActive = activeTab === tab;
    return isActive ? 'text-[#f5efe4]' : 'text-[#858594]';
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 z-50 lg:z-30 h-screen w-72 bg-[#09090b] border-r border-[#17171b] flex flex-col justify-between p-4 transition-transform duration-300 ease-in-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 scrollbar-thin">
          {/* Mobile close button */}
          <div className="flex items-center justify-between lg:hidden pb-1 border-b border-zinc-800">
            <span className="text-xs font-bold text-zinc-400">NAVIGATION</span>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Top Review Request Box */}
          <button
            onClick={() => handleSelect('review-requests')}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left ${
              activeTab === 'review-requests'
                ? 'bg-[#141c19] border border-emerald-500/50 shadow-lg shadow-emerald-950/40'
                : 'bg-[#131316] hover:bg-[#18181d] border border-[#202026]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#10241f] border border-[#1b3d33] flex items-center justify-center text-[#2ee59d] shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-[13px] font-bold text-white tracking-tight">Review Request</h4>
                {pendingRequestsCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#2ee59d] text-black font-extrabold">
                    {pendingRequestsCount}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#7d7d8a] mt-0.5">All User Requests</p>
            </div>
          </button>

          {/* SECTION 1: CORE WORKSPACE */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setCoreOpen(!coreOpen)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#636370] hover:text-[#a0a0b0] transition-colors"
            >
              <span>CORE WORKSPACE</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  coreOpen ? '' : '-rotate-90'
                }`}
              />
            </button>

            {coreOpen && (
              <div className="space-y-1 pt-0.5">
                {/* Dashboard */}
                <button
                  onClick={() => handleSelect('dashboard')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'dashboard'
                  )}`}
                >
                  <LayoutGrid className={`w-4 h-4 ${getIconClass('dashboard')}`} />
                  <span>Dashboard</span>
                </button>

                {/* Inventory */}
                <button
                  onClick={() => handleSelect('inventory')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'inventory'
                  )}`}
                >
                  <Layers className={`w-4 h-4 ${getIconClass('inventory')}`} />
                  <span>Inventory</span>
                </button>

                {/* Management & Logs (Admin Only) */}
                <button
                  onClick={() => handleSelect('logs')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'logs'
                  )}`}
                >
                  <ScrollText className={`w-4 h-4 ${getIconClass('logs')}`} />
                  <span>Management & Logs</span>
                </button>
              </div>
            )}
          </div>

          {/* SECTION 2: VAULT INDEX */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setVaultOpen(!vaultOpen)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#636370] hover:text-[#a0a0b0] transition-colors"
            >
              <span>VAULT INDEX</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  vaultOpen ? '' : '-rotate-90'
                }`}
              />
            </button>

            {vaultOpen && (
              <div className="space-y-1 pt-0.5">
                {/* All Assets (Teal/Emerald Accent in Screenshot) */}
                <button
                  onClick={() => handleSelect('vault-all')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${
                    activeTab === 'vault-all'
                      ? 'bg-[#11231f] text-[#2ee59d] border border-emerald-500/40 font-bold'
                      : 'text-[#2dd4bf] hover:text-[#5eead4] hover:bg-[#121c19] border border-transparent font-semibold'
                  }`}
                >
                  <Layers className="w-4 h-4 text-[#2dd4bf]" />
                  <span>All Assets</span>
                </button>

                {/* Micro */}
                <button
                  onClick={() => handleSelect('vault-micro')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'vault-micro'
                  )}`}
                >
                  <Cpu className={`w-4 h-4 ${getIconClass('vault-micro')}`} />
                  <span>Micro</span>
                </button>

                {/* Sensors */}
                <button
                  onClick={() => handleSelect('vault-sensors')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'vault-sensors'
                  )}`}
                >
                  <Radar className={`w-4 h-4 ${getIconClass('vault-sensors')}`} />
                  <span>Sensors</span>
                </button>

                {/* Actuators */}
                <button
                  onClick={() => handleSelect('vault-actuators')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'vault-actuators'
                  )}`}
                >
                  <Compass className={`w-4 h-4 ${getIconClass('vault-actuators')}`} />
                  <span>Actuators</span>
                </button>

                {/* Power */}
                <button
                  onClick={() => handleSelect('vault-power')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'vault-power'
                  )}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-4 h-4 shrink-0 ${getIconClass('vault-power')}`}
                  >
                    <path d="M4 7V4h4" />
                    <path d="M4 17v3h4" />
                    <path d="M20 7V4h-4" />
                    <path d="M20 17v3h-4" />
                    <polygon points="13 2 7 13 12 13 11 22 17 11 12 11 13 2" />
                  </svg>
                  <span>Power</span>
                </button>

                {/* Tools */}
                <button
                  onClick={() => handleSelect('vault-tools')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'vault-tools'
                  )}`}
                >
                  <Wrench className={`w-4 h-4 ${getIconClass('vault-tools')}`} />
                  <span>Tools</span>
                </button>
              </div>
            )}
          </div>

          {/* SECTION 3: MISCELLANEOUS */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setMiscOpen(!miscOpen)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#636370] hover:text-[#a0a0b0] transition-colors"
            >
              <span>MISCELLANEOUS</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  miscOpen ? '' : '-rotate-90'
                }`}
              />
            </button>

            {miscOpen && (
              <div className="space-y-1 pt-0.5">
                {/* Meet The Developers */}
                <button
                  onClick={() => handleSelect('developers')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'developers'
                  )}`}
                >
                  <Code2 className={`w-4 h-4 ${getIconClass('developers')}`} />
                  <span>Meet The Developers</span>
                </button>

                {/* My Profile */}
                <button
                  onClick={() => handleSelect('profile')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13px] transition-all ${getNavItemClass(
                    'profile'
                  )}`}
                >
                  <User className={`w-4 h-4 ${getIconClass('profile')}`} />
                  <span>My Profile</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM USER PROFILE CARD (Matching Screenshot Exactly) */}
        <div className="pt-3 border-t border-[#17171b]">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#121215] border border-[#202026]">
            {/* Avatar & Name */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#152320] border border-[#1f3830] text-white flex items-center justify-center font-bold text-sm shrink-0">
                {getInitial()}
              </div>
              <div className="min-w-0">
                <h5 className="text-[13px] font-bold text-white truncate max-w-[95px]">
                  {displayName}
                </h5>
                <span className="inline-block text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#1e1e24] text-zinc-300 border border-[#2e2e38] tracking-wider mt-0.5">
                  {roleName}
                </span>
              </div>
            </div>

            {/* Action Buttons: SignOut */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* SignOut button */}
              <button
                type="button"
                onClick={() => signOut()}
                className="w-8 h-8 rounded-xl bg-[#22222a] hover:bg-rose-500/20 hover:text-rose-400 border border-[#32323e] text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
