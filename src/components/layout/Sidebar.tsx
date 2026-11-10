import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  History,
  User,
  Database,
  PlusCircle,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenAddItem: () => void;
  onOpenSchemaModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onClose,
  onOpenAddItem,
  onOpenSchemaModal,
}) => {
  const { isAdmin } = useAuth();
  const { requests, items, isLiveDatabase } = useInventory();

  const pendingRequestsCount = requests.filter((r) => r.status === 'pending').length;
  const lowStockCount = items.filter((i) => i.available_qty > 0 && i.total_qty > 0 && (i.available_qty / i.total_qty) < 0.5).length;

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'inventory',
      label: 'Inventory Items',
      icon: <Boxes className="w-4 h-4" />,
      badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    },
    {
      id: 'requests',
      label: 'Borrow Requests',
      icon: <ClipboardList className="w-4 h-4" />,
      badge: pendingRequestsCount > 0 ? `${pendingRequestsCount}` : undefined,
      badgeColor: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    },
    {
      id: 'logs',
      label: 'Activity Logs',
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'profile',
      label: 'My Account',
      icon: <User className="w-4 h-4" />,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed md:sticky top-0 md:top-16 z-50 md:z-30 h-screen md:h-[calc(100vh-4rem)] w-64 bg-[#080512]/95 md:bg-[#080512]/60 backdrop-blur-2xl border-r border-purple-900/30 flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 space-y-6">
          {/* Mobile close button */}
          <div className="flex items-center justify-between md:hidden pb-2 border-b border-purple-900/40">
            <span className="text-sm font-bold text-white">CICR Navigation</span>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-purple-950/40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Action Button with signature purple gradient */}
          {isAdmin && (
            <button
              onClick={() => {
                onOpenAddItem();
                onClose();
              }}
              className="btn-purple-glow w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs shadow-md"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Equipment / Part</span>
            </button>
          )}

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    active
                      ? 'bg-purple-950/60 text-purple-200 border border-purple-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#120e24] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={active ? 'text-purple-400' : 'text-zinc-500'}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Card / Supabase Backend Status */}
        <div className="p-4 border-t border-purple-900/30 space-y-3">
          <div
            onClick={onOpenSchemaModal}
            className="p-3 rounded-xl bg-[#0e0a1c] border border-purple-900/40 hover:border-purple-600/50 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 group-hover:text-purple-300 transition-colors">
                <Database className="w-3.5 h-3.5 text-purple-400" />
                <span>Backend Database</span>
              </div>
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveDatabase ? 'bg-emerald-400 animate-pulse' : 'bg-purple-400 animate-pulse'
                }`}
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {isLiveDatabase ? 'Connected to Supabase' : 'Schema pending • View SQL'}
            </p>
          </div>

          <div className="text-[10px] text-zinc-500 text-center">
            CICR Lab System • JIIT Noida
          </div>
        </div>
      </aside>
    </>
  );
};
