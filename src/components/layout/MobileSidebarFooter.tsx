/**
 * Pinned mobile sidebar footer rendering the signed in operator profile card
 * with resilient avatar fallback and explicit session sign out action.
 */

import React, { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { NavigationOperatorMeta } from '../../utils/navigationProfile';

interface MobileSidebarFooterProps {
  meta: NavigationOperatorMeta;
  onSignOut: () => void;
}

/**
 * Displays operator identity details and sign out control at the bottom of MobileSidebar.
 */
export const MobileSidebarFooter: React.FC<MobileSidebarFooterProps> = ({ meta, onSignOut }) => {
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [meta.avatarSrc]);

  const showAvatarImage =
    Boolean(meta.avatarSrc) &&
    !avatarLoadFailed &&
    (meta.avatarSrc.startsWith('data:image') || meta.avatarSrc.startsWith('http'));

  return (
    <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-[#090910] shrink-0 space-y-2.5">
      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-[#12121a] border border-slate-200 dark:border-zinc-800">
        <div className="w-9 h-9 rounded-full bg-blue-600 dark:bg-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0 relative overflow-hidden">
          <span>{meta.initial}</span>
          {showAvatarImage && (
            <img
              src={meta.avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setAvatarLoadFailed(true)}
              className="absolute inset-0 w-full h-full object-cover rounded-full"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{meta.displayName}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[9px] font-black text-blue-600 dark:text-purple-400 uppercase tracking-wider">
              {meta.roleName}
            </span>
            {meta.enrollmentNo && (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                {meta.enrollmentNo}
              </span>
            )}
          </div>
          {meta.rawEmail && (
            <p className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 truncate mt-0.5">
              {meta.rawEmail}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/70 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 text-xs font-bold transition-colors cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>
    </div>
  );
};

