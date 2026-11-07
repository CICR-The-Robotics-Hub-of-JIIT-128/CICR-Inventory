import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole } from '../types/inventory';
import { notifyEmail } from '../lib/notifications';

export const MASTER_ADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com',
  'cicrinventoryofficial@gmail.com',
  '992501030399@mail.jiit.ac.in',
];

const safeParseJSON = <T,>(raw: string | null): T | null => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    if (raw.startsWith('cicr_vault_')) {
      const decoded = decodeURIComponent(atob(raw.slice(11)).split('').reverse().join(''));
      return JSON.parse(decoded) as T;
    }
    return JSON.parse(raw) as T;
  } catch {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
};

export interface SignUpData {
  email: string;
  password: string;
  full_name: string;
  enrollment_no?: string;
  phone?: string;
  role?: UserRole;
  avatar_url?: string;
  username?: string;
  academic_branch?: string;
}

export interface SignInData {
  identifier: string; // email, username, or enrollment number
  password: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isLeadOrAdmin: boolean;
  signIn: (data: SignInData) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signUp: (data: SignUpData) => Promise<{ success: boolean; error?: string; message?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  approveUserAccount: (userId: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  rejectUserAccount: (userId: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  updateUserRole: (userId: string, newRole: 'admin' | 'member') => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
}

const getInitialAuth = (): { user: User | null; profile: UserProfile | null } => {
  if (typeof window === 'undefined') return { user: null, profile: null };
  try {
    const rawUser = localStorage.getItem('cicr-active-user');
    const rawProfile = localStorage.getItem('cicr-active-profile');
    if (rawUser && rawProfile) {
      const u = safeParseJSON<User>(rawUser);
      const p = safeParseJSON<UserProfile>(rawProfile);
      if (!u || !p) return { user: null, profile: null };
      const email = (u?.email || '').toLowerCase();
      const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(email);
      // Hard security check: ONLY master admin emails can ever have admin role pre-loaded from localStorage
      if (!isMasterAdmin && p.role === 'admin') {
        p.role = 'member';
      }
      const isAdmin = isMasterAdmin || p.role === 'admin';
      const isPending = p.status === 'pending' || p.avatar_url === 'status:pending';
      const isRejected = p.status === 'rejected' || p.avatar_url === 'status:rejected';
      if (!isAdmin && (isPending || isRejected)) {
        localStorage.removeItem('cicr-active-user');
        localStorage.removeItem('cicr-active-profile');
        return { user: null, profile: null };
      }
      return { user: u, profile: p };
    }
  } catch {
    // ignore
  }
  return { user: null, profile: null };
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadProfile = async (currentUser: User) => {
    try {
      const email = (currentUser.email || '').toLowerCase().trim();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${currentUser.id},email.ilike.${email}`)
        .maybeSingle();

      if (!error && data) {
        const rawStatus =
          data.status ||
          (data.avatar_url?.startsWith('status:') ? data.avatar_url.replace('status:', '') : '') ||
          'approved';
        const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(email);
        const resolvedRole: UserRole = isMasterAdmin
          ? 'admin'
          : (data.role === 'admin' ? 'admin' : (data.role as UserRole) || 'member');
        const resolvedProfile: UserProfile = {
          id: data.id,
          email: data.email || currentUser.email || '',
          full_name: data.full_name || currentUser.user_metadata?.full_name || 'Member',
          username: data.username || currentUser.user_metadata?.username || '',
          enrollment_no: data.roll_number || currentUser.user_metadata?.enrollment_no || '',
          roll_number: data.roll_number || currentUser.user_metadata?.enrollment_no || '',
          role: resolvedRole,
          status: rawStatus as 'pending' | 'approved' | 'rejected',
          phone: data.phone || currentUser.user_metadata?.phone || '',
          avatar_url: data.avatar_url && !data.avatar_url.startsWith('status:') ? data.avatar_url : (currentUser.user_metadata?.avatar_url || ''),
          created_at: data.created_at || currentUser.created_at,
          last_sign_in: currentUser.last_sign_in_at,
        };
        setProfile(resolvedProfile);
        try {
          localStorage.setItem('cicr-active-user', JSON.stringify(currentUser));
          localStorage.setItem('cicr-active-profile', JSON.stringify(resolvedProfile));
        } catch {}
        return;
      }
    } catch {
      // ignore
    }

    const meta = currentUser.user_metadata || {};
    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes((currentUser.email || '').toLowerCase());
    const fallbackProfile: UserProfile = {
      id: currentUser.id,
      email: currentUser.email || '',
      full_name: meta.full_name || currentUser.email?.split('@')[0] || 'Member',
      username: meta.username || '',
      enrollment_no: meta.enrollment_no || meta.roll_number || '',
      roll_number: meta.enrollment_no || meta.roll_number || '',
      role: isMasterAdmin ? 'admin' : 'member',
      status: isMasterAdmin ? 'approved' : 'pending',
      phone: meta.phone || '',
      avatar_url: meta.avatar_url || '',
      created_at: currentUser.created_at,
      last_sign_in: currentUser.last_sign_in_at,
    };
    setProfile(fallbackProfile);
  };

  const checkUserApproval = async (
    currentUser: User
  ): Promise<{ approved: boolean; reason?: 'pending' | 'rejected' }> => {
    const email = (currentUser.email || '').toLowerCase().trim();
    const isMasterAdmin = MASTER_ADMIN_EMAILS.includes(email);
    if (isMasterAdmin) {
      return { approved: true };
    }

    // 1. Check profiles table first (by id or email)
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, status, avatar_url')
        .or(`id.eq.${currentUser.id},email.ilike.${email}`)
        .maybeSingle();

      if (prof) {
        if (prof.role === 'admin') return { approved: true };
        if (prof.status === 'approved' || prof.avatar_url === 'status:approved') {
          return { approved: true };
        }
        if (prof.status === 'pending' || prof.avatar_url === 'status:pending') {
          return { approved: false, reason: 'pending' };
        }
        if (prof.status === 'rejected' || prof.avatar_url === 'status:rejected') {
          return { approved: false, reason: 'rejected' };
        }
      }
    } catch (err) {
      console.warn('Profile approval check notice:', err);
    }

    // 2. Check user metadata status
    const metaStatus = currentUser.user_metadata?.status;
    if (metaStatus === 'pending') return { approved: false, reason: 'pending' };
    if (metaStatus === 'rejected') return { approved: false, reason: 'rejected' };
    if (metaStatus === 'approved') return { approved: true };

    // 3. Check activity_logs for unapproved requests
    try {
      const { data: logs } = await supabase
        .from('activity_logs')
        .select('id, details')
        .eq('action', 'ACCOUNT_REQUEST')
        .or(`user_id.eq.${currentUser.id},details->>email.ilike.${email}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (logs && logs.length > 0) {
        let details: any = logs[0].details;
        if (typeof details === 'string') {
          try {
            details = JSON.parse(details);
          } catch {}
        }
        if (details?.status === 'approved') return { approved: true };
        if (details?.status === 'rejected') return { approved: false, reason: 'rejected' };
        return { approved: false, reason: 'pending' };
      }
    } catch {}

    return { approved: false, reason: 'pending' };
  };

  useEffect(() => {
    let mounted = true;

    async function validateAndProvisionOAuthUser(u: User): Promise<{ allowed: boolean; error?: string }> {
      const email = (u.email || '').toLowerCase().trim();
      const isJiit = email.endsWith('@mail.jiit.ac.in') || email.endsWith('@jiit.ac.in');
      const isMaster = MASTER_ADMIN_EMAILS.includes(email);

      if (!isJiit && !isMaster) {
        return {
          allowed: false,
          error: 'Access Restricted: Only college email accounts (@mail.jiit.ac.in) are permitted to sign in.',
        };
      }

      // Check if user already exists in profiles table
      try {
        const { data: existingProf } = await supabase
          .from('profiles')
          .select('id, email, status, role')
          .or(`id.eq.${u.id},email.ilike.${email}`)
          .maybeSingle();

        if (!existingProf) {
          // Account is not registered in our database: create request and send to Admin Portal
          const meta = u.user_metadata || {};
          const fullName = meta.full_name || meta.name || email.split('@')[0];
          const avatarUrl = meta.avatar_url || meta.picture || '';
          const emailPrefix = email.split('@')[0];
          // Automatically fetch student enrollment number directly from college email ID (e.g. 992501030399@mail.jiit.ac.in -> 992501030399)
          const rollMatch = emailPrefix.match(/\d{6,}/) || emailPrefix.match(/\d+/);
          const rollNumber = rollMatch ? rollMatch[0] : emailPrefix;
          const initialStatus = isMaster ? 'approved' : 'pending';

          await supabase.from('profiles').upsert([{
            id: u.id,
            full_name: fullName,
            email,
            roll_number: rollNumber,
            role: isMaster ? 'admin' : 'member',
            status: initialStatus,
            avatar_url: avatarUrl || (isMaster ? 'status:approved' : 'status:pending'),
            updated_at: new Date().toISOString(),
          }]);

          await supabase.from('activity_logs').insert([{
            user_id: u.id,
            user_name: fullName,
            action: 'ACCOUNT_REQUEST',
            details: JSON.stringify({
              userId: u.id,
              email,
              fullName,
              enrollmentNo: rollNumber,
              role: isMaster ? 'admin' : 'member',
              status: initialStatus,
              auth_provider: 'google',
              created_at: new Date().toISOString(),
            }),
          }]);
        } else if (existingProf.id !== u.id) {
          // Sync existing record ID to OAuth UID if needed
          try {
            await supabase
              .from('profiles')
              .update({ id: u.id, updated_at: new Date().toISOString() })
              .eq('email', email);
          } catch {}
        }
      } catch (e) {
        console.warn('OAuth profile provisioning notice:', e);
      }

      return { allowed: true };
    }

    // Scrub sensitive OAuth tokens from the browser address bar immediately
    const cleanUrlHash = () => {
      if (
        typeof window !== 'undefined' &&
        window.location.hash &&
        (window.location.hash.includes('access_token=') ||
          window.location.hash.includes('refresh_token=') ||
          window.location.hash.includes('error='))
      ) {
        try {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch {}
      }
    };

    cleanUrlHash();

    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        // Clean tokens from URL bar right after Supabase extracts the session
        cleanUrlHash();

        const storedFallback = localStorage.getItem('neon-fallback-user');
        let fallbackUser: User | null = null;
        if (storedFallback) {
          try {
            fallbackUser = safeParseJSON<User>(storedFallback);
          } catch {
            fallbackUser = null;
          }
        }
        const currentUser = session?.user ?? fallbackUser;

        if (currentUser) {
          const oauthValidation = await validateAndProvisionOAuthUser(currentUser);
          if (!oauthValidation.allowed) {
            await supabase.auth.signOut();
            localStorage.removeItem('cicr-active-user');
            localStorage.removeItem('cicr-active-profile');
            localStorage.removeItem('neon-fallback-user');
            localStorage.setItem('cicr_auth_error', oauthValidation.error || 'Access Restricted: Only college email accounts (@mail.jiit.ac.in) are permitted.');
            setSession(null);
            setUser(null);
            setProfile(null);
            return;
          }

          const check = await checkUserApproval(currentUser);
          if (!check.approved) {
            await supabase.auth.signOut();
            localStorage.removeItem('cicr-active-user');
            localStorage.removeItem('cicr-active-profile');
            localStorage.removeItem('neon-fallback-user');

            if (check.reason === 'rejected') {
              localStorage.setItem('cicr_auth_error', 'Your account request was rejected by an administrator. Please contact the lab coordinator.');
            } else {
              localStorage.setItem('cicr_auth_error', 'Your account request has been sent to the Admin Portal. Please wait for an administrator to approve your account.');
            }

            setSession(null);
            setUser(null);
            setProfile(null);
            return;
          }
          setSession(session);
          setUser(currentUser);
          await loadProfile(currentUser);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Error initializing auth session:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      // Clean tokens from URL bar immediately when auth state change fires
      cleanUrlHash();

      if (!newSession?.user) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const oauthValidation = await validateAndProvisionOAuthUser(newSession.user);
      if (!oauthValidation.allowed) {
        await supabase.auth.signOut();
        localStorage.removeItem('cicr-active-user');
        localStorage.removeItem('cicr-active-profile');
        localStorage.setItem('cicr_auth_error', oauthValidation.error || 'Access Restricted: Only college email accounts (@mail.jiit.ac.in) are permitted.');
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // Check approval BEFORE granting access to User state (eliminates dashboard flickering)
      const check = await checkUserApproval(newSession.user);
      if (!check.approved) {
        await supabase.auth.signOut();
        localStorage.removeItem('cicr-active-user');
        localStorage.removeItem('cicr-active-profile');

        if (check.reason === 'rejected') {
          localStorage.setItem('cicr_auth_error', 'Your account request was rejected by an administrator. Please contact the lab coordinator.');
        } else {
          localStorage.setItem('cicr_auth_error', 'Your account request has been sent to the Admin Portal. Please wait for an administrator to approve your account.');
        }

        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(newSession);
      setUser(newSession.user);
      await loadProfile(newSession.user);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async ({ identifier, password }: SignInData) => {
    try {
      let emailToAuth = identifier.trim();

      if (!emailToAuth.includes('@')) {
        emailToAuth = `${emailToAuth.toLowerCase()}@mail.jiit.ac.in`;
      }

      let res: any = { data: null, error: null };
      try {
        const authRes = await supabase.auth.signInWithPassword({
          email: emailToAuth,
          password,
        });
        res = authRes;
      } catch (networkErr) {
        console.warn('Supabase sign-in network error:', networkErr);
        res = { data: null, error: networkErr };
      }

      // If Supabase direct browser connection failed, attempt resilient serverless auth failover via /api/auth
      if (res.error) {
        try {
          const fallback = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: emailToAuth, password }),
          });
          if (fallback.ok) {
            const fallbackData = await fallback.json();
            if (fallbackData?.user) {
              const fallbackUser = fallbackData.user as User;
              const check = await checkUserApproval(fallbackUser);
              if (!check.approved) {
                return {
                  success: false,
                  error:
                    check.reason === 'rejected'
                      ? 'Your account request was declined by an administrator. Please contact club leadership.'
                      : 'Your registration request has been sent to the Admin Portal. Please wait for an administrator to review and approve your account before signing in.',
                };
              }
              if (fallbackData.session) {
                try {
                  await supabase.auth.setSession(fallbackData.session);
                  setSession(fallbackData.session);
                } catch {
                  setSession(null);
                }
              } else {
                setSession(null);
              }
              setUser(fallbackUser);
              if (fallbackData.profile) {
                setProfile(fallbackData.profile);
                try {
                  localStorage.setItem('cicr-active-profile', JSON.stringify(fallbackData.profile));
                } catch {}
              } else {
                await loadProfile(fallbackUser);
              }
              try {
                localStorage.setItem('cicr-active-user', JSON.stringify(fallbackUser));
              } catch {}
              await notifyEmail('login', fallbackUser.email, {
                name: fallbackUser.user_metadata?.full_name,
                email: fallbackUser.email,
                role: fallbackData.profile?.role || 'member',
              });
              return { success: true };
            }
          } else if (fallback.status === 401) {
            const errJson = await fallback.json().catch(() => ({}));
            return {
              success: false,
              error: errJson.error || 'Invalid email or password. Please verify your credentials.',
            };
          }
        } catch (fallbackErr) {
          console.warn('Auth failover error:', fallbackErr);
        }

        const rawErrMsg = res.error?.message || (res.error instanceof Error ? res.error.message : String(res.error || ''));
        const lower = rawErrMsg.toLowerCase();

        // Cross-browser friendly normalization for network and protocol exceptions (Firefox, Safari, Edge, Chrome)
        if (
          lower.includes('content-length') ||
          lower.includes('failed to fetch') ||
          lower.includes('network') ||
          lower.includes('load failed') ||
          lower.includes('cors') ||
          lower.includes('null')
        ) {
          return {
            success: false,
            error: 'Authentication connection hiccup. Please check your network connection and retry.',
          };
        }

        if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
          return {
            success: false,
            error: 'Invalid email or password. Please verify your credentials.',
          };
        }

        return { success: false, error: rawErrMsg || 'Authentication failed. Please verify your credentials.' };
      }

      if (res.data.user) {
        const check = await checkUserApproval(res.data.user);
        if (!check.approved) {
          await supabase.auth.signOut();
          localStorage.removeItem('cicr-active-user');
          localStorage.removeItem('cicr-active-profile');
          setUser(null);
          setProfile(null);
          setSession(null);
          return {
            success: false,
            error:
              check.reason === 'rejected'
                ? 'Your account request was declined by an administrator. Please contact club leadership.'
                : 'Your registration request has been sent to the Admin Portal. Please wait for an administrator to review and approve your account before signing in.',
          };
        }

        setUser(res.data.user);
        setSession(res.data.session);
        await loadProfile(res.data.user);

        // Real-time log sign-in to activity_logs
        try {
          const { data: profData } = await supabase
            .from('profiles')
            .select('full_name, role')
            .eq('id', res.data.user.id)
            .maybeSingle();

          await supabase.from('activity_logs').insert([
            {
              user_id: res.data.user.id,
              user_name: profData?.full_name || res.data.user.user_metadata?.full_name || emailToAuth.split('@')[0],
              action: 'USER_SIGNIN',
              details: `${profData?.full_name || emailToAuth.split('@')[0]} signed in to CICR Inventory Vault`,
            },
          ]);

          await notifyEmail('login', res.data.user.email, {
            name: profData?.full_name || res.data.user.user_metadata?.full_name,
            email: res.data.user.email,
            role: profData?.role || 'member',
          });
        } catch (logErr) {
          console.warn('Sign-in log error:', logErr);
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { success: false, error: message };
    }
  };

  const signInWithGoogle = async () => {
    try {
      localStorage.removeItem('cicr_auth_error');
      const origin =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin.replace(/\/$/, '')
          : 'https://cicr-inventory.vercel.app';
      const redirectUrl = origin.includes('localhost') || origin.includes('127.0.0.1')
        ? origin
        : 'https://cicr-inventory.vercel.app';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            hd: 'mail.jiit.ac.in',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in initiation failed.';
      if (msg.toLowerCase().includes('not enabled') || msg.toLowerCase().includes('validation_failed')) {
        return {
          success: false,
          error: 'Google Sign-In is awaiting Google OAuth activation in Supabase Dashboard. Please sign in with your email & password in the meantime.',
        };
      }
      return { success: false, error: msg };
    }
  };

  const signUp = async ({
    email,
    password,
    full_name,
    enrollment_no = '',
    phone = '',
    role = 'member',
    avatar_url = '',
  }: SignUpData) => {
    try {
      let emailToRegister = email.trim();
      if (!emailToRegister.includes('@')) {
        emailToRegister = `${emailToRegister.toLowerCase()}@mail.jiit.ac.in`;
      }

      // Automatically fetch student enrollment number directly from college email ID (e.g. 992501030399@mail.jiit.ac.in -> 992501030399)
      const emailPrefix = emailToRegister.split('@')[0];
      const rollMatch = emailPrefix.match(/\d{6,}/) || emailPrefix.match(/\d+/);
      const effectiveEnrollmentNo = enrollment_no?.trim() || (rollMatch ? rollMatch[0] : emailPrefix);

      const isMasterAdminEmail = MASTER_ADMIN_EMAILS.includes(emailToRegister.toLowerCase());
      const enforcedRole = isMasterAdminEmail ? 'admin' : 'member';
      const initialStatus = isMasterAdminEmail ? 'approved' : 'pending';

      // 0. Pre-registration check via supabase client
      try {
        const { data: existingProfiles } = await supabase
          .from('profiles')
          .select('id, email, status, roll_number')
          .ilike('email', emailToRegister)
          .limit(1);

        if (existingProfiles && existingProfiles.length > 0) {
          const ep = existingProfiles[0];
          if (ep.status === 'pending') {
            return {
              success: false,
              error: 'A registration request for this college email has already been submitted and is awaiting administrator approval.',
            };
          }
          return {
            success: false,
            error: 'An account with this college email already exists. Please sign in.',
          };
        }
      } catch (checkErr) {
        console.warn('Pre-registration check notice:', checkErr);
      }

      // Call serverless API
      try {
        const accountResponse = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'register',
            email: emailToRegister,
            password,
            full_name,
            enrollment_no: effectiveEnrollmentNo,
            phone,
            role: enforcedRole,
            avatar_url,
          }),
        });

        if (accountResponse.ok) {
          const respData = await accountResponse.json().catch(() => ({}));
          return {
            success: true,
            message: respData.message || 'Registration request submitted successfully! Check your email and wait for administrator approval.',
          };
        } else {
          const errData = await accountResponse.json().catch(() => ({}));
          const errMsg = typeof errData?.error === 'string' ? errData.error : '';
          // If it is a clear validation conflict (account already exists, weak password, etc.)
          if (
            errMsg.includes('already exists') ||
            errMsg.includes('already been submitted') ||
            errMsg.includes('Password should be') ||
            errMsg.includes('valid email')
          ) {
            return {
              success: false,
              error: errMsg,
            };
          }
          console.warn('API /api/accounts returned error status (' + accountResponse.status + '), activating resilient direct Supabase registration fallback...');
        }
      } catch (apiErr) {
        console.warn('API register notice, activating resilient direct Supabase registration fallback:', apiErr);
      }

      // Direct fallback using standard supabase.auth.signUp (no admin key required)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailToRegister,
        password,
        options: {
          data: {
            full_name,
            enrollment_no: effectiveEnrollmentNo,
            phone,
            role: enforcedRole,
            status: initialStatus,
            avatar_url: avatar_url || undefined,
          },
        },
      });

      if (authError) {
        const raw = authError.message || '';
        if (raw.toLowerCase().includes('already registered')) {
          return {
            success: false,
            error: 'An account with this college email already exists. Please sign in.',
          };
        }
        return { success: false, error: raw || 'Registration failed. Please verify your details and retry.' };
      }

      if (authData.user) {
        await supabase.from('profiles').upsert([
          {
            id: authData.user.id,
            full_name,
            email: emailToRegister,
            role: enforcedRole,
            status: initialStatus,
            roll_number: effectiveEnrollmentNo,
            phone,
            avatar_url: avatar_url || `status:${initialStatus}`,
          },
        ]);
        await supabase.from('activity_logs').insert([
          {
            user_id: authData.user.id,
            user_name: full_name,
            action: 'ACCOUNT_REQUEST',
            details: JSON.stringify({
              userId: authData.user.id,
              email: emailToRegister,
              fullName: full_name,
              enrollmentNo: effectiveEnrollmentNo,
              phone,
              role: enforcedRole,
              status: initialStatus,
              avatar_url: avatar_url || undefined,
              created_at: new Date().toISOString(),
            }),
          },
        ]);
      }

      return {
        success: true,
        message: 'Registration request submitted successfully! Check your email and wait for administrator approval.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: message };
    }
  };

  const approveUserAccount = async (targetId: string, email?: string) => {
    try {
      const isCallerAdmin =
        MASTER_ADMIN_EMAILS.includes((user?.email || '').toLowerCase()) ||
        profile?.role === 'admin';
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'approve', target_id: targetId, email }),
      });
      if (response.ok) {
        return { success: true };
      }
      // If server returns error, execute direct fallback
      const { error: profError } = await supabase
        .from('profiles')
        .update({ status: 'approved', avatar_url: 'status:approved', updated_at: new Date().toISOString() })
        .match(email ? { email } : { id: targetId });
      if (!profError) {
        return { success: true };
      }
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Approval failed.' };
    } catch {
      // Network failure fallback
      try {
        const { error: profError } = await supabase
          .from('profiles')
          .update({ status: 'approved', avatar_url: 'status:approved', updated_at: new Date().toISOString() })
          .match(email ? { email } : { id: targetId });
        if (!profError) return { success: true };
      } catch {}
      return { success: false, error: 'Approval failed.' };
    }
  };

  const rejectUserAccount = async (targetId: string, email?: string) => {
    try {
      const isCallerAdmin =
        MASTER_ADMIN_EMAILS.includes((user?.email || '').toLowerCase()) ||
        profile?.role === 'admin';
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'reject', target_id: targetId, email }),
      });
      if (response.ok) {
        return { success: true };
      }
      // If server returns error, execute direct fallback
      const { error: profError } = await supabase
        .from('profiles')
        .upsert([{
          id: targetId,
          ...(email ? { email } : {}),
          status: 'rejected',
          avatar_url: 'status:rejected',
          updated_at: new Date().toISOString(),
        }]);
      if (!profError) {
        return { success: true };
      }
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Rejection failed.' };
    } catch {
      // Network failure fallback
      try {
        const { error: profError } = await supabase
          .from('profiles')
          .upsert([{
            id: targetId,
            ...(email ? { email } : {}),
            status: 'rejected',
            avatar_url: 'status:rejected',
            updated_at: new Date().toISOString(),
          }]);
        if (!profError) return { success: true };
      } catch {}
      return { success: false, error: 'Rejection failed.' };
    }
  };

  const updateUserRole = async (targetId: string, newRole: 'admin' | 'member') => {
    try {
      const isCallerAdmin =
        MASTER_ADMIN_EMAILS.includes((user?.email || '').toLowerCase()) ||
        profile?.role === 'admin';
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'role', target_id: targetId, role: newRole }),
      });
      if (response.ok) {
        return { success: true };
      }
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Role update failed.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Role update failed';
      return { success: false, error: msg };
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.full_name !== undefined) updateData.full_name = updates.full_name;
      if (updates.roll_number !== undefined) updateData.roll_number = updates.roll_number;
      if (updates.phone !== undefined) updateData.phone = updates.phone;
      if (updates.avatar_url !== undefined) updateData.avatar_url = updates.avatar_url;

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) {
        return { success: false, error: error.message };
      }

      await supabase.auth.updateUser({
        data: {
          ...(updates.full_name !== undefined ? { full_name: updates.full_name } : {}),
          ...(updates.roll_number !== undefined ? { enrollment_no: updates.roll_number } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url } : {}),
        },
      });

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      return { success: false, error: msg };
    }
  };

  const signOut = async () => {
    // 1. Instantly (0ms) clear local state & storage so UI immediately returns to Login screen
    const userToLog = user;
    const profileToLog = profile;

    setUser(null);
    setSession(null);
    setProfile(null);
    localStorage.removeItem('cicr-active-user');
    localStorage.removeItem('cicr-active-profile');
    localStorage.removeItem('neon-fallback-user');
    localStorage.removeItem('cicr-cached-logs');
    localStorage.removeItem('cicr-cached-members');
    localStorage.removeItem('cicr-cached-pending-accounts');

    // 2. Perform Supabase session invalidation and audit logging asynchronously in the background (non-blocking)
    (async () => {
      try {
        await supabase.auth.signOut();
        if (userToLog) {
          await supabase.from('activity_logs').insert([
            {
              user_id: userToLog.id,
              user_name:
                profileToLog?.full_name ||
                userToLog.user_metadata?.full_name ||
                userToLog.email?.split('@')[0] ||
                'User',
              action: 'USER_SIGNOUT',
              details: `${
                profileToLog?.full_name ||
                userToLog.user_metadata?.full_name ||
                userToLog.email?.split('@')[0] ||
                'User'
              } signed out of CICR Inventory Vault`,
            },
          ]);
        }
      } catch (err) {
        console.warn('Background sign out error:', err);
      }
    })();
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password update failed';
      return { success: false, error: msg };
    }
  };

  // Anti-tampering listener: instantly revert any console modifications to localStorage role
  useEffect(() => {
    const handleStorage = () => {
      try {
        const raw = localStorage.getItem('cicr-active-profile');
        if (raw && user) {
          const p = safeParseJSON<UserProfile>(raw);
          if (!p) return;
          const email = (user.email || '').toLowerCase();
          const isMaster = MASTER_ADMIN_EMAILS.includes(email);
          if (p.role === 'admin' && !isMaster && profile?.role !== 'admin') {
            console.warn('[Security] Unauthorized role escalation detected in localStorage. Reverting.');
            p.role = 'member';
            localStorage.setItem('cicr-active-profile', JSON.stringify(p));
            setProfile(p);
          }
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user, profile]);

  const isMasterAdmin = MASTER_ADMIN_EMAILS.includes((user?.email || '').toLowerCase());
  const isAdmin = Boolean(isMasterAdmin || profile?.role === 'admin');
  const isLeadOrAdmin = isAdmin || profile?.role === 'lead';

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        isAdmin,
        isLeadOrAdmin,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
        updateProfile,
        refreshProfile,
        approveUserAccount,
        rejectUserAccount,
        updateUserRole,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
