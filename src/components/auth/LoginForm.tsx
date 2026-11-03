import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { Lock, User, Key, Eye, EyeOff, LogIn, AlertCircle, Info } from 'lucide-react';
import { requestDeviceNotificationPermission, notifySignIn } from '../../utils/deviceNotification';

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

// Dedicated crisp circular CICR logo
const CicrLogo: React.FC<{ size?: number; className?: string }> = ({ size = 48, className = '' }) => (
  <div
    style={{ width: size, height: size }}
    className={`rounded-2xl overflow-hidden bg-white border-2 border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-center shrink-0 ${className}`}
  >
    <img
      src="/cicr-logo.jpg"
      alt="CICR Robotics Cell"
      className="w-full h-full object-cover"
      onError={(e) => {
        (e.target as HTMLElement).style.display = 'none';
      }}
    />
  </div>
);

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignup }) => {
  const { signIn } = useAuth();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    try {
      const reason = localStorage.getItem('cicr_session_expired_reason');
      if (reason === 'inactivity') {
        localStorage.removeItem('cicr_session_expired_reason');
        setErrorMsg('Your session expired due to 10 minutes of inactivity. Please sign in again to continue.');
      }
    } catch {}
  }, []);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Please enter both identifier and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signIn({ identifier: identifier.trim(), password });
      if (res.success) {
        showToast('success', 'Authenticated Successfully', 'Welcome back to CICR Inventory!');
        // Push outside the web to native device notification panel
        requestDeviceNotificationPermission().then(() => {
          notifySignIn(identifier.trim().split('@')[0]);
        }).catch(() => {});
      } else {
        setErrorMsg(res.error || 'Authentication failed. Please verify your credentials.');
      }
    } catch {
      setErrorMsg('Unable to connect to authentication server. Please retry in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[480px] bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-7 sm:p-8 shadow-2xl shadow-slate-900/10 relative overflow-hidden text-slate-900 dark:text-slate-100">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <CicrLogo size={64} className="mb-3" />
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">CICR Inventory</h1>
        <p className="text-[10px] tracking-[0.2em] font-bold text-slate-500 dark:text-zinc-400 uppercase mt-1">
          CREATIVE &amp; INNOVATIVE CELL IN ROBOTICS
        </p>
      </div>

      {/* Segmented Tab Switcher */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-[#120d22] border border-slate-200 dark:border-slate-800 mb-6">
        <button
          type="button"
          className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 dark:bg-purple-600 text-white font-bold text-xs shadow-sm transition-all cursor-default"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Sign In</span>
        </button>
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-bold text-xs transition-all cursor-pointer"
        >
          <User className="w-3.5 h-3.5" />
          <span>+ Register</span>
        </button>
      </div>

      {/* Status / Error Alert */}
      {errorMsg && (
        <div
          className={`mb-4 p-3.5 rounded-2xl border-2 text-xs font-medium flex items-start gap-2.5 animate-in fade-in ${
            errorMsg.toLowerCase().includes('admin portal') || errorMsg.toLowerCase().includes('pending') || errorMsg.toLowerCase().includes('inactivity')
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500/80 text-amber-900 dark:text-amber-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
          }`}
        >
          {errorMsg.toLowerCase().includes('admin portal') || errorMsg.toLowerCase().includes('pending') || errorMsg.toLowerCase().includes('inactivity') ? (
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 leading-relaxed">{errorMsg}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Identifier Field */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
            Email, Username, or Name
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter your name, email, or username"
              required
              autoFocus
              className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-purple-950/40 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 font-medium transition-all outline-none"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              Password
            </label>
            <button
              type="button"
              onClick={() => setForgotOpen(!forgotOpen)}
              className="text-[11px] font-semibold text-blue-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Key className="w-3 h-3" />
              <span>Forgot Password?</span>
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-purple-950/40 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 font-medium transition-all outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {forgotOpen && (
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#140f26] border border-slate-200 dark:border-zinc-800 text-[11px] text-slate-700 dark:text-zinc-300 animate-in fade-in">
            For password reset assistance, please contact the CICR administrator or re-register with your college email.
          </div>
        )}

        {/* Authenticate Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white shadow-md shadow-blue-600/25 dark:shadow-purple-950/40 flex items-center justify-center gap-2 mt-5 cursor-pointer disabled:opacity-50 transition-all active:scale-[0.99]"
        >
          <LogIn className="w-4 h-4" />
          <span>{isSubmitting ? 'Authenticating...' : 'Authenticate'}</span>
        </button>
      </form>

      {/* Footer Switcher */}
      <div className="text-center mt-6">
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="text-blue-600 dark:text-purple-400 hover:underline font-bold underline-offset-2 transition-colors ml-1"
          >
            Create Account
          </button>
        </p>
      </div>
    </div>
  );
};
