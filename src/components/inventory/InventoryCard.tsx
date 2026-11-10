import React from 'react';
import { InventoryItem } from '../../types/inventory';
import { StatusBadge } from '../common/Badge';
import { Edit, Trash2, ArrowRightCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface InventoryCardProps {
  item: InventoryItem;
  onSelect: (item: InventoryItem) => void;
  onBorrow: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
}

export const InventoryCard: React.FC<InventoryCardProps> = ({
  item,
  onSelect,
  onBorrow,
  onEdit,
  onDelete,
}) => {
  const { isAdmin } = useAuth();
  const availablePct = Math.round((item.available_qty / (item.total_qty || 1)) * 100);

  return (
    <div className="flex flex-col justify-between rounded-3xl bg-white dark:bg-[#0c0819]/85 border-2 border-slate-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-purple-500 transition-all p-5 group shadow-sm hover:shadow-md space-y-4">
      {/* Top Header Row: Category, Location, and Status Badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-blue-700 dark:text-purple-300 uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-50 dark:bg-purple-950/60 border border-blue-200 dark:border-purple-900/50">
            {item.category}
          </span>
          
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Body info */}
      <div onClick={() => onSelect(item)} className="cursor-pointer space-y-1.5 flex-1">
        <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:text-purple-400 dark:hover:text-purple-400 dark:group-hover:text-purple-400 transition-colors line-clamp-1">
          {item.name}
        </h4>
        <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
          {item.description || 'No detailed description provided for this component.'}
        </p>
      </div>

      {/* Stock status indicator */}
      <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600 dark:text-zinc-400 font-medium">Available Stock:</span>
          <span className="font-bold text-slate-900 dark:text-white">
            <span className={item.available_qty > 0 && item.total_qty > 0 && (item.available_qty / item.total_qty) < 0.5 ? 'text-amber-500 font-black' : 'text-blue-600 dark:text-purple-400 font-black'}>
              {item.available_qty}
            </span>{' '}
            / {item.total_qty}
          </span>
        </div>

        <div className="w-full bg-slate-100 dark:bg-[#16102a] h-1.5 rounded-full overflow-hidden border border-slate-200 dark:border-zinc-800">
          <div
            className={`h-full transition-all duration-300 ${
              availablePct > 40
                ? 'bg-blue-600'
                : availablePct > 15
                ? 'bg-amber-500'
                : 'bg-red-600'
            }`}
            style={{ width: `${availablePct}%` }}
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          {item.datasheet_url ? (
            <a
              href={item.datasheet_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-600 dark:text-purple-400 hover:underline flex items-center gap-1 transition-colors font-medium"
              title="View Datasheet"
            >
              <span>Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : <div />}

          <button
            onClick={() => onSelect(item)}
            className="text-[11px] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors cursor-pointer"
          >
            Details →
          </button>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2">
          <button
            onClick={() => onBorrow(item)}
            disabled={item.available_qty <= 0}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
              item.available_qty > 0
                ? 'bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white shadow-md shadow-blue-600/25 dark:shadow-purple-950/40'
                : 'bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500 border border-slate-200 dark:border-zinc-700'
            }`}
          >
            <ArrowRightCircle className="w-3.5 h-3.5" />
            <span>{item.available_qty > 0 ? 'Borrow Item' : 'Out of Stock'}</span>
          </button>

          {isAdmin && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(item)}
                className="p-2 rounded-xl text-slate-500 hover:text-blue-600 dark:text-purple-400 dark:hover:text-purple-400 hover:bg-blue-50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Edit Item"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Delete Item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
