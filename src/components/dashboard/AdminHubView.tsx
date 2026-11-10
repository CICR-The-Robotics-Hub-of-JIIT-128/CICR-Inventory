import React, { useState, useMemo } from 'react';
import { IOSSearchBar } from '../ui/ios-search-bar';
import { BorrowRequest, InventoryItem } from '../../types/inventory';
import { parseAuditLog, ParsedAuditEntry, AuditBadgeVariant } from '../../lib/audit';
import { hydrateMemberIdentity } from '../../lib/identity';
import {
  ScrollText,
  Users,
  Activity,
  UserCheck,
  Boxes,
  Search,
  X,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Pencil,
  LogIn,
  LogOut,
  UserPlus,
  ShoppingBag,
  Plus,
  Trash2,
  ShieldCheck,
  Shield,
  RefreshCw,
  ArrowRight,
  User,
  Layers,
} from 'lucide-react';

interface AdminHubViewProps {
  isAdmin: boolean;
  currentUserId?: string;
  logs: any[];
  items?: InventoryItem[];
  requests: BorrowRequest[];
  allMembers: any[];
  loadingMembers: boolean;
  pendingAccounts: any[];
  processingUserId: string | null;
  onPromoteRole: (userId: string, newRole: 'admin' | 'member', name: string) => void;
  onApproveAccount: (userId: string, name: string, email?: string) => void;
  onRejectAccount: (userId: string, name: string, email?: string) => void;
  onRefresh: () => void;
}

const getAuditBadgeStyle = (variant: AuditBadgeVariant) => {
  switch (variant) {
    case 'signin':
      return {
        badgeClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/35',
        Icon: LogIn,
      };
    case 'signout':
      return {
        badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/35',
        Icon: LogOut,
      };
    case 'account_request':
      return {
        badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/35',
        Icon: UserPlus,
      };
    case 'account_approved':
      return {
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
        Icon: CheckCircle2,
      };
    case 'account_rejected':
      return {
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
        Icon: XCircle,
      };
    case 'role_updated':
      return {
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
        Icon: ShieldCheck,
      };
    case 'profile_updated':
      return {
        badgeClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40',
        Icon: UserCheck,
      };
    case 'borrow_request':
      return {
        badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40',
        Icon: ShoppingBag,
      };
    case 'borrow_approved':
      return {
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
        Icon: CheckCircle2,
      };
    case 'borrow_rejected':
      return {
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
        Icon: XCircle,
      };
    case 'return_request':
      return {
        badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40',
        Icon: RotateCcw,
      };
    case 'return_cleared':
      return {
        badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40',
        Icon: CheckCircle2,
      };
    case 'return_declined':
      return {
        badgeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40',
        Icon: XCircle,
      };
    case 'item_created':
      return {
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
        Icon: Plus,
      };
    case 'item_edited':
      return {
        badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40',
        Icon: Pencil,
      };
    case 'item_deleted':
      return {
        badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
        Icon: Trash2,
      };
    default:
      return {
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border-slate-200 dark:border-zinc-700',
        Icon: Clock,
      };
  }
};

