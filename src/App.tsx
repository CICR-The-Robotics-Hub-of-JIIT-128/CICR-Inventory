import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InventoryProvider } from './context/InventoryContext';
import { ToastProvider } from './components/common/Toast';
import { ThemeProvider } from './lib/theme/useTheme';
import { LoginForm } from './components/auth/LoginForm';
import { SignupForm } from './components/auth/SignupForm';
import { UserDashboard } from './components/dashboard/UserDashboard';
import { useInactivityTimeout } from './hooks/useInactivityTimeout';
import { RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Platform runtime error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    try {
      localStorage.removeItem('cicr-active-user');
      localStorage.removeItem('cicr-active-profile');
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#07070a] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#120d22] border-2 border-slate-200 dark:border-zinc-800 shadow-xl flex items-center justify-center mb-4">
            <img src="/cicr-logo.jpg" alt="CICR" className="w-12 h-12 object-cover rounded-xl" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">
            CICR Inventory Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mb-6">
            A temporary display sync anomaly occurred. Click below to refresh session telemetry.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95"
          >
            <RotateCw className="w-4 h-4" />
            <span>Reload Platform</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  useInactivityTimeout();
  const { user, profile, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const isApproved =
    user &&
    (profile?.role === 'admin' ||
      user.user_metadata?.role === 'admin' ||
      Boolean(
        user.email &&
          ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(
            user.email.toLowerCase()
          )
      ) ||
      (profile?.status !== 'pending' &&
        profile?.status !== 'rejected' &&
        profile?.avatar_url !== 'status:pending' &&
        profile?.avatar_url !== 'status:rejected' &&
        user.user_metadata?.status !== 'pending' &&
        user.user_metadata?.status !== 'rejected'));

  // If user is authenticated and authorized, show dashboard
  if (user && isApproved) {
    return <UserDashboard />;
  }

  // If auth is still checking on cold start without cached user, render sleek branded pulse
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#07070a] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white border border-slate-200 dark:border-slate-800 shadow-md p-1 animate-pulse">
            <img src="/cicr-logo.jpg" alt="CICR" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div className="w-4 h-4 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Genuinely unauthenticated: Show Login / Signup form
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#05030a] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-blue-600 selection:text-white relative overflow-hidden">
      <div className="w-full flex items-center justify-center relative z-10 animate-in fade-in duration-300">
        {authMode === 'login' ? (
          <LoginForm onSwitchToSignup={() => setAuthMode('signup')} />
        ) : (
          <SignupForm onSwitchToLogin={() => setAuthMode('login')} />
        )}
      </div>
    </div>
  );
};

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <InventoryProvider>
              <AppContent />
            </InventoryProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
