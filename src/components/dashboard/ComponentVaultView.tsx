import React from 'react';
import { InventoryItem, BorrowRequest } from '../../types/inventory';
import { IOSSearchBar } from '../ui/ios-search-bar';
import {
  Layers,
  Cpu,
  Radar,
  Compass,
  Zap,
  Wrench,
  Boxes,
  Plus,
  ShoppingBag,
  Trash2,
  ExternalLink,
  MapPin,
  Clock,
  AlertTriangle,
  Pencil,
} from 'lucide-react';

interface ComponentVaultViewProps {
  items: InventoryItem[];
  requests: BorrowRequest[];
  isAdmin?: boolean;
  isLeadOrAdmin: boolean;
  currentUserEmail?: string;
  currentUserId?: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  onAddToCart: (item: InventoryItem) => void;
  onOpenAddItem: () => void;
  onEditItem?: (item: InventoryItem) => void;
  onDeleteItem: (id: string, name: string) => void;
  onSelectItem: (item: InventoryItem) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  loading?: boolean;
}

const isLowReserveItem = (i: InventoryItem): boolean => {
  if (i.available_qty <= 0) return false;
  if (i.total_qty <= 0) return false;
  return (i.available_qty / i.total_qty) < 0.5;
};

export const ComponentVaultView: React.FC<ComponentVaultViewProps> = ({
  items,
  requests,
  isAdmin,
  isLeadOrAdmin,
  currentUserEmail,
  currentUserId,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  onAddToCart,
  onOpenAddItem,
  onEditItem,
  onDeleteItem,
  onSelectItem,
  cartCount,
  onOpenCart,
  loading = false,
}) => {
  // Active loans calculation:
  // For administrators: displays active loans across all members.
  // For normal members: strictly personalized to display only their own active checkouts.
  const relevantApprovedRequests = isLeadOrAdmin
    ? requests.filter((r) => r.status === 'approved')
    : requests.filter((r) => {
        if (r.status !== 'approved') return false;
        const matchesEmail = Boolean(currentUserEmail && r.user_email?.toLowerCase() === currentUserEmail.toLowerCase());
        const matchesId = Boolean(currentUserId && r.user_id === currentUserId);
        return matchesEmail || matchesId;
      });

  const activeLoansByItem = relevantApprovedRequests.reduce((acc, curr) => {
    acc[curr.item_id] = (acc[curr.item_id] || 0) + curr.quantity;
    return acc;
  }, {} as Record<string, number>);

  const totalActiveLoansCount = relevantApprovedRequests.length;
  const totalAssetsCount = items.reduce((acc, curr) => acc + curr.total_qty, 0);
  const totalAvailableCount = items.reduce((acc, curr) => acc + curr.available_qty, 0);
  const lowReservesCount = items.filter((i) => isLowReserveItem(i)).length;
  const depletedCount = items.filter((i) => i.available_qty <= 0).length;

  const filteredItems = items.filter((item) => {
    // 1. Category filter
    let matchesCategory = true;
    if (categoryFilter === 'mcu' || categoryFilter === 'microcontrollers') {
      matchesCategory = item.category.toLowerCase().includes('microcontroller') || item.category.toLowerCase().includes('sbc');
    } else if (categoryFilter === 'sensors') {
      matchesCategory = item.category.toLowerCase().includes('sensor');
    } else if (categoryFilter === 'actuators') {
      matchesCategory = item.category.toLowerCase().includes('actuator') || item.category.toLowerCase().includes('motor');
    } else if (categoryFilter === 'power') {
      matchesCategory = item.category.toLowerCase().includes('power') || item.category.toLowerCase().includes('battery');
    } else if (categoryFilter === 'tools') {
      matchesCategory = item.category.toLowerCase().includes('tool') || item.category.toLowerCase().includes('equipment');
    }

    // 2. Status filter
    let matchesStatus = true;
    if (statusFilter === 'available') {
      matchesStatus = item.available_qty > 0;
    } else if (statusFilter === 'loans') {
      matchesStatus = !!activeLoansByItem[item.id];
    } else if (statusFilter === 'low') {
      matchesStatus = isLowReserveItem(item);
    } else if (statusFilter === 'depleted') {
      matchesStatus = item.available_qty <= 0;
    }

    // 3. Search query
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);

    return matchesCategory && matchesStatus && matchesSearch;
  });

  const getItemCategoryLabel = (cat: string) => {
    if (cat.includes('Microcontroller')) return 'MCU / SBC';
    if (cat.includes('Sensor')) return 'SENSORS';
    if (cat.includes('Actuator') || cat.includes('Motor')) return 'ACTUATORS';
    if (cat.includes('Power')) return 'POWER';
    if (cat.includes('Tool')) return 'TOOLS';
    return 'HARDWARE';
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Component Vault
        </h1>
        <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
          Explore laboratory components, inspect real-time capacity, and stage equipment for requisition clearance.
        </p>
      </div>

      {/* Search Bar & Category Filter Tabs */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-[#20202c] space-y-4 shadow-sm">
        <div className="w-full">
          <IOSSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search components by name, category, specs..."
            className="w-full"
            collapsedWidth="100%"
            expandedWidth="100%"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1">
          {[
            { key: 'all', label: 'All', icon: Layers },
            { key: 'mcu', label: 'MCU', icon: Cpu },
            { key: 'sensors', label: 'Sensors', icon: Radar },
            { key: 'actuators', label: 'Actuators', icon: Compass },
            { key: 'power', label: 'Power', icon: Zap },
            { key: 'tools', label: 'Tools', icon: Wrench },
          ].map((cat) => {
            const Icon = cat.icon;
            const active = categoryFilter === cat.key || (cat.key === 'mcu' && categoryFilter === 'microcontrollers');
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategoryFilter(cat.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-blue-600 dark:bg-purple-600 text-white border-2 border-blue-600 dark:border-purple-600 shadow-sm'
                    : 'bg-slate-100 dark:bg-[#14141c] text-slate-700 dark:text-zinc-400 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-800 font-bold'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5 Status Metrics Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Assets */}
        <div
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-2xl bg-white dark:bg-[#0f0f15] border-2 cursor-pointer transition-all shadow-sm ${
            statusFilter === 'all' ? 'border-slate-800 dark:border-zinc-700' : 'border-slate-200 dark:border-[#20202c] hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
            <span>Total Assets</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 font-mono font-bold">
              ALL
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{totalAssetsCount}</div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">In laboratory inventory</p>
        </div>

        {/* Available */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'available' ? 'all' : 'available')}
          className={`p-4 rounded-2xl bg-white dark:bg-[#0f0f15] border-2 cursor-pointer transition-all shadow-sm ${
            statusFilter === 'available'
              ? 'border-blue-600 dark:border-purple-600 bg-blue-50 dark:bg-purple-950/30 text-blue-900 dark:text-white'
              : 'border-slate-200 dark:border-[#20202c] hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
            <span>Available</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 font-mono font-bold">
              FILTER
            </span>
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-emerald-400">{totalAvailableCount}</div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">Ready for checkout</p>
        </div>

        {/* Active Loans */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'loans' ? 'all' : 'loans')}
          className={`p-4 rounded-2xl bg-white dark:bg-[#0f0f15] border-2 cursor-pointer transition-all shadow-sm ${
            statusFilter === 'loans'
              ? 'border-slate-800 bg-slate-100 dark:bg-slate-900'
              : 'border-slate-200 dark:border-[#20202c] hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
            <span>Active Loans</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 font-mono font-bold">
              FILTER
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-cyan-400">{totalActiveLoansCount}</div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">{isLeadOrAdmin ? "Checked out by members" : "Checked out by you"}</p>
        </div>

        {/* Low Reserves */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'low' ? 'all' : 'low')}
          className={`p-4 rounded-2xl bg-white dark:bg-[#0f0f15] border-2 cursor-pointer transition-all shadow-sm ${
            statusFilter === 'low'
              ? 'border-amber-500/60 bg-amber-950/20'
              : 'border-slate-200 dark:border-[#20202c] hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
            <span>Low Reserves</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 font-mono font-bold">
              FILTER
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{lowReservesCount}</div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">Running low</p>
        </div>

        {/* Depleted */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'depleted' ? 'all' : 'depleted')}
          className={`p-4 rounded-2xl bg-white dark:bg-[#0f0f15] border-2 cursor-pointer transition-all col-span-2 sm:col-span-1 shadow-sm ${
            statusFilter === 'depleted'
              ? 'border-red-600 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-white'
              : 'border-slate-200 dark:border-[#20202c] hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 mb-1 text-[11px] font-bold uppercase tracking-wider">
            <span>Depleted</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 font-mono font-bold">
              FILTER
            </span>
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-rose-400">{depletedCount}</div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">0 units in stock</p>
        </div>
      </div>

      {/* Catalog Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Catalog Components
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border-2 border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 font-bold font-mono">
              Showing {filteredItems.length} components
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
            Click component to inspect datasheet or click + Add to Cart to stage for requisition clearance
          </p>
        </div>

        {isLeadOrAdmin && (
          <button
            type="button"
            onClick={onOpenAddItem}
            className="btn-auth-primary flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold cursor-pointer shadow-md self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Component</span>
          </button>
        )}
      </div>

      {/* Component Cards Grid */}
      {loading && filteredItems.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-3xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-[#20202c] flex flex-col justify-between space-y-4 shadow-sm animate-pulse"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 bg-slate-200 dark:bg-zinc-800 rounded-md" />
                  <div className="h-4 w-20 bg-slate-200 dark:bg-zinc-800 rounded-md" />
                </div>
                <div className="h-5 w-3/4 bg-slate-200 dark:bg-zinc-800 rounded-md" />
                <div className="h-3.5 w-full bg-slate-100 dark:bg-zinc-800/60 rounded-md" />
                <div className="h-3.5 w-5/6 bg-slate-100 dark:bg-zinc-800/60 rounded-md" />
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/80 space-y-2">
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-zinc-800 rounded-md" />
                <div className="h-8 w-full bg-slate-200 dark:bg-zinc-800 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center text-xs text-zinc-500 space-y-2 bg-[#0f0f15] border border-zinc-800 rounded-3xl p-8">
          <Boxes className="w-10 h-10 text-zinc-700 mx-auto" />
          <p className="text-zinc-300 font-bold text-sm">No components found</p>
          <p className="text-zinc-500">
            Try adjusting your search query or clear the active category/status filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5">
          {filteredItems.map((item) => {
            const isAvailable = item.available_qty > 0;
            const isLow = isLowReserveItem(item);
            const isDepleted = item.available_qty <= 0;
            const activeLoanCount = activeLoansByItem[item.id] || 0;
            const availabilityRatio =
              item.total_qty > 0 ? (item.available_qty / item.total_qty) * 100 : 0;
            const categoryTag = getItemCategoryLabel(item.category);

            return (
              <div
                key={item.id}
                className="p-5 rounded-3xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-[#20202c] hover:border-blue-500 dark:hover:border-purple-500 transition-all duration-200 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-400 font-mono">
                      {categoryTag}
                    </span>

                    {isDepleted ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-rose-400">
                        <span className="w-2 h-2 rounded-full bg-red-600 dark:bg-rose-500" />
                        <span>Depleted</span>
                      </span>
                    ) : (isAdmin && isLow) ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>Low Reserve</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Available</span>
                      </span>
                    )}
                  </div>

                  <h3
                    onClick={() => onSelectItem(item)}
                    className="font-bold text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors line-clamp-1 cursor-pointer"
                    title={item.name}
                  >
                    {item.name}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 mt-1.5 leading-relaxed">
                    {item.description || 'Standard laboratory hardware component for robotics projects and experimental prototyping.'}
                  </p>

                  {/* Active Loan Banner */}
                  {activeLoanCount > 0 && (
                    <div className="mt-3 p-2 rounded-xl bg-slate-100 dark:bg-[#14141c] border border-slate-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-700 dark:text-zinc-300">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        <span>{activeLoanCount} on active loan</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom specs: Location, Availability & Progress */}
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                    <span className="font-semibold text-purple-400">Stock Availability</span>
                    <span className="font-bold shrink-0">
                      {item.available_qty} / {item.total_qty} units
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isDepleted
                          ? 'bg-red-600 dark:bg-rose-500'
                          : isLow
                          ? 'bg-amber-500'
                          : 'bg-blue-600 dark:bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, availabilityRatio))}%` }}
                    />
                  </div>

                  {/* Card Action Footer */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onAddToCart(item)}
                      disabled={!isAvailable}
                      className="btn-auth-primary flex-1 py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-40"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>+ Add to Cart</span>
                    </button>

                    {isAdmin && onEditItem && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditItem(item);
                        }}
                        className="p-2 rounded-2xl bg-slate-100 hover:bg-purple-100 dark:bg-[#14141c] dark:hover:bg-purple-950/60 text-slate-600 hover:text-purple-700 dark:text-zinc-400 dark:hover:text-purple-300 border border-slate-200 dark:border-zinc-800 transition-colors cursor-pointer"
                        title="Edit Component (Admin Clearance)"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isLeadOrAdmin && (
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item.id, item.name)}
                        className="p-2 rounded-2xl bg-slate-100 dark:bg-[#14141c] hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 border border-slate-200 dark:border-zinc-800 transition-colors cursor-pointer"
                        title="Delete Component"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