export const AdminHubView: React.FC<AdminHubViewProps> = ({
  isAdmin,
  currentUserId,
  logs,
  items = [],
  requests,
  allMembers,
  loadingMembers,
  pendingAccounts,
  processingUserId,
  onPromoteRole,
  onApproveAccount,
  onRejectAccount,
  onRefresh,
}) => {
  const [adminLogsTab, setAdminLogsTab] = useState<'members' | 'logs-7d' | 'requests'>('members');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | 'admin' | 'member'>('all');
  const [selectedMemberActivityId, setSelectedMemberActivityId] = useState<string | null>(null);

  // Activity logs state
  const [logSearch, setLogSearch] = useState('');
  const [logDaysFilter, setLogDaysFilter] = useState<'24h' | '3d' | '7d'>('24h');
  const [logCategoryFilter, setLogCategoryFilter] = useState<'all' | 'borrow' | 'return' | 'account' | 'inventory'>('all');
  const [inspectingLog, setInspectingLog] = useState<ParsedAuditEntry | null>(null);
  const [logDisplayCount, setLogDisplayCount] = useState<number>(50);

  // Hydrate cached or server-fetched members and pending accounts with clean Name + Enrollment
  const normalizedMembers = useMemo(
    () => allMembers.map((m) => hydrateMemberIdentity(m)),
    [allMembers]
  );

  const normalizedPendingAccounts = useMemo(
    () => pendingAccounts.map((acc) => hydrateMemberIdentity(acc)),
    [pendingAccounts]
  );

  // Memoized Member Groups to eliminate re-filtering/re-sorting bottlenecks
  const { adminGroup, memberGroup, totalFilteredMembers } = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    const filtered = normalizedMembers.filter((m) => {
      const matchesQ =
        !q ||
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        (m.roll_number && m.roll_number.toLowerCase().includes(q));
      const matchesR = memberRoleFilter === 'all' || m.role === memberRoleFilter;
      return matchesQ && matchesR;
    });

    const admins = filtered
      .filter((m) => m.role === 'admin')
      .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

    const members = filtered
      .filter((m) => m.role !== 'admin')
      .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

    return { adminGroup: admins, memberGroup: members, totalFilteredMembers: filtered.length };
  }, [normalizedMembers, memberSearch, memberRoleFilter]);

  // Parse all logs with member, inventory, and requisition enrichment
  const parsedLogs = useMemo(() => {
    const now = Date.now();
    return logs.map((log) => parseAuditLog(log, normalizedMembers, items, now, requests));
  }, [logs, normalizedMembers, items, requests]);

  // Memoized Filtered Activity Logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const cutoffMs = {
      '24h': now - 24 * 60 * 60 * 1000,
      '3d': now - 3 * 24 * 60 * 60 * 1000,
      '7d': now - 7 * 24 * 60 * 60 * 1000,
    }[logDaysFilter];

    const q = logSearch.toLowerCase().trim();

    return parsedLogs.filter((entry) => {
      if (cutoffMs > 0 && entry.when.ms < cutoffMs) return false;

      if (logCategoryFilter !== 'all' && entry.category !== logCategoryFilter) {
        return false;
      }

      if (q) {
        const haystack = [
          entry.actor.name,
          entry.actor.email,
          entry.actor.roll,
          entry.actor.role,
          entry.target.id,
          entry.target.name,
          entry.target.email,
          entry.target.roll,
          entry.targetIdentifier,
          entry.assignedRole,
          entry.componentName,
          entry.adminName,
          entry.requester?.name,
          entry.requester?.email,
          entry.requester?.roll,
          entry.actionLabel,
          entry.rawAction,
          entry.summary,
          ...entry.changes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [parsedLogs, logDaysFilter, logCategoryFilter, logSearch]);

  if (!isAdmin) {
    return (
      <div className="p-12 text-center bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-zinc-800 rounded-3xl space-y-3 shadow-xl">
        <ScrollText className="w-12 h-12 text-rose-500/80 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Administrator Clearance Required</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
          Lab audit, member management, and registration logs are restricted to CICR executive administrator accounts only.
        </p>
      </div>
    );
  }

  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const sevenDayLogsCount = parsedLogs.filter((l) => l.when.ms >= sevenDaysAgoMs).length;
  const activeLoansCount = requests.filter((r) => r.status === 'approved').length;

  return (
    <div className="p-4 sm:p-7 rounded-3xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-[#20202c] space-y-4 sm:space-y-6 shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 pb-3 sm:pb-4 flex items-center justify-between gap-3">
        <h2 className="text-base sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2 sm:gap-2.5 tracking-tight min-w-0">
          <ScrollText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-purple-400 shrink-0" />
          <span className="truncate">CICR Management Hub</span>
          <span className="hidden md:inline">&amp; Activity Logs</span>
        </h2>

        <button
          type="button"
          onClick={onRefresh}
          className="p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors shrink-0 cursor-pointer"
          title="Refresh Hub Data"
          aria-label="Refresh Hub Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 4 Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Club Members */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800/90 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Club Members</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {normalizedMembers.length > 0 ? normalizedMembers.length : (loadingMembers ? '...' : 0)}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500">Registered laboratory roster</p>
        </div>

        {/* Card 2: 7-Day Activity */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800/90 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Last 7 Days</span>
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {sevenDayLogsCount}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500">Operations logged this week</p>
        </div>

        {/* Card 3: Pending Signups */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800/90 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending Signups</span>
            <UserCheck className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>{normalizedPendingAccounts.length}</span>
            {normalizedPendingAccounts.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40 font-bold">
                Action Needed
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500">Awaiting admin clearance</p>
        </div>

        {/* Card 4: Active Loans */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800/90 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Loans</span>
            <Boxes className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {activeLoansCount}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-500">Hardware currently borrowed</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 dark:border-zinc-800 pb-3">
        <div className="inline-flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 max-w-full overflow-x-auto no-scrollbar">
          {/* Members */}
          <button
            type="button"
            onClick={() => {
              setAdminLogsTab('members');
              setSelectedMemberActivityId(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              adminLogsTab === 'members'
                ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-md font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-blue-600 dark:text-purple-400" />
            <span>Club Members</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:text-zinc-300 text-[10px] font-extrabold border border-slate-300 dark:border-zinc-700">
              {normalizedMembers.length}
            </span>
          </button>

          {/* Activity Logs */}
          <button
            type="button"
            onClick={() => {
              setAdminLogsTab('logs-7d');
              setSelectedMemberActivityId(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              adminLogsTab === 'logs-7d'
                ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-md font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Activity Logs</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 text-[10px] font-extrabold border border-emerald-300/40 dark:border-transparent">
              {sevenDayLogsCount}
            </span>
          </button>

          {/* Account Requests */}
          <button
            type="button"
            onClick={() => {
              setAdminLogsTab('requests');
              setSelectedMemberActivityId(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              adminLogsTab === 'requests'
                ? 'bg-blue-600 dark:bg-purple-600 text-white shadow-md font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Account Requests</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
              normalizedPendingAccounts.length > 0
                ? 'bg-amber-500 text-black animate-pulse border-amber-600'
                : 'bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:text-zinc-400 border-slate-300 dark:border-zinc-700'
            }`}>
              {normalizedPendingAccounts.length}
            </span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: MEMBERS ROSTER */}
      {adminLogsTab === 'members' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members by name, roll, email..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none focus:border-blue-500 dark:focus:border-purple-500 transition-colors"
              />
              {memberSearch && (
                <button
                  type="button"
                  onClick={() => setMemberSearch('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter Pills with Counts */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'All Roles', count: normalizedMembers.length },
                  { key: 'admin', label: 'Admins', count: normalizedMembers.filter((m) => m.role === 'admin').length },
                  { key: 'member', label: 'Members', count: normalizedMembers.filter((m) => m.role !== 'admin').length },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMemberRoleFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    memberRoleFilter === tab.key
                      ? 'bg-blue-600 dark:bg-purple-600 text-white'
                      : 'bg-slate-100 dark:bg-[#14141c] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border-2 border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      memberRoleFilter === tab.key
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Members Table */}
          {(() => {
            if (totalFilteredMembers === 0) {
              if (loadingMembers && normalizedMembers.length === 0) {
                return (
                  <div className="p-12 text-center rounded-2xl bg-slate-50 dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-center gap-2.5 text-slate-500 dark:text-zinc-400">
                      <div className="w-4 h-4 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-bold">Synchronizing laboratory roster...</span>
                    </div>
                  </div>
                );
              }
              return (
                <div className="p-12 text-center rounded-2xl bg-slate-50 dark:bg-[#14141c] border-2 border-dashed border-slate-200 dark:border-zinc-800 space-y-2">
                  <Users className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">No members found</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {memberSearch ? `No roster entries matching "${memberSearch}".` : 'No members found in roster.'}
                  </p>
                </div>
              );
            }

            const renderMemberRow = (member: any, isAdminMember: boolean) => {
              const memberAvatar =
                typeof member.avatar_url === 'string' &&
                !member.avatar_url.startsWith('status:') &&
                (member.avatar_url.startsWith('http') || member.avatar_url.startsWith('data:image'))
                  ? member.avatar_url
                  : '';

              return (
                <tr
                  key={member.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  {/* Member Avatar + Name */}
                  <td className="py-3.5 px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border relative overflow-hidden ${
                          isAdminMember
                            ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-[#1e1730] dark:text-purple-300 dark:border-purple-800/60'
                            : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        <span className="select-none">
                          {(member.full_name || member.email || 'M').charAt(0).toUpperCase()}
                        </span>
                        {memberAvatar && (
                          <img
                            src={memberAvatar}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {member.full_name || 'Member'}
                          </span>
                          {isAdminMember && (
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 md:hidden font-mono block truncate">
                          {member.email}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Email Address */}
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                    {member.email}
                  </td>

                  {/* Roll Number */}
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                    {member.roll_number || '—'}
                  </td>

                {/* Clearance Role */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  {isAdminMember ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400" />
                      ADMIN
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-500" />
                      MEMBER
                    </span>
                  )}
                </td>

                {/* Management Action Button */}
                <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                  {currentUserId && member.id === currentUserId ? (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-[11px] font-bold border bg-slate-100 text-slate-500 dark:bg-zinc-900 dark:text-zinc-500 border-slate-200 dark:border-zinc-800 select-none">
                      Current Admin
                    </span>
                  ) : isAdminMember ? (
                    <button
                      type="button"
                      disabled={processingUserId === member.id}
                      onClick={() =>
                        onPromoteRole(member.id, 'member', member.full_name || member.email)
                      }
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700"
                    >
                      {processingUserId === member.id ? 'Updating...' : 'Demote to Member'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={processingUserId === member.id}
                      onClick={() =>
                        onPromoteRole(member.id, 'admin', member.full_name || member.email)
                      }
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-[#1b152b] dark:hover:bg-[#261c3d] dark:text-purple-300 border-purple-300 dark:border-purple-800/70"
                    >
                      {processingUserId === member.id ? 'Updating...' : 'Promote to Admin'}
                    </button>
                  )}
                </td>
              </tr>
              );
            };

            return (
              <div className="overflow-x-auto rounded-2xl border-2 border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#14141c] shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-zinc-800 bg-slate-100/70 dark:bg-[#181824] text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      <th className="py-3 px-4 sm:px-6">Member</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Enrollment Number</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4 sm:px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-xs">
                    {/* Section 1: Administrators (Shown First) */}
                    {adminGroup.length > 0 && (
                      <>
                        <tr className="bg-slate-50 dark:bg-[#171722] border-y border-slate-200 dark:border-zinc-800/80">
                          <td colSpan={5} className="py-2.5 px-4 sm:px-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-zinc-200">
                                  Administrators
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                                  {adminGroup.length}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {adminGroup.map((member) => renderMemberRow(member, true))}
                      </>
                    )}

                    {/* Section 2: Club Members (Shown After Admins) */}
                    {memberGroup.length > 0 && (
                      <>
                        <tr className="bg-slate-50 dark:bg-[#171722] border-y border-slate-200 dark:border-zinc-800/80">
                          <td colSpan={5} className="py-2.5 px-4 sm:px-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Users className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                                <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-zinc-200">
                                  Club Members
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-300 dark:border-zinc-700">
                                  {memberGroup.length}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {memberGroup.map((member) => renderMemberRow(member, false))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 2: 7-DAY IMMUTABLE ACTIVITY HISTORY */}
      {adminLogsTab === 'logs-7d' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 max-w-md">
                <IOSSearchBar
                  value={logSearch}
                  onChange={setLogSearch}
                  placeholder="Search by name, ID, role, component, action..."
                  className="w-full"
                  collapsedWidth="100%"
                  expandedWidth="100%"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { key: '24h', label: 'Last 24 Hours' },
                  { key: '3d', label: 'Last 3 Days' },
                  { key: '7d', label: 'Last 7 Days' },
                ].map((tf) => (
                  <button
                    key={tf.key}
                    type="button"
                    onClick={() => setLogDaysFilter(tf.key as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      logDaysFilter === tf.key
                        ? 'bg-blue-600 dark:bg-purple-600 text-white font-black shadow-sm'
                        : 'bg-slate-100 dark:bg-[#14141c] text-slate-700 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border-2 border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {[
                { key: 'all', label: 'All Activities' },
                { key: 'borrow', label: 'Borrows & Checkouts' },
                { key: 'return', label: 'Returns' },
                { key: 'account', label: 'Account Actions' },
                { key: 'inventory', label: 'Component Updates' },
              ].map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setLogCategoryFilter(cat.key as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    logCategoryFilter === cat.key
                      ? 'bg-slate-800 text-white dark:bg-zinc-700'
                      : 'bg-slate-100 dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtered Log Stream */}
          {(() => {
            if (filteredLogs.length === 0) {
              return (
                <div className="py-16 text-center rounded-2xl bg-slate-50 dark:bg-[#14141c]/60 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-900 dark:text-white">No Activities Match Filter</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                    No logs found within the selected timeframe ({logDaysFilter.toUpperCase()}) or search criteria.
                  </p>
                </div>
              );
            }

            const displayedLogs = filteredLogs.slice(0, logDisplayCount);

            return (
              <div className="space-y-3">
                <div className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono pb-1 flex flex-wrap items-center justify-between gap-2">
                  <span>Showing {displayedLogs.length} of {filteredLogs.length} activity logs</span>
                </div>

                <div className="rounded-2xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-zinc-800/90 divide-y divide-slate-100 dark:divide-zinc-800/80 overflow-hidden shadow-sm">
                  {displayedLogs.map((entry) => {
                    const { badgeClass, Icon: ActionIcon } = getAuditBadgeStyle(entry.badgeVariant);
                    const isActorAdmin = entry.actor.role === 'admin' || entry.actor.role === 'lead';
                    const isSessionEvent = entry.badgeVariant === 'signin' || entry.badgeVariant === 'signout';
                    const isRoleUpdate = entry.badgeVariant === 'role_updated';
                    const isIssueOrReturn =
                      entry.badgeVariant === 'borrow_request' ||
                      entry.badgeVariant === 'borrow_approved' ||
                      entry.badgeVariant === 'borrow_rejected' ||
                      entry.badgeVariant === 'return_request' ||
                      entry.badgeVariant === 'return_cleared' ||
                      entry.badgeVariant === 'return_declined';

                    const showGenericTargetPill = Boolean(
                      !isSessionEvent &&
                        !isRoleUpdate &&
                        !isIssueOrReturn &&
                        entry.target.name &&
                        entry.target.name.toLowerCase() !== entry.actor.name.toLowerCase()
                    );

                    const extraChanges = entry.changes.filter(
                      (chg) =>
                        !/^(Borrower|Roll|Qty|Status|Available Qty|Role):/i.test(chg) &&
                        !(isRoleUpdate && /^Role updated to /i.test(chg))
                    );

                    return (
                      <div
                        key={entry.id}
                        className="px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-[#141420] transition-colors"
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border mt-0.5 ${
                              isActorAdmin && !isSessionEvent
                                ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-[#1e1730] dark:text-purple-300 dark:border-purple-700/60'
                                : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                            }`}
                          >
                            {(entry.actor.name || 'U').charAt(0).toUpperCase()}
                          </div>

                          <div className="min-w-0 space-y-1.5 flex-1">
                            {/* Line 1: Person/Actor + Action Badge (+ Target for generic events) */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-slate-900 dark:text-white">
                                {entry.actor.name}
                              </span>

                              {!isSessionEvent && (
                                <>
                                  {isActorAdmin ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase font-mono bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                                      <ShieldCheck className="w-2.5 h-2.5" />
                                      {entry.actor.role.toUpperCase()}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase font-mono bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                                      <User className="w-2.5 h-2.5" />
                                      {entry.actor.role.toUpperCase()}
                                    </span>
                                  )}
                                </>
                              )}

                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border flex items-center gap-1 ${badgeClass}`}
                              >
                                <ActionIcon className="w-3 h-3" />
                                <span>{entry.actionLabel}</span>
                              </span>

                              {showGenericTargetPill && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-zinc-800/90 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                                  <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[220px]">{entry.target.name}</span>
                                  {(entry.target.roll || entry.target.email) && (
                                    <span className="text-slate-500 dark:text-zinc-400 font-mono font-normal">
                                      ({entry.target.roll || entry.target.email})
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Line 2: Clear Action Detail */}
                            <p className="text-xs text-slate-700 dark:text-zinc-300 leading-snug line-clamp-2">
                              {entry.summary}
                            </p>

                            {/* Line 3: Purpose-Specific Structured Pills (Role Updates / Issues & Returns / Field Diffs) */}
                            {isRoleUpdate && (
                              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#171722] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800">
                                  <span className="text-slate-400 dark:text-zinc-500 font-medium">Updated by:</span>
                                  <span className="font-bold text-slate-900 dark:text-white">{entry.actor.name}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50/90 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800/50">
                                  <span className="text-blue-600/80 dark:text-blue-300/80 font-medium">ID Updated:</span>
                                  <span className="font-bold">
                                    {entry.target.name || 'Member'}
                                    {entry.targetIdentifier &&
                                    entry.targetIdentifier.toLowerCase() !== (entry.target.name || '').toLowerCase()
                                      ? ` (${entry.targetIdentifier})`
                                      : ''}
                                  </span>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-extrabold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                                  <span>Role Given:</span>
                                  <span>{entry.assignedRole || 'MEMBER'}</span>
                                </span>
                              </div>
                            )}

                            {isIssueOrReturn && (
                              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#171722] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800">
                                  <span className="text-slate-400 dark:text-zinc-500 font-medium">Person:</span>
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {entry.requester?.name || entry.actor.name}
                                  </span>
                                  {entry.requester?.roll && (
                                    <span className="font-mono text-slate-500 dark:text-zinc-400">
                                      ({entry.requester.roll})
                                    </span>
                                  )}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50/90 dark:bg-purple-950/30 text-blue-800 dark:text-purple-200 border border-blue-200 dark:border-purple-800/50">
                                  <span className="text-blue-600/80 dark:text-purple-300/80 font-medium">Component:</span>
                                  <span className="font-bold">{entry.componentName || entry.target.name}</span>
                                </span>
                                {entry.adminName ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium ${
                                      entry.decision === 'rejected' || entry.decision === 'declined'
                                        ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/50'
                                        : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50'
                                    }`}
                                  >
                                    <span>
                                      {entry.decision === 'rejected' || entry.decision === 'declined'
                                        ? 'Rejected by:'
                                        : 'Approved by:'}
                                    </span>
                                    <span className="font-bold">{entry.adminName}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50/90 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 font-medium">
                                    <span>Admin:</span>
                                    <span className="font-bold">Pending Review</span>
                                  </span>
                                )}
                                {extraChanges.slice(0, 2).map((chg, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200/80 dark:border-zinc-800"
                                  >
                                    {chg}
                                  </span>
                                ))}
                              </div>
                            )}

                            {!isSessionEvent && !isRoleUpdate && !isIssueOrReturn && extraChanges.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 dark:text-zinc-400">
                                {extraChanges.slice(0, 3).map((chg, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200/80 dark:border-zinc-800"
                                  >
                                    {chg}
                                  </span>
                                ))}
                                {extraChanges.length > 3 && (
                                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                                    +{extraChanges.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Compact Date & Time + Inspect */}
                        <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pl-12 lg:pl-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-zinc-800/70">
                          <span
                            className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 whitespace-nowrap"
                            title={entry.when.fullLocal}
                          >
                            {entry.when.dateStr}, {entry.when.timeStr.slice(0, 5)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setInspectingLog(entry)}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer shrink-0"
                            title="Inspect Audit Record"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredLogs.length > logDisplayCount && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setLogDisplayCount((prev) => prev + 50)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                      Load More Activities ({filteredLogs.length - logDisplayCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 3: ACCOUNT REQUESTS */}
      {adminLogsTab === 'requests' && (
        <div className="space-y-4">
          {normalizedPendingAccounts.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 dark:bg-[#14141c]/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">All Member Registrations Clear</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                No new account registrations are currently pending administrator authorization.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {normalizedPendingAccounts.map((account) => {
                const accountAvatar =
                  typeof account.avatar_url === 'string' &&
                  !account.avatar_url.startsWith('status:') &&
                  (account.avatar_url.startsWith('http') || account.avatar_url.startsWith('data:image'))
                    ? account.avatar_url
                    : '';
                const requestedDateStr = account.created_at
                  ? new Date(account.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                return (
                  <div
                    key={account.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40 font-bold flex items-center justify-center shrink-0 relative overflow-hidden">
                        <span className="select-none">
                          {(account.full_name || account.email || 'U').charAt(0).toUpperCase()}
                        </span>
                        {accountAvatar && (
                          <img
                            src={accountAvatar}
                            alt=""
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white break-words">
                            {account.full_name || 'Applicant'}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-[10px] font-bold uppercase tracking-wider">
                            Pending Verification
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-purple-950/50 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-800/60 text-[11px] font-mono font-bold">
                            Enrollment: {account.roll_number || 'Not Assigned'}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono break-all">
                            {account.email}
                          </span>
                        </div>
                        {requestedDateStr && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 block font-mono">
                            Requested: {requestedDateStr}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-zinc-800/80">
                      <button
                        type="button"
                        disabled={processingUserId === account.id}
                        onClick={() => onRejectAccount(account.id, account.full_name || account.email, account.email)}
                        className="flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-300 dark:border-red-800 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 text-center"
                      >
                        {processingUserId === account.id ? 'Rejecting...' : 'Reject'}
                      </button>
                      <button
                        type="button"
                        disabled={processingUserId === account.id}
                        onClick={() => onApproveAccount(account.id, account.full_name || account.email, account.email)}
                        className="flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50 text-center"
                      >
                        {processingUserId === account.id ? 'Approving...' : 'Approve Account'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity Details Inspector Modal (Zero Where / Compact Timestamp) */}
      {inspectingLog && (() => {
        const { badgeClass, Icon: ModalActionIcon } = getAuditBadgeStyle(inspectingLog.badgeVariant);
        const isActorAdmin = inspectingLog.actor.role === 'admin' || inspectingLog.actor.role === 'lead';
        const isSessionModal = inspectingLog.badgeVariant === 'signin' || inspectingLog.badgeVariant === 'signout';
        const isRoleModal = inspectingLog.badgeVariant === 'role_updated';
        const isIssueOrReturnModal =
          inspectingLog.badgeVariant === 'borrow_request' ||
          inspectingLog.badgeVariant === 'borrow_approved' ||
          inspectingLog.badgeVariant === 'borrow_rejected' ||
          inspectingLog.badgeVariant === 'return_request' ||
          inspectingLog.badgeVariant === 'return_cleared' ||
          inspectingLog.badgeVariant === 'return_declined';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setInspectingLog(null)}
          >
            <div
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border shrink-0 ${
                      isActorAdmin && !isSessionModal
                        ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-[#1e1730] dark:text-purple-300 dark:border-purple-700/60'
                        : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    {(inspectingLog.actor.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border inline-flex items-center gap-1 ${badgeClass}`}
                      >
                        <ModalActionIcon className="w-3 h-3" />
                        <span>{inspectingLog.actionLabel}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                        {inspectingLog.rawAction}
                      </span>
                    </div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                      {inspectingLog.actor.name}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectingLog(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                  aria-label="Close inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isSessionModal ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 space-y-2 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block">
                    Session Activity
                  </span>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">
                    {inspectingLog.actor.name}
                  </p>
                  <p className="text-slate-700 dark:text-zinc-300">{inspectingLog.summary}</p>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  {/* Actor */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        {isRoleModal ? 'Updated By' : 'Performed By'}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase font-mono border ${
                          isActorAdmin
                            ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60'
                            : 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        {inspectingLog.actor.role}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">
                        {inspectingLog.actor.name}
                      </p>
                      {inspectingLog.actor.roll && (
                        <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                          Enrollment ID: <span className="text-slate-800 dark:text-zinc-200 font-semibold">{inspectingLog.actor.roll}</span>
                        </p>
                      )}
                      {inspectingLog.actor.email && (
                        <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 break-all">
                          {inspectingLog.actor.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action & Structured Details */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 space-y-2.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      Action Details
                    </span>
                    <p className="text-slate-800 dark:text-zinc-100 font-medium leading-relaxed text-xs sm:text-sm">
                      {inspectingLog.summary}
                    </p>

                    {isRoleModal && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#101018] border border-slate-200 dark:border-zinc-800/90 space-y-0.5">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                            Account / ID Updated
                          </span>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {inspectingLog.target.name || 'Member'}
                          </p>
                          {(inspectingLog.target.roll || inspectingLog.targetIdentifier) && (
                            <p className="text-[11px] font-mono text-slate-600 dark:text-zinc-300">
                              ID: {inspectingLog.target.roll || inspectingLog.targetIdentifier}
                            </p>
                          )}
                          {inspectingLog.target.email && (
                            <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 break-all">
                              {inspectingLog.target.email}
                            </p>
                          )}
                          {inspectingLog.target.id && (
                            <p className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 break-all">
                              UUID: {inspectingLog.target.id}
                            </p>
                          )}
                        </div>
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#101018] border border-slate-200 dark:border-zinc-800/90 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                            Role Given
                          </span>
                          <span className="inline-flex px-2.5 py-1 rounded-lg font-mono text-xs font-extrabold bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                            {inspectingLog.assignedRole || 'MEMBER'}
                          </span>
                        </div>
                      </div>
                    )}

                    {isIssueOrReturnModal && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#101018] border border-slate-200 dark:border-zinc-800/90 space-y-0.5">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                            Person Name
                          </span>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {inspectingLog.requester?.name || inspectingLog.actor.name}
                          </p>
                          {inspectingLog.requester?.roll && (
                            <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                              ID: {inspectingLog.requester.roll}
                            </p>
                          )}
                        </div>
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#101018] border border-slate-200 dark:border-zinc-800/90 space-y-0.5">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                            Component Name
                          </span>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {inspectingLog.componentName || inspectingLog.target.name}
                          </p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#101018] border border-slate-200 dark:border-zinc-800/90 space-y-0.5">
                          <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                            {inspectingLog.decision === 'rejected' || inspectingLog.decision === 'declined'
                              ? 'Admin Rejected'
                              : inspectingLog.decision === 'approved'
                              ? 'Admin Approved'
                              : 'Admin Status'}
                          </span>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {inspectingLog.adminName || 'Pending Review'}
                          </p>
                        </div>
                      </div>
                    )}

                    {!isRoleModal && !isIssueOrReturnModal && inspectingLog.target.name && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#101018] border border-slate-200 dark:border-zinc-800/90 space-y-0.5">
                        <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                          Affected Target
                        </span>
                        <p className="font-bold text-slate-900 dark:text-white">{inspectingLog.target.name}</p>
                        {inspectingLog.target.roll && (
                          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                            ID: {inspectingLog.target.roll}
                          </p>
                        )}
                        {inspectingLog.target.email && (
                          <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 break-all">
                            {inspectingLog.target.email}
                          </p>
                        )}
                      </div>
                    )}

                    {inspectingLog.changes.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 block">
                          Recorded Details
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {inspectingLog.changes.map((chg, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded-lg text-[11px] font-mono bg-white dark:bg-[#101018] text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800"
                            >
                              {chg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Record Footer */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 dark:text-zinc-500 border-t border-slate-100 dark:border-zinc-800/80">
                <span className="truncate">Record ID: {inspectingLog.id}</span>
                <span>
                  {inspectingLog.when.dateStr}, {inspectingLog.when.timeStr.slice(0, 5)}
                </span>
                <span>Category: {inspectingLog.category.toUpperCase()}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
