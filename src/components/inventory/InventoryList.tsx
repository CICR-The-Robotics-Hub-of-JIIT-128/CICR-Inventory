import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../../types/inventory';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { InventoryFilters } from './InventoryFilters';
import { InventoryCard } from './InventoryCard';
import { StatusBadge } from '../common/Badge';
import { Boxes, Plus, Edit, Trash2, ArrowRightCircle, ExternalLink, MapPin } from 'lucide-react';

interface InventoryListProps {
  onSelectItem: (item: InventoryItem) => void;
  onBorrowItem: (item: InventoryItem) => void;
  onEditItem: (item: InventoryItem) => void;
  onOpenAddItem: () => void;
  preselectedCategory?: string;
}

export const InventoryList: React.FC<InventoryListProps> = ({
  onSelectItem,
  onBorrowItem,
  onEditItem,
  onOpenAddItem,
  preselectedCategory = 'All Categories',
}) => {
  const { items, deleteItem } = useInventory();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(preselectedCategory);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'available_qty' | 'created_at'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesSearch =
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.description?.toLowerCase().includes(search.toLowerCase());

        const matchesCat =
          selectedCategory === 'All Categories' || item.category === selectedCategory;

        const matchesStatus =
          selectedStatus === 'All' || item.status === selectedStatus;

        return matchesSearch && matchesCat && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'available_qty') return b.available_qty - a.available_qty;
        if (sortBy === 'created_at') {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        return 0;
      });
  }, [items, search, selectedCategory, selectedStatus, sortBy]);

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (window.confirm(`Are you sure you want to delete "${item.name}" from inventory?`)) {
      const res = await deleteItem(id);
      if (res.success) {
        showToast('info', 'Item Removed', `"${item.name}" was deleted from inventory.`);
      } else {
        showToast('error', 'Delete Failed', res.error);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <InventoryFilters
        search={search}
        setSearch={setSearch}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        sortBy={sortBy}
        setSortBy={setSortBy}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* Results Count & Action Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <div>
          Showing <span className="font-bold text-white">{filteredItems.length}</span> of {items.length} club items
        </div>

        {isAdmin && (
          <button
            onClick={onOpenAddItem}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors font-medium text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Equipment</span>
          </button>
        )}
      </div>

      {/* Content Rendering: Empty State, Grid, or Table */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900/40 border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Boxes className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white">No items found</h4>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            No equipment matches your current filters. Try resetting your search query or category filter.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedCategory('All Categories');
              setSelectedStatus('All');
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onSelect={onSelectItem}
              onBorrow={onBorrowItem}
              onEdit={onEditItem}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-lg shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">Category</th>
                                    <th className="py-3 px-4">Available / Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3.5 px-4">
                      <div
                        onClick={() => onSelectItem(item)}
                        className="cursor-pointer"
                      >
                        <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                          {item.name}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 truncate max-w-[140px]">
                      {item.category}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate max-w-[120px]">{item.location}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white">
                        <span
                          className={
                            item.available_qty > 0 && item.total_qty > 0 && (item.available_qty / item.total_qty) < 0.5
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {item.available_qty}
                        </span>{' '}
                        / {item.total_qty}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onBorrowItem(item)}
                          disabled={item.available_qty <= 0}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600/15 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 font-medium text-xs transition-colors disabled:opacity-40"
                          title="Borrow Item"
                        >
                          Borrow
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              onClick={() => onEditItem(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

