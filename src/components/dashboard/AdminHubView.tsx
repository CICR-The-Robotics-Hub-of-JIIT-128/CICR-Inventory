import React, { useState, useMemo } from 'react';
import { IOSSearchBar } from '../ui/ios-search-bar';
import { BorrowRequest } from '../../types/inventory';
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
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  Hash,
  Phone,
  Calendar,
} from 'lucide-react';

interface AdminHubViewProps {
  isAdmin: boolean;
  logs: any[];
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

const parseActivityDetails = (raw: string | undefined): { cleanSummary: string; meta?: any } => {
  if (!raw) return { cleanSummary: 'System activity recorded.' };
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const name = parsed.fullName || parsed.full_name || parsed.name || 'Member';
      const email = parsed.email || '';
      const roll = parsed.enrollmentNo || parsed.enrollment_no || parsed.roll_number || '';
      const role = parsed.role ? `[${parsed.role.toUpperCase()}]` : '';
      const summary = `Registration request submitted by ${name} (${email})${roll ? ` • Roll: ${roll}` : ''} ${role}`;
      return { cleanSummary: summary, meta: parsed };
    } catch {
      return { cleanSummary: raw };
    }
  }
  return { cleanSummary: raw };
};

export const AdminHubView: React.FC<AdminHubViewProps> = ({
  isAdmin,
  logs,
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
  const [logDaysFilter, setLogDaysFilter] = useState<'24h' | '3d'>('24h');
  const [logCategoryFilter, setLogCategoryFilter] = useState<'all' | 'borrow' | 'return' | 'account' | 'inventory'>('all');
  const [inspectingLog, setInspectingLog] = useState<any | null>(null);
  const [logDisplayCount, setLogDisplayCount] = useState<number>(50);

  // Memoized Member Groups to eliminate re-filtering/re-sorting bottlenecks
  const { adminGroup, memberGroup, totalFilteredMembers } = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    const filtered = allMembers.filter((m) => {
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
  }, [allMembers, memberSearch, memberRoleFilter]);

  // Memoized Filtered Activity Logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const cutoffMs = {
      '24h': now - 24 * 60 * 60 * 1000,
      '3d': now - 3 * 24 * 60 * 60 * 1000,
    }[logDaysFilter];

    const q = logSearch.toLowerCase().trim();

    return logs.filter((log) => {
      const logTime = new Date(log.created_at).getTime();
      if (cutoffMs > 0 && logTime < cutoffMs) return false;

      if (logCategoryFilter === 'borrow') {
        const isBorrow =
          log.action?.toLowerCase().includes('borrow') ||
          log.action?.toLowerCase().includes('approved') ||
          log.details?.toLowerCase().includes('borrow') ||
          log.details?.toLowerCase().includes('requested');
        if (!isBorrow) return false;
      } else if (logCategoryFilter === 'return') {
        const isReturn =
          log.action?.toLowerCase().includes('return') ||
          log.details?.toLowerCase().includes('returned');
        if (!isReturn) return false;
      } else if (logCategoryFilter === 'account') {
        const isAccount =
          log.action?.toLowerCase().includes('user') ||
          log.action?.toLowerCase().includes('account') ||
          log.action?.toLowerCase().includes('role') ||
          log.action?.toLowerCase().includes('sign') ||
          log.details?.toLowerCase().includes('account') ||
          log.details?.toLowerCase().includes('registration') ||
          log.details?.toLowerCase().includes('signed');
        if (!isAccount) return false;
      } else if (logCategoryFilter === 'inventory') {
        const isItem =
          log.action?.toLowerCase().includes('item') ||
          log.details?.toLowerCase().includes('component') ||
          log.details?.toLowerCase().includes('inventory');
        if (!isItem) return false;
      }

      if (q) {
        const matches =
          (log.user_name && log.user_name.toLowerCase().includes(q)) ||
          (log.details && log.details.toLowerCase().includes(q)) ||
          (log.action && log.action.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [logs, logDaysFilter, logCategoryFilter, logSearch]);

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
  const sevenDayLogsCount = logs.filter(
    (l) => new Date(l.created_at).getTime() >= sevenDaysAgoMs
  ).length;
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
            {allMembers.length > 0 ? allMembers.length : (loadingMembers ? '...' : 0)}
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
            <span>{pendingAccounts.length}</span>
            {pendingAccounts.length > 0 && (
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
              {allMembers.length}
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
              pendingAccounts.length > 0
                ? 'bg-amber-500 text-black animate-pulse border-amber-600'
                : 'bg-slate-200 text-slate-800 dark:bg-zinc-800 dark:text-zinc-400 border-slate-300 dark:border-zinc-700'
            }`}>
              {pendingAccounts.length}
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
                  { key: 'all', label: 'All Roles', count: allMembers.length },
                  { key: 'admin', label: 'Admins', count: allMembers.filter((m) => m.role === 'admin').length },
                  { key: 'member', label: 'Members', count: allMembers.filter((m) => m.role !== 'admin').length },
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
              if (loadingMembers && allMembers.length === 0) {
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

            const renderMemberRow = (member: any, isAdminMember: boolean) => (
              <tr
                key={member.id}
                className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
              >
                {/* Member Avatar + Name */}
                <td className="py-3.5 px-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border ${
                        isAdminMember
                          ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-[#1e1730] dark:text-purple-300 dark:border-purple-800/60'
                          : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      {(member.full_name || member.email || 'M').charAt(0).toUpperCase()}
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
                <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dark:text-zinc-400 whitespace-nowrap">
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
                  {isAdminMember ? (
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
                  placeholder="Search logs by actor, action, details..."
                  className="w-full"
                  collapsedWidth="100%"
                  expandedWidth="100%"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { key: '24h', label: 'Last 24 Hours' },
                  { key: '3d', label: 'Last 3 Days' },
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
            const now = Date.now();
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
                <div className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono pb-1 flex items-center justify-between">
                  <span>Showing {displayedLogs.length} of {filteredLogs.length} events logged in chronological timeline</span>
                </div>

                <div className="rounded-2xl bg-white dark:bg-[#0f0f15] border-2 border-slate-200 dark:border-zinc-800/90 divide-y divide-slate-100 dark:divide-zinc-800/80 overflow-hidden shadow-sm">
                  {displayedLogs.map((log) => {
                    const actionUpper = (log.action || '').toUpperCase();
                    const detailsLower = (log.details || '').toLowerCase();

                    let badgeClass = 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border-slate-200 dark:border-zinc-700';
                    let label = log.action ? log.action.replace(/_/g, ' ') : 'Activity';
                    let ActionIcon = Clock;

                    if (actionUpper === 'USER_SIGNIN' || detailsLower.includes('signed in')) {
                      badgeClass = 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/40';
                      label = 'Member Sign In';
                      ActionIcon = LogIn;
                    } else if (actionUpper === 'USER_SIGNOUT' || detailsLower.includes('signed out')) {
                      badgeClass = 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-500/40';
                      label = 'Member Sign Out';
                      ActionIcon = LogOut;
                    } else if (actionUpper === 'ACCOUNT_REQUEST' || detailsLower.includes('registration request')) {
                      badgeClass = 'bg-blue-500/20 text-blue-700 dark:text-purple-300 border-blue-500/40';
                      label = 'Registration Request';
                      ActionIcon = UserPlus;
                    } else if (actionUpper.includes('BORROW') || detailsLower.includes('requested')) {
                      badgeClass = 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40';
                      label = 'Requisition';
                      ActionIcon = ShoppingBag;
                    } else if (actionUpper.includes('APPROV') || detailsLower.includes('approved')) {
                      badgeClass = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40';
                      label = 'Approved';
                      ActionIcon = CheckCircle2;
                    } else if (actionUpper.includes('REJECT') || detailsLower.includes('rejected')) {
                      badgeClass = 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40';
                      label = 'Rejected';
                      ActionIcon = XCircle;
                    } else if (actionUpper.includes('RETURN') || detailsLower.includes('returned')) {
                      badgeClass = 'bg-teal-500/20 text-teal-600 dark:text-teal-300 border-teal-500/40';
                      label = 'Returned';
                      ActionIcon = RotateCcw;
                    } else if (actionUpper === 'UPDATE_ITEM' || actionUpper.includes('UPDATE') || detailsLower.includes('edited') || detailsLower.includes('updated component')) {
                      badgeClass = 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40';
                      label = 'Component Edited';
                      ActionIcon = Pencil;
                    } else if (actionUpper.includes('ROLE') || detailsLower.includes('role')) {
                      badgeClass = 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40';
                      label = 'Account Operation';
                      ActionIcon = UserCheck;
                    }

                    const logDate = new Date(log.created_at);
                    const diffMinutes = Math.floor((now - logDate.getTime()) / (60 * 1000));
                    const diffHours = Math.floor(diffMinutes / 60);
                    const diffDays = Math.floor(diffHours / 24);

                    let relativeTime = 'Just now';
                    if (diffMinutes >= 1 && diffMinutes < 60) relativeTime = `${diffMinutes}m ago`;
                    else if (diffHours >= 1 && diffHours < 24) relativeTime = `${diffHours}h ago`;
                    else if (diffDays === 1) relativeTime = 'Yesterday';
                    else if (diffDays > 1) relativeTime = `${diffDays}d ago`;

                    const { cleanSummary } = parseActivityDetails(log.details);

                    return (
                      <div
                        key={log.id}
                        className="px-4 py-3.5 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-[#141420] transition-colors"
                      >
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-purple-950/60 border border-blue-200 dark:border-purple-500/40 text-blue-600 dark:text-purple-300 font-bold text-xs flex items-center justify-center shrink-0">
                            {(log.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 space-y-0.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-slate-900 dark:text-white">
                                {log.user_name || 'System Member'}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border flex items-center gap-1 ${badgeClass}`}
                              >
                                <ActionIcon className="w-3 h-3" />
                                <span>{label}</span>
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-zinc-300 leading-snug line-clamp-2">
                              {cleanSummary}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 pl-12 sm:pl-0">
                          <div className="text-left sm:text-right font-mono text-[11px]">
                            <span className="block text-slate-800 dark:text-zinc-300 font-bold">
                              {relativeTime}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                              {logDate.toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setInspectingLog(log)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                            title="Inspect Details"
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
          {pendingAccounts.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 dark:bg-[#14141c]/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">All Member Registrations Clear</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                No new account registrations are currently pending administrator authorization.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingAccounts.map((account) => (
                <div
                  key={account.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40 font-bold flex items-center justify-center shrink-0">
                      {(account.full_name || account.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white break-words">
                        {account.full_name || 'New Member'}
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400 block font-mono break-all mt-0.5">
                        {account.email}
                      </span>
                      {account.roll_number && (
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 block font-mono mt-0.5">
                          Roll: {account.roll_number}
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
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={processingUserId === account.id}
                      onClick={() => onApproveAccount(account.id, account.full_name || account.email, account.email)}
                      className="flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50 text-center"
                    >
                      {processingUserId === account.id ? 'Approving...' : 'Approve Account'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Details Inspector Modal */}
      {inspectingLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setInspectingLog(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#14141c] border-2 border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-purple-950/60 text-blue-600 dark:text-purple-300 flex items-center justify-center font-bold text-xs">
                  {(inspectingLog.user_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    {inspectingLog.user_name || 'Member'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {new Date(inspectingLog.created_at).toLocaleString('en-GB')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            {(() => {
              const { cleanSummary, meta } = parseActivityDetails(inspectingLog.details);
              return (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-zinc-400">Action</span>
                      <span className="font-bold text-slate-900 dark:text-white uppercase font-mono">
                        {inspectingLog.action || 'Activity'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-zinc-400">Timestamp</span>
                      <span className="font-mono text-slate-800 dark:text-zinc-300">
                        {new Date(inspectingLog.created_at).toLocaleString('en-GB')}
                      </span>
                    </div>
                  </div>

                  {meta ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        Record Details
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {meta.fullName && (
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800">
                            <span className="text-[10px] text-zinc-500 block uppercase font-mono">Full Name</span>
                            <span className="font-bold text-slate-900 dark:text-white">{meta.fullName}</span>
                          </div>
                        )}
                        {meta.email && (
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800">
                            <span className="text-[10px] text-zinc-500 block uppercase font-mono">Email Address</span>
                            <span className="font-bold text-slate-900 dark:text-white break-all">{meta.email}</span>
                          </div>
                        )}
                        {(meta.enrollmentNo || meta.enrollment_no) && (
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800">
                            <span className="text-[10px] text-zinc-500 block uppercase font-mono">Enrollment No</span>
                            <span className="font-bold font-mono text-slate-900 dark:text-white">
                              {meta.enrollmentNo || meta.enrollment_no}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#151520] border border-slate-200 dark:border-zinc-800 space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-mono">Description</p>
                      <p className="text-slate-800 dark:text-zinc-200 font-medium leading-relaxed">{cleanSummary}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
