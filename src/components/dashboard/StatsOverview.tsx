import React from 'react';
import { Boxes, PackageCheck, Clock, AlertTriangle, ArrowUpRight, Plus, Share2 } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';

interface StatsOverviewProps {
  onOpenAddItem: () => void;
  onOpenRequests: () => void;
  onOpenInventory: () => void;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  onOpenAddItem,
  onOpenRequests,
  onOpenInventory,
}) => {
  const { items, requests } = useInventory();
  const { isAdmin } = useAuth();

  const totalTypes = items.length;
  const totalUnits = items.reduce((sum, item) => sum + (item.total_qty || 0), 0);
  const availableUnits = items.reduce((sum, item) => sum + (item.available_qty || 0), 0);
  const borrowedUnits = totalUnits - availableUnits;
  const lowStockItems = items.filter((item) => item.available_qty > 0 && item.total_qty > 0 && (item.available_qty / item.total_qty) < 0.5);
  const pendingRequests = requests.filter((r) => r.status === 'pending');

  const statCards = [
    {
      title: 'Total Components',
      value: totalTypes,
      sub: `${totalUnits} total units in lab`,
      icon: <Boxes className="w-5 h-5 text-purple-300" />,
      color: 'from-purple-950/30 to-[#0e091d] border-purple-900/30 text-purple-300',
      action: onOpenInventory,
    },
    {
      title: 'Available In Stock',
      value: availableUnits,
      sub: `${Math.round((availableUnits / (totalUnits || 1)) * 100)}% inventory readiness`,
      icon: <PackageCheck className="w-5 h-5 text-emerald-400" />,
      color: 'from-emerald-950/20 to-[#0e091d] border-emerald-900/30 text-emerald-400',
      action: onOpenInventory,
    },
    {
      title: 'Active Borrowed',
      value: borrowedUnits,
      sub: `${pendingRequests.length} pending approval requests`,
      icon: <Clock className="w-5 h-5 text-purple-400" />,
      color: 'from-purple-950/20 to-[#0e091d] border-purple-900/30 text-purple-400',
      action: onOpenRequests,
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockItems.length,
      sub: lowStockItems.length > 0 ? 'Requires restocking soon' : 'All stocks healthy',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      color: 'from-amber-950/20 to-[#0e091d] border-amber-900/30 text-amber-400',
      action: onOpenInventory,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner with quick action buttons */}
      <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#110d24] via-[#0d091b] to-[#170e30] border border-purple-900/40 shadow-xl">
        {/* Subtle purple background highlight */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            CICR Inventory & Lab Management
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time tracking of robotics parts, sensors, microcontrollers & workshop tools.
          </p>
        </div>

        <div className="relative flex items-center gap-2.5">
          {isAdmin && (
            <button
              onClick={onOpenAddItem}
              className="btn-purple-glow flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Add Component</span>
            </button>
          )}
          <button
            onClick={onOpenRequests}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#140f26] hover:bg-[#1d1638] text-purple-200 border border-purple-800/50 font-medium text-xs transition-colors"
          >
            <Share2 className="w-4 h-4 text-purple-400" />
            <span>Borrow Queue</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div
            key={i}
            onClick={card.action}
            className={`p-4 rounded-2xl bg-gradient-to-b ${card.color} border hover:border-purple-600/40 transition-all cursor-pointer group shadow-lg`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-400">{card.title}</span>
              <div className="p-2 rounded-xl bg-[#090614] border border-purple-900/40 group-hover:scale-110 transition-transform">
                {card.icon}
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {card.value}
              </span>
              <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-purple-300 transition-colors" />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 font-medium">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
