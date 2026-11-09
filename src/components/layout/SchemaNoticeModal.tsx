import React, { useState } from 'react';
import { Database, Copy, Check, ExternalLink, RefreshCw, X, AlertCircle } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../common/Toast';
import { supabaseProjectRef } from '../../lib/supabase';

interface SchemaNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SQL_SCHEMA_TEXT = `-- CICR Inventory Portal Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    roll_number TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead', 'admin')),
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    location TEXT NOT NULL,
    total_qty INTEGER NOT NULL DEFAULT 1 CHECK (total_qty >= 0),
    available_qty INTEGER NOT NULL DEFAULT 1 CHECK (available_qty >= 0),
    min_threshold INTEGER DEFAULT 2 CHECK (min_threshold >= 0),
    status TEXT DEFAULT 'In Stock',
    image_url TEXT,
    datasheet_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.borrow_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    project_name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    borrow_date DATE,
    expected_return_date DATE NOT NULL,
    actual_return_date DATE,
    approved_by TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    item_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Inventory viewable by all" ON public.inventory_items FOR SELECT USING (true);
CREATE POLICY "Authenticated users modify inventory" ON public.inventory_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Borrow requests viewable" ON public.borrow_requests FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Create borrow requests" ON public.borrow_requests FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Update borrow requests" ON public.borrow_requests FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Logs viewable" ON public.activity_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Logs insertable" ON public.activity_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
`;

export const SchemaNoticeModal: React.FC<SchemaNoticeModalProps> = ({ isOpen, onClose }) => {
  const { isLiveDatabase, refreshData } = useInventory();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_TEXT);
    setCopied(true);
    showToast('success', 'Copied SQL Schema to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSync = async () => {
    setSyncing(true);
    await refreshData();
    setSyncing(false);
    showToast('info', 'Checked Supabase connection');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#0c0918] border border-purple-900/40 rounded-3xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Supabase Backend Setup
                {isLiveDatabase ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Live Connected
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Tables Pending
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-400">
                Project Ref: <code className="text-purple-300">{supabaseProjectRef || 'Configured via .env'}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-purple-950/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-sm text-zinc-300">
          <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-800/50 text-purple-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-purple-400 mt-0.5" />
            <div>
              <p className="font-semibold text-purple-100">Supabase Auth is Active</p>
              <p className="text-xs text-purple-200/80 mt-1">
                Your signups, logins, and member profiles are authenticated directly through Supabase Auth. To initialize PostgreSQL tables for inventory and borrow requests, run the schema below in your Supabase SQL Editor.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                SQL Schema Script (PostgreSQL)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[#140f26] hover:bg-[#1f173b] text-purple-300 rounded-xl transition-colors border border-purple-900/40"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy SQL'}
                </button>
                <a
                  href={
                    supabaseProjectRef
                      ? `https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new`
                      : 'https://supabase.com/dashboard'
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="btn-purple-glow flex items-center gap-1.5 px-3.5 py-1 text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open SQL Editor
                </a>
              </div>
            </div>

            <pre className="p-3.5 rounded-2xl bg-[#080512] border border-purple-900/30 text-xs font-mono text-purple-300 overflow-x-auto max-h-48 scrollbar-thin">
              {SQL_SCHEMA_TEXT}
            </pre>
          </div>

          <div className="bg-[#080512] p-4 rounded-2xl border border-purple-900/30 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white text-xs">Run the SQL in Supabase?</p>
              <p className="text-xs text-zinc-400">Click below to check and synchronize tables with Supabase.</p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#140f26] hover:bg-[#1f173b] border border-purple-900/40 text-xs font-medium text-purple-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Checking...' : 'Check Connection'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-purple-900/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-medium rounded-xl bg-[#140f26] hover:bg-[#1f173b] text-zinc-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
