import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { UserProfile, UserRole } from '../types/inventory';
import { notifyEmail } from '../lib/notifications';

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
    const cachedUser = localStorage.getItem('cicr-active-user');
    const cachedProfile = localStorage.getItem('cicr-active-profile');
    if (cachedUser && cachedProfile) {
      const u = JSON.parse(cachedUser);
      const p = JSON.parse(cachedProfile);
      const isMasterAdmin = Boolean(
        u?.email &&
        ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(u.email.toLowerCase())
      );
      const isAdmin = isMasterAdmin || p.role === 'admin' || u.user_metadata?.role === 'admin';
      const isPending = p.status === 'pending' || p.avatar_url === 'status:pending' || u.user_metadata?.status === 'pending';
      const isRejected = p.status === 'rejected' || p.avatar_url === 'status:rejected' || u.user_metadata?.status === 'rejected';
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
  const initialAuth = getInitialAuth();
  const [user, setUser] = useState<User | null>(initialAuth.user);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(initialAuth.profile);
  const [loading, setLoading] = useState<boolean>(!initialAuth.user);

  const loadProfile = async (currentUser: User) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!error && data) {
        const rawStatus =
          data.status ||
          (data.avatar_url?.startsWith('status:') ? data.avatar_url.replace('status:', '') : '') ||
          currentUser.user_metadata?.status ||
          'approved';
        const resolvedProfile: UserProfile = {
          id: data.id,
          email: data.email || currentUser.email || '',
          full_name: data.full_name || currentUser.user_metadata?.full_name || 'Member',
          username: data.username || currentUser.user_metadata?.username || '',
          enrollment_no: data.roll_number || currentUser.user_metadata?.enrollment_no || '',
          roll_number: data.roll_number || currentUser.user_metadata?.enrollment_no || '',
          role: (data.role as UserRole) || (currentUser.user_metadata?.role as UserRole) || 'member',
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
    const fallbackProfile: UserProfile = {
      id: currentUser.id,
      email: currentUser.email || '',
      full_name: meta.full_name || currentUser.email?.split('@')[0] || 'Member',
      username: meta.username || '',
      enrollment_no: meta.enrollment_no || meta.roll_number || '',
      roll_number: meta.enrollment_no || meta.roll_number || '',
      role: (meta.role as UserRole) || 'member',
      status: (meta.status as 'pending' | 'approved' | 'rejected') || 'pending',
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
    const isMasterAdmin = Boolean(
      currentUser.email &&
        ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(
          currentUser.email.toLowerCase()
        )
    );
    if (isMasterAdmin || currentUser.user_metadata?.role === 'admin') {
      return { approved: true };
    }

    // 1. Check profiles table first
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role, status, avatar_url')
        .eq('id', currentUser.id)
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

    // 2. Check user metadata
    const metaStatus = currentUser.user_metadata?.status;
    if (metaStatus === 'pending') return { approved: false, reason: 'pending' };
    if (metaStatus === 'rejected') return { approved: false, reason: 'rejected' };
    if (metaStatus === 'approved') return { approved: true };

    // 3. Check activity_logs for unapproved requests
    try {
      const { data: logs } = await supabaseAdmin
        .from('activity_logs')
        .select('id, details')
        .eq('action', 'ACCOUNT_REQUEST')
        .eq('user_id', currentUser.id)
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

    return { approved: true };
  };

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1200)
        );
        const {
          data: { session },
        } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!mounted) return;

        const storedFallback = localStorage.getItem('neon-fallback-user');
        let fallbackUser: User | null = null;
        if (storedFallback) {
          try {
            fallbackUser = JSON.parse(storedFallback) as User;
          } catch {
            fallbackUser = null;
          }
        }
        const currentUser = session?.user ?? fallbackUser;

        if (currentUser) {
          const check = await checkUserApproval(currentUser);
          if (!check.approved) {
            await supabase.auth.signOut();
            localStorage.removeItem('cicr-active-user');
            localStorage.removeItem('cicr-active-profile');
            localStorage.removeItem('neon-fallback-user');
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
      if (!newSession?.user) {
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

        // Handle unconfirmed email automatically using service role admin
        if (res.error && res.error.message?.toLowerCase().includes('not confirmed')) {
          try {
            const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
            const target = usersData?.users?.find(
              (u) => u.email?.toLowerCase() === emailToAuth.toLowerCase()
            );
            if (target) {
              await supabaseAdmin.auth.admin.updateUserById(target.id, {
                email_confirm: true,
              });
              res = await supabase.auth.signInWithPassword({
                email: emailToAuth,
                password,
              });
            }
          } catch (adminErr) {
            console.warn('Auto-confirm attempt error:', adminErr);
          }
        }
      } catch (networkErr) {
        console.warn('Supabase sign-in network error:', networkErr);
        res = { data: null, error: networkErr };
      }

      // If Supabase failed or threw network error, attempt Neon failover
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
              setUser(fallbackUser);
              setSession(null);
              await loadProfile(fallbackUser);
              localStorage.setItem('neon-fallback-user', JSON.stringify(fallbackUser));
              await notifyEmail('login', fallbackUser.email, {
                name: fallbackUser.user_metadata?.full_name,
                email: fallbackUser.email,
                role: fallbackUser.user_metadata?.role,
              });
              return { success: true };
            }
          }
        } catch (fallbackErr) {
          console.warn('Neon auth failover error:', fallbackErr);
        }

        const errMsg = res.error?.message || (res.error instanceof Error ? res.error.message : String(res.error));
        if (typeof errMsg === 'string' && errMsg.toLowerCase().includes('failed to fetch')) {
          return {
            success: false,
            error: 'Authentication server connection timeout. Please check your internet connection or try again shortly.',
          };
        }
        return { success: false, error: errMsg || 'Invalid login credentials. Please verify your email and password.' };
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

          await supabaseAdmin.from('activity_logs').insert([
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
            role: profData?.role || res.data.user.user_metadata?.role,
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

      const isMasterAdminEmail = ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com'].includes(
        emailToRegister.toLowerCase()
      );
      const enforcedRole = isMasterAdminEmail ? 'admin' : 'member';
      const initialStatus = isMasterAdminEmail ? 'approved' : 'pending';
      // 0. Check if this email or roll number has already submitted a registration request
      try {
        const { data: existingProfiles } = await supabaseAdmin
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

        // Also check activity_logs to ensure no pending ACCOUNT_REQUEST exists
        const { data: existingLogs } = await supabaseAdmin
          .from('activity_logs')
          .select('id, details')
          .eq('action', 'ACCOUNT_REQUEST')
          .limit(50);

        for (const log of existingLogs || []) {
          let d: any = {};
          try {
            d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
          } catch {}
          if ((d?.email || '').toLowerCase().trim() === emailToRegister.toLowerCase().trim()) {
            if (d?.status !== 'approved' && d?.status !== 'rejected') {
              return {
                success: false,
                error: 'Your registration request has already been submitted and is awaiting administrator approval.',
              };
            }
          }
        }
      } catch (checkErr) {
        console.warn('Pre-registration check notice:', checkErr);
      }

      let registeredViaApi = false;
      try {
        const accountResponse = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'register',
            email: emailToRegister,
            password,
            full_name,
            enrollment_no,
            phone,
            role,
            avatar_url,
          }),
        });
        if (accountResponse.ok) {
          registeredViaApi = true;
        }
      } catch (apiErr) {
        console.warn('API register notice:', apiErr);
      }

      if (registeredViaApi) {
        return {
          success: true,
          message: 'Registration request submitted successfully! Check your email and wait for administrator approval.',
        };
      }

      // Seamless direct fallback
      let createdUserId: string | null = null;

      // 1. Attempt to create user in Supabase Auth via supabaseAdmin
      try {
        const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
          email: emailToRegister,
          password,
          email_confirm: true,
          user_metadata: {
            full_name,
            enrollment_no,
            phone,
            role: enforcedRole,
            status: initialStatus,
            avatar_url: avatar_url || undefined,
          },
        });
        if (!adminError && adminUser?.user) {
          createdUserId = adminUser.user.id;
        } else if (adminError) {
          console.warn('Notice from auth.admin.createUser:', adminError.message);
        }
      } catch (err) {
        console.warn('auth.admin.createUser warning:', err);
      }

      // 2. If auth user was created, upsert to profiles table
      if (createdUserId) {
        try {
          await supabaseAdmin.from('profiles').upsert([
            {
              id: createdUserId,
              full_name,
              email: emailToRegister,
              role: enforcedRole,
              status: initialStatus,
              roll_number: enrollment_no,
              phone,
              avatar_url: avatar_url || `status:${initialStatus}`,
            },
          ]);
        } catch (profileErr) {
          console.warn('Profile insert warning:', profileErr);
        }
      }

      // 3. ALWAYS insert ACCOUNT_REQUEST into activity_logs so the Admin Portal displays it
      await supabaseAdmin.from('activity_logs').insert([
        {
          user_id: createdUserId,
          user_name: full_name,
          action: 'ACCOUNT_REQUEST',
          details: JSON.stringify({
            userId: createdUserId,
            email: emailToRegister,
            fullName: full_name,
            enrollmentNo: enrollment_no,
            phone,
            role,
            status: initialStatus,
            avatar_url: avatar_url || undefined,
            created_at: new Date().toISOString(),
          }),
        },
      ]);
      await notifyEmail('account_created', emailToRegister, {
        name: full_name,
        email: emailToRegister,
        role,
        status: initialStatus,
      });

      return {
        success: true,
        message:
          'Registration request submitted successfully! Your account is pending admin approval in Admin Logs before you can log in.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: message };
    }
  };

  const approveUserAccount = async (targetId: string, email?: string) => {
    try {
      const isCallerAdmin =
        profile?.role === 'admin' ||
        user?.user_metadata?.role === 'admin' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(
              user.email.toLowerCase()
            )
        );
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      // 1. Call server API
      try {
        const response = await fetch('/api/accounts', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ action: 'approve', target_id: targetId, email }),
        });
        if (response.ok) {
          // If server API succeeded, all database records & logs are already updated!
          return { success: true };
        }
      } catch (apiErr) {
        console.warn('API approve notice:', apiErr);
      }

      // 2. Direct Supabase Fallback (executed in parallel)
      try {
        await Promise.all([
          supabaseAdmin
            .from('profiles')
            .update({ status: 'approved', avatar_url: 'status:approved', updated_at: new Date().toISOString() })
            .eq('id', targetId),
          email
            ? supabaseAdmin
                .from('profiles')
                .update({ status: 'approved', avatar_url: 'status:approved', updated_at: new Date().toISOString() })
                .ilike('email', email)
            : Promise.resolve(),
          supabaseAdmin.auth.admin.updateUserById(targetId, {
            email_confirm: true,
            user_metadata: { status: 'approved' },
          }).catch(() => {}),
        ]);
      } catch (fbErr) {
        console.warn('Fallback approve sync notice:', fbErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      return { success: false, error: msg };
    }
  };

  const rejectUserAccount = async (targetId: string, email?: string) => {
    try {
      const isCallerAdmin =
        profile?.role === 'admin' ||
        user?.user_metadata?.role === 'admin' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(
              user.email.toLowerCase()
            )
        );
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      // 1. Call server API
      try {
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
      } catch (apiErr) {
        console.warn('API reject notice:', apiErr);
      }

      // 2. Direct Supabase Fallback (executed in parallel)
      try {
        await Promise.all([
          supabaseAdmin
            .from('profiles')
            .update({ status: 'rejected', avatar_url: 'status:rejected', updated_at: new Date().toISOString() })
            .eq('id', targetId),
          email
            ? supabaseAdmin
                .from('profiles')
                .update({ status: 'rejected', avatar_url: 'status:rejected', updated_at: new Date().toISOString() })
                .ilike('email', email)
            : Promise.resolve(),
          supabaseAdmin.auth.admin.updateUserById(targetId, {
            user_metadata: { status: 'rejected' },
          }).catch(() => {}),
        ]);
      } catch (fbErr) {
        console.warn('Fallback reject sync notice:', fbErr);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed';
      return { success: false, error: msg };
    }
  };

  const updateUserRole = async (targetId: string, newRole: 'admin' | 'member') => {
    try {
      const isCallerAdmin =
        profile?.role === 'admin' ||
        user?.user_metadata?.role === 'admin' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(
              user.email.toLowerCase()
            )
        );
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      let apiSuccess = false;
      try {
        const response = await fetch('/api/accounts', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ action: 'role', target_id: targetId, role: newRole }),
        });
        if (response.ok) {
          apiSuccess = true;
        } else {
          const errData = await response.json().catch(() => ({}));
          if (errData?.error) {
            console.warn('API role update message:', errData.error);
          }
        }
      } catch (apiErr) {
        console.warn('API role update notice:', apiErr);
      }

      if (!apiSuccess) {
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .eq('id', targetId);
        if (profileError) throw profileError;

        try {
          await supabaseAdmin.auth.admin.updateUserById(targetId, {
            user_metadata: { role: newRole },
          });
        } catch {
          // Ignore admin auth update error on fallback
        }
      }

      return { success: true };
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
    try {
      if (user) {
        try {
          await supabaseAdmin.from('activity_logs').insert([
            {
              user_id: user.id,
              user_name:
                profile?.full_name ||
                user.user_metadata?.full_name ||
                user.email?.split('@')[0] ||
                'User',
              action: 'USER_SIGNOUT',
              details: `${
                profile?.full_name ||
                user.user_metadata?.full_name ||
                user.email?.split('@')[0] ||
                'User'
              } signed out of CICR Inventory Vault`,
            },
          ]);
        } catch (logErr) {
          console.warn('Sign-out log error:', logErr);
        }
        await notifyEmail('logout', user.email, {
          name: profile?.full_name || user.user_metadata?.full_name,
        });
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      localStorage.removeItem('cicr-active-user');
      localStorage.removeItem('cicr-active-profile');
      localStorage.removeItem('neon-fallback-user');
    }
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

  const isAdmin = profile?.role === 'admin' || user?.user_metadata?.role === 'admin';
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
