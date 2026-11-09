import React, { useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { parseAuditLog, AuditBadgeVariant } from '../../lib/audit';
import {
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  XCircle,
  Clock,
  FileEdit,
  Trash2,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
  UserCheck,
} from 'lucide-react';

export const RecentActivity: React.FC = () => {
  const { logs, items, requests } = useInventory();

  const parsedLogs = useMemo(() => {
    const now = Date.now();
    return logs.slice(0, 10).map((log) => parseAuditLog(log, undefined, items, now, requests));
  }, [logs, items, requests]);

  const getActionBadge = (variant: AuditBadgeVariant) => {
    switch (variant) {
      case 'item_created':
        return {
          icon: <PlusCircle className="w-4 h-4 text-emerald-400" />,
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'item_edited':
        return {
          icon: <FileEdit className="w-4 h-4 text-purple-300" />,
          color: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
        };
      case 'item_deleted':
        return {
          icon: <Trash2 className="w-4 h-4 text-rose-400" />,
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      case 'borrow_request':
        return {
          icon: <Clock className="w-4 h-4 text-blue-400" />,
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
      case 'borrow_approved':
      case 'account_approved':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        };
      case 'borrow_rejected':
      case 'account_rejected':
      case 'return_declined':
        return {
          icon: <XCircle className="w-4 h-4 text-rose-400" />,
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      case 'return_request':
      case 'return_cleared':
        return {
          icon: <RefreshCw className="w-4 h-4 text-teal-400" />,
          color: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
        };
      case 'role_updated':
        return {
          icon: <ShieldCheck className="w-4 h-4 text-amber-400" />,
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'profile_updated':
        return {
          icon: <UserCheck className="w-4 h-4 text-violet-400" />,
          color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
        };
      case 'account_request':
        return {
          icon: <UserPlus className="w-4 h-4 text-indigo-400" />,
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        };
      case 'signout':
        return {
          icon: <LogOut className="w-4 h-4 text-zinc-400" />,
          color: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        };
      default:
        return {
          icon: <LogIn className="w-4 h-4 text-cyan-400" />,
          color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
        };
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-[#0c0819]/80 border border-purple-900/30 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Lab Activity &amp; Audit Trail</h3>
          <p className="text-xs text-zinc-400">Chronological history of club items, accounts &amp; requisitions</p>
        </div>
        <span className="text-xs text-zinc-500">{logs.length} logged events</span>
      </div>

      <div className="divide-y divide-purple-950/60 max-h-96 overflow-y-auto">
        {parsedLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">No activity recorded yet.</div>
        ) : (
          parsedLogs.map((entry) => {
            const badge = getActionBadge(entry.badgeVariant);
            const isSession = entry.badgeVariant === 'signin' || entry.badgeVariant === 'signout';
            return (
              <div key={entry.id} className="py-3 flex items-start gap-3 group">
                <div className={`p-1.5 rounded-xl border shrink-0 mt-0.5 ${badge.color}`}>
                  {badge.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-zinc-200 truncate">
                        {entry.actor.name}
                      </span>
                      {!isSession && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                          {entry.actor.role}
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-mono text-zinc-500 whitespace-nowrap shrink-0"
                      title={entry.when.fullLocal}
                    >
                      {entry.when.dateStr}, {entry.when.timeStr.slice(0, 5)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{entry.summary}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
