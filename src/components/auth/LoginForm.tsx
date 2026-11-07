import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, Info } from 'lucide-react';

interface LoginFormProps {
  onSwitchToSignup?: () => void;
}

// Dedicated crisp circular CICR logo
const CicrLogo: React.FC<{ size?: number; className?: string }> = ({ size = 64, className = '' }) => (
  <div
    style={{ width: size, height: size }}
    className={`rounded-3xl overflow-hidden bg-white border-2 border-slate-200 dark:border-purple-900/60 shadow-xl shadow-purple-900/20 flex items-center justify-center shrink-0 ${className}`}
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

export const LoginForm: React.FC<LoginFormProps> = () => {
  const { signInWithGoogle } = useAuth();
  const [errorMsg, setErrorMsg] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    try {
      const authErr = localStorage.getItem('cicr_auth_error');
      if (authErr) {
        localStorage.removeItem('cicr_auth_error');
        setErrorMsg(authErr);
        return;
      }

      const reason = localStorage.getItem('cicr_session_expired_reason');
      if (reason === 'inactivity') {
        localStorage.removeItem('cicr_session_expired_reason');
        setErrorMsg('Your session expired due to 10 minutes of inactivity. Please sign in again to continue.');
      }
    } catch {}
  }, []);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setIsGoogleLoading(true);
    try {
      const res = await signInWithGoogle();
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    } catch {
      setErrorMsg('Failed to connect to Google authentication. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-purple-950/70 rounded-3xl p-8 sm:p-9 shadow-2xl shadow-purple-950/20 relative overflow-hidden text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-300">
      {/* Decorative ambient background blur */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/10 dark:bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/10 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-7 relative z-10">
        <CicrLogo size={68} className="mb-3.5" />
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          CICR Inventory
        </h1>
        <p className="text-[10px] tracking-[0.25em] font-extrabold text-slate-500 dark:text-zinc-400 uppercase mt-1">
          CREATIVE &amp; INNOVATIVE CELL IN ROBOTICS
        </p>
      </div>

      {/* Status / Error Alert */}
      {errorMsg && (
        <div
          className={`mb-6 p-4 rounded-2xl border-2 text-xs font-medium flex items-start gap-3 animate-in fade-in duration-200 relative z-10 ${
            errorMsg.toLowerCase().includes('admin portal') ||
            errorMsg.toLowerCase().includes('pending') ||
            errorMsg.toLowerCase().includes('inactivity')
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500/80 text-amber-900 dark:text-amber-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
          }`}
        >
          {errorMsg.toLowerCase().includes('admin portal') ||
          errorMsg.toLowerCase().includes('pending') ||
          errorMsg.toLowerCase().includes('inactivity') ? (
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 leading-relaxed text-left">{errorMsg}</div>
        </div>
      )}

      {/* Google Sign-On Button */}
      <div className="relative z-10">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-purple-600 dark:hover:bg-purple-500 text-white font-bold text-sm shadow-lg shadow-purple-950/30 hover:shadow-xl transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
        >
          <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 p-0.5 shadow-sm">
            <svg className="w-full h-full" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </div>
          <span className="tracking-wide">
            {isGoogleLoading ? 'Connecting to Google...' : 'Sign in with Google Account'}
          </span>
        </button>
      </div>
    </div>
  );
};
