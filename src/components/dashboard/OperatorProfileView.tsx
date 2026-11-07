import React from 'react';
import { CicrLogo } from '../common/CicrLogo';
import {
  Wrench,
  Construction,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface OperatorProfileViewProps {
  userName: string;
  userEmail?: string;
  roleName: string;
  editName: string;
  setEditName: (name: string) => void;
  editEnrollment: string;
  setEditEnrollment: (roll: string) => void;
  editPhone: string;
  setEditPhone: (phone: string) => void;
  editAvatarUrl: string;
  setEditAvatarUrl: (url: string) => void;
  savingProfile: boolean;
  onSaveProfile: (e: React.FormEvent) => void;
  onOpenChangePassword?: () => void;
  onRemoveAvatar: () => void;
}

export const OperatorProfileView: React.FC<OperatorProfileViewProps> = ({
  userName,
  userEmail,
  roleName,
}) => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in duration-300">
      {/* CICR Inventory Logo with Pulse Ambient Glow */}
      <div className="relative group">
        <div className="absolute -inset-4 bg-gradient-to-r from-blue-600/30 to-purple-600/30 rounded-3xl blur-2xl opacity-60 group-hover:opacity-100 transition duration-500" />
        <div className="relative p-3 rounded-3xl bg-white/80 dark:bg-[#0f0f18]/80 backdrop-blur-xl border-2 border-slate-200/90 dark:border-purple-500/30 shadow-2xl">
          <CicrLogo size={88} className="rounded-2xl" />
        </div>
      </div>

      {/* Under Construction Status Pill */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-extrabold uppercase tracking-wider shadow-sm">
        <Construction className="w-4 h-4 animate-bounce" />
        <span>Module Under Active Construction</span>
      </div>

      {/* Main Heading & Proper Message */}
      <div className="space-y-3 max-w-xl">
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Operator Profile Hub
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-zinc-400 leading-relaxed font-medium">
          The Operator Profile &amp; Identity Verification center is currently undergoing scheduled architecture updates and security hardening.
        </p>
        <p className="text-xs text-slate-500 dark:text-zinc-500 leading-relaxed">
          All laboratory hardware requisitions, component vault access, and active inventory tracking services remain fully operational and unaffected.
        </p>
      </div>

      {/* Operator Session Credentials Card */}
      <div className="w-full max-w-md p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#0c0c14] border-2 border-slate-200 dark:border-zinc-800 shadow-xl space-y-4 text-left">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Active Operator Session</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-purple-950/50 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-800 text-[10px] font-black uppercase">
            {roleName}
          </span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-zinc-500">Operator:</span>
            <span className="font-bold text-slate-900 dark:text-white">{userName}</span>
          </div>
          {userEmail && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-zinc-500">Email:</span>
              <span className="font-mono text-slate-700 dark:text-zinc-300">{userEmail}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-zinc-500">System Clearance:</span>
            <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Verified &amp; Online
            </span>
          </div>
        </div>

        {/* Google Workspace SSO Security Indicator */}
        <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-zinc-500">Account Authentication</span>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 text-xs font-bold shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>JIIT Google SSO Linked</span>
          </div>
        </div>
      </div>
    </div>
  );
};
