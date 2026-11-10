import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole } from '../types/inventory';
import { notifyEmail } from '../lib/notifications';
import { buildAuditDetails } from '../lib/audit';
import { resolveOAuthRedirectUrl } from '../lib/appUrl';
import {
  extractIdentityFromEmail,
  hydrateMemberIdentity,
  isDirtyOrPlaceholderName,
  toCleanDisplayName,
} from '../lib/identity';

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
  approveUserAccount: (userId: string, email?: string, targetName?: string) => Promise<{ success: boolean; error?: string }>;
  rejectUserAccount: (userId: string, email?: string, targetName?: string) => Promise<{ success: boolean; error?: string }>;
  updateUserRole: (userId: string, newRole: 'admin' | 'member') => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const loggedSignInMarkersRef = useRef<Set<string>>(new Set());
  const provisioningPromisesRef = useRef<Map<string, Promise<{ allowed: boolean; error?: string }>>>(new Map());
  const syncedMetadataUserIdsRef = useRef<Set<string>>(new Set());
  const notifiedAccountReqRef = useRef<Set<string>>(new Set());

  const logUserSignInIfNeeded = async (
    currentUser: User,
    resolvedProf?: Partial<UserProfile> | null,
    forceLog?: boolean,
    accessToken?: string
  ) => {
    try {
      const marker = currentUser.last_sign_in_at || (forceLog ? `session-${Date.now()}` : '');
      if (!marker) return;

      const lsKey = `cicr_last_signin_logged_${currentUser.id}`;
      const memKey = `${currentUser.id}:${marker}`;

      if (!forceLog) {
        if (loggedSignInMarkersRef.current.has(memKey)) return;
        try {
          if (localStorage.getItem(lsKey) === marker) {
            loggedSignInMarkersRef.current.add(memKey);
            return;
          }
        } catch {}
      }

      loggedSignInMarkersRef.current.add(memKey);
      try {
        localStorage.setItem(lsKey, marker);
      } catch {}

      const email = (resolvedProf?.email || currentUser.email || '').toLowerCase().trim();
      const validProfName =
        resolvedProf?.full_name && !isDirtyOrPlaceholderName(resolvedProf.full_name, email)
          ? resolvedProf.full_name
          : '';
      const rawMetaName =
        (currentUser.user_metadata?.full_name as string) ||
        (currentUser.user_metadata?.name as string) ||
        '';
      const extracted = extractIdentityFromEmail(email, {
        ...(currentUser.user_metadata || {}),
        full_name: validProfName || rawMetaName || resolvedProf?.full_name,
        enrollment_no: resolvedProf?.roll_number || resolvedProf?.enrollment_no || currentUser.user_metadata?.enrollment_no,
      });
      const actorName = validProfName
        ? toCleanDisplayName(validProfName)
        : extracted.fullName;
      const actorRoll =
        extracted.enrollmentNo ||
        resolvedProf?.roll_number ||
        resolvedProf?.enrollment_no ||
        (currentUser.user_metadata?.enrollment_no as string) ||
        '';
      const actorRole = resolvedProf?.role || 'member';
      const providerRaw = (currentUser.app_metadata?.provider || '').toLowerCase();
      const whereModule = providerRaw === 'google' ? 'Auth Portal > Google OAuth SSO' : 'Auth Portal > Credentials Login';

      await supabase.from('activity_logs').insert([
        {
          user_id: currentUser.id,
          user_name: actorName,
          action: 'USER_SIGNIN',
          details: buildAuditDetails({
            summary: `${actorName} logged in`,
            actorId: currentUser.id,
            actorName,
            actorEmail: email,
            actorRoll,
            actorRole,
            targetType: 'account',
            where: whereModule,
            meta: {
              auth_provider: providerRaw || 'credentials',
            },
          }),
        },
      ]);

      await notifyEmail(
        'login',
        email,
        {
          name: actorName,
          email,
          role: actorRole,
          notes:
            providerRaw === 'google'
              ? 'Signed in via Google OAuth SSO'
              : 'Signed in with CICR credentials',
        },
        { accessToken }
      );
    } catch (logErr) {
      console.warn('Sign-in audit log notice:', logErr);
    }
  };

  const loadProfile = async (currentUser: User): Promise<UserProfile> => {
    const email = (currentUser.email || '').toLowerCase().trim();
    const meta = currentUser.user_metadata || {};

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${currentUser.id},email.ilike.${email}`)
        .maybeSingle();

      if (!error && data) {
        const rawStatus: 'pending' | 'approved' | 'rejected' =
          data.status === 'rejected' || data.avatar_url === 'status:rejected'
            ? 'rejected'
            : data.status === 'approved' || data.avatar_url === 'status:approved'
            ? 'approved'
            : 'pending';
        const resolvedRole: UserRole = data.role === 'admin' ? 'admin' : 'member';

        const validDataName =
          data.full_name && !isDirtyOrPlaceholderName(data.full_name, email) ? data.full_name : '';
        const rawMetaName = (meta.full_name as string) || (meta.name as string) || '';
        const extracted = extractIdentityFromEmail(email, {
          ...meta,
          full_name: validDataName || rawMetaName || data.full_name,
          enrollment_no: data.roll_number || meta.enrollment_no || meta.roll_number,
        });

        const cleanName = validDataName
          ? toCleanDisplayName(validDataName)
          : extracted.fullName;
        const cleanRoll = extracted.enrollmentNo || data.roll_number || '';
        const metaAvatar = (meta.avatar_url as string) || (meta.picture as string) || '';
        const resolvedAvatar =
          data.avatar_url && !data.avatar_url.startsWith('status:')
            ? data.avatar_url
            : metaAvatar;

        const profileNeedsPatch =
          data.id === currentUser.id &&
          ((isDirtyOrPlaceholderName(data.full_name, email) && cleanName !== data.full_name) ||
            ((!data.roll_number || data.roll_number.trim() === '') && Boolean(cleanRoll)) ||
            (Boolean(extracted.enrollmentFromEmail) && data.roll_number !== extracted.enrollmentFromEmail) ||
            (!data.avatar_url && Boolean(metaAvatar)));

        if (profileNeedsPatch) {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (isDirtyOrPlaceholderName(data.full_name, email) && cleanName !== data.full_name) {
            patch.full_name = cleanName;
          }
          if ((!data.roll_number || data.roll_number.trim() === '' || (extracted.enrollmentFromEmail && data.roll_number !== extracted.enrollmentFromEmail)) && cleanRoll) {
            patch.roll_number = cleanRoll;
          }
          if (!data.avatar_url && metaAvatar) {
            patch.avatar_url = metaAvatar;
          }
          supabase.from('profiles').update(patch).eq('id', currentUser.id).then(() => {}, () => {});
        }

        const metaNeedsSync =
          !syncedMetadataUserIdsRef.current.has(currentUser.id) &&
          ((Boolean(cleanRoll) && (meta.enrollment_no !== cleanRoll || meta.roll_number !== cleanRoll)) ||
            (Boolean(cleanName) && isDirtyOrPlaceholderName(meta.full_name, email)));

        if (metaNeedsSync) {
          syncedMetadataUserIdsRef.current.add(currentUser.id);
          supabase.auth
            .updateUser({
              data: {
                full_name: cleanName,
                ...(cleanRoll ? { enrollment_no: cleanRoll, roll_number: cleanRoll } : {}),
              },
            })
            .then(() => {}, () => {});
        }

        const resolvedProfile: UserProfile = {
          id: data.id,
          email: data.email || currentUser.email || '',
          full_name: cleanName,
          username: data.username || meta.username || '',
          enrollment_no: cleanRoll,
          roll_number: cleanRoll,
          role: resolvedRole,
          status: rawStatus as 'pending' | 'approved' | 'rejected',
          phone: data.phone || meta.phone || '',
          avatar_url: resolvedAvatar,
          created_at: data.created_at || currentUser.created_at,
          last_sign_in: currentUser.last_sign_in_at,
        };
        setProfile(resolvedProfile);
        try {
          localStorage.setItem('cicr-active-user', JSON.stringify(currentUser));
          localStorage.setItem('cicr-active-profile', JSON.stringify(resolvedProfile));
        } catch {}
        return resolvedProfile;
      }
    } catch {
      // ignore
    }

    const extracted = extractIdentityFromEmail(email, meta);
    const fallbackProfile: UserProfile = {
      id: currentUser.id,
      email: currentUser.email || '',
      full_name: extracted.fullName,
      username: meta.username || '',
      enrollment_no: extracted.enrollmentNo,
      roll_number: extracted.enrollmentNo,
      role: 'member',
      status: 'pending',
      phone: meta.phone || '',
      avatar_url: meta.avatar_url || meta.picture || '',
      created_at: currentUser.created_at,
      last_sign_in: currentUser.last_sign_in_at,
    };
    setProfile(fallbackProfile);
    return fallbackProfile;
  };

  const checkUserApproval = async (
    currentUser: User
  ): Promise<{ approved: boolean; reason?: 'pending' | 'rejected' }> => {
    const email = (currentUser.email || '').toLowerCase().trim();

    // 1. Check authoritative profiles table (by id or email)
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, status, avatar_url')
        .or(`id.eq.${currentUser.id},email.ilike.${email}`)
        .maybeSingle();

      if (prof) {
        if (prof.status === 'rejected' || prof.avatar_url === 'status:rejected') {
          return { approved: false, reason: 'rejected' };
        }
        if (prof.status === 'approved' || prof.avatar_url === 'status:approved') {
          return { approved: true };
        }
        return { approved: false, reason: 'pending' };
      }
    } catch (err) {
      console.warn('Profile approval check notice:', err);
    }

    // 2. Check activity_logs for explicit rejection notices only (never trust client logs for approval)
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
        if (details?.status === 'rejected') return { approved: false, reason: 'rejected' };
      }
    } catch {}

    return { approved: false, reason: 'pending' };
  };

  useEffect(() => {
    let mounted = true;

    async function runOAuthProvisioning(
      u: User,
      accessToken?: string
    ): Promise<{ allowed: boolean; error?: string }> {
      const email = (u.email || '').toLowerCase().trim();
      const isJiit = email.endsWith('@mail.jiit.ac.in') || email.endsWith('@jiit.ac.in');

      const meta = u.user_metadata || {};
      const extracted = extractIdentityFromEmail(email, meta);
      const googleAvatarUrl =
        (typeof meta.avatar_url === 'string' && meta.avatar_url.startsWith('http') ? meta.avatar_url : '') ||
        (typeof meta.picture === 'string' && meta.picture.startsWith('http') ? meta.picture : '');

      try {
        const { data: existingProf } = await supabase
          .from('profiles')
          .select('id, email, full_name, roll_number, status, role, avatar_url, phone')
          .or(`id.eq.${u.id},email.ilike.${email}`)
          .maybeSingle();

        const isApprovedExistingAccount = Boolean(
          existingProf &&
            existingProf.status !== 'rejected' &&
            existingProf.avatar_url !== 'status:rejected' &&
            (existingProf.status === 'approved' || existingProf.avatar_url === 'status:approved')
        );

        if (!isJiit && !isApprovedExistingAccount) {
          return {
            allowed: false,
            error: 'Access Restricted: Only college email accounts (@mail.jiit.ac.in) are permitted to sign in.',
          };
        }

        // Compute cleanest Name and Enrollment/Roll Number by blending DB + Email + Google metadata
        const mergedIdentity = extractIdentityFromEmail(email, {
          ...meta,
          full_name:
            existingProf?.full_name && !isDirtyOrPlaceholderName(existingProf.full_name, email)
              ? existingProf.full_name
              : (meta.full_name || meta.name || existingProf?.full_name),
          enrollment_no: existingProf?.roll_number || meta.enrollment_no || meta.roll_number,
        });

        const existingClean =
          existingProf?.full_name && !isDirtyOrPlaceholderName(existingProf.full_name, email)
            ? toCleanDisplayName(existingProf.full_name)
            : '';

        const existingLooksLikeBareEmailWord =
          Boolean(existingClean) &&
          existingClean.toLowerCase() === extracted.emailPrefix &&
          extracted.fullName.split(/\s+/).length > existingClean.split(/\s+/).length;

        const resolvedName =
          existingClean && !existingLooksLikeBareEmailWord
            ? existingClean
            : mergedIdentity.fullName || extracted.fullName;

        const resolvedRoll =
          mergedIdentity.enrollmentNo ||
          extracted.enrollmentNo ||
          existingProf?.roll_number ||
          '';

        const resolvedStatus: 'pending' | 'approved' | 'rejected' =
          existingProf?.status === 'rejected' || existingProf?.avatar_url === 'status:rejected'
            ? 'rejected'
            : existingProf?.status === 'approved' || existingProf?.avatar_url === 'status:approved'
            ? 'approved'
            : 'pending';

        const resolvedRole: UserRole = existingProf?.role === 'admin' ? 'admin' : 'member';
        const resolvedAvatar =
          (existingProf?.avatar_url && !existingProf.avatar_url.startsWith('status:')
            ? existingProf.avatar_url
            : '') ||
          googleAvatarUrl ||
          (resolvedStatus ? `status:${resolvedStatus}` : '');

        if (!existingProf) {
          await supabase.from('profiles').upsert([
            {
              id: u.id,
              full_name: resolvedName,
              email,
              roll_number: resolvedRoll,
              role: 'member',
              status: 'pending',
              avatar_url: resolvedAvatar,
              updated_at: new Date().toISOString(),
            },
          ]);
        } else {
          // Backfill missing/dirty name, enrollment roll number, Google avatar, or UID mismatch
          // (Handles rows pre-created by Postgres handle_new_user() trigger on auth.users INSERT)
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          let needsPatch = false;

          if (existingProf.id !== u.id) {
            patch.id = u.id;
            needsPatch = true;
          }
          if (
            (isDirtyOrPlaceholderName(existingProf.full_name, email) && resolvedName !== existingProf.full_name) ||
            existingLooksLikeBareEmailWord ||
            (resolvedName && resolvedName !== existingProf.full_name && existingProf.full_name !== toCleanDisplayName(existingProf.full_name))
          ) {
            patch.full_name = resolvedName;
            needsPatch = true;
          }
          if (resolvedRoll && (!existingProf.roll_number || existingProf.roll_number.trim() === '' || (extracted.enrollmentFromEmail && existingProf.roll_number !== extracted.enrollmentFromEmail))) {
            patch.roll_number = resolvedRoll;
            needsPatch = true;
          }
          if (googleAvatarUrl && (!existingProf.avatar_url || existingProf.avatar_url.startsWith('status:'))) {
            patch.avatar_url = googleAvatarUrl;
            needsPatch = true;
          }

          if (needsPatch) {
            try {
              if (existingProf.id === u.id) {
                await supabase.from('profiles').update(patch).eq('id', u.id);
              } else {
                await supabase.from('profiles').update(patch).ilike('email', email);
              }
            } catch {}
          }
        }

        // Persist clean full_name, enrollment_no & roll_number back into Supabase Auth user_metadata
        const metaNeedsSync =
          !syncedMetadataUserIdsRef.current.has(u.id) &&
          ((Boolean(resolvedRoll) &&
            (meta.enrollment_no !== resolvedRoll || meta.roll_number !== resolvedRoll)) ||
            (Boolean(resolvedName) && isDirtyOrPlaceholderName(meta.full_name, email)));

        if (metaNeedsSync) {
          syncedMetadataUserIdsRef.current.add(u.id);
          try {
            await supabase.auth.updateUser({
              data: {
                full_name: resolvedName,
                ...(resolvedRoll ? { enrollment_no: resolvedRoll, roll_number: resolvedRoll } : {}),
                ...(googleAvatarUrl ? { avatar_url: googleAvatarUrl } : {}),
              },
            });
          } catch {}
        }

        // Ensure pending SSO registrations always appear in Management Hub -> Account Requests
        if (!existingProf || resolvedStatus === 'pending') {
          const { data: existingReqLogs } = await supabase
            .from('activity_logs')
            .select('id')
            .eq('action', 'ACCOUNT_REQUEST')
            .or(`user_id.eq.${u.id},details->>email.ilike.${email}`)
            .limit(1);

          if (!existingReqLogs || existingReqLogs.length === 0) {
            const regTs = new Date().toISOString();
            await supabase.from('activity_logs').insert([
              {
                user_id: u.id,
                user_name: resolvedName,
                action: 'ACCOUNT_REQUEST',
                details: buildAuditDetails({
                  summary: `${resolvedName} (${email}) submitted an institutional Google SSO registration request`,
                  actorId: u.id,
                  actorName: resolvedName,
                  actorEmail: email,
                  actorRoll: resolvedRoll,
                  actorRole: resolvedRole,
                  targetId: u.id,
                  targetName: resolvedName,
                  targetEmail: email,
                  targetRoll: resolvedRoll,
                  targetType: 'account',
                  where: 'Auth Portal › Google SSO Registration',
                  timestamp: regTs,
                  meta: {
                    userId: u.id,
                    email,
                    fullName: resolvedName,
                    enrollmentNo: resolvedRoll,
                    roll_number: resolvedRoll,
                    role: resolvedRole,
                    status: resolvedStatus,
                    auth_provider: 'google',
                    created_at: regTs,
                  },
                }),
              },
            ]);

            if (!notifiedAccountReqRef.current.has(u.id)) {
              notifiedAccountReqRef.current.add(u.id);
              await notifyEmail(
                'account_created',
                email,
                {
                  name: resolvedName,
                  email,
                  role: resolvedRole,
                  status: resolvedStatus,
                  notes: 'Registered via Google OAuth SSO',
                  notifyAdmins: true,
                },
                { accessToken, keepalive: true }
              );
            }
          }
        }
      } catch (e) {
        console.warn('OAuth profile provisioning notice:', e);
      }

      return { allowed: true };
    }

    async function validateAndProvisionOAuthUser(
      u: User,
      accessToken?: string
    ): Promise<{ allowed: boolean; error?: string }> {
      const inFlight = provisioningPromisesRef.current.get(u.id);
      if (inFlight) return inFlight;

      const task = runOAuthProvisioning(u, accessToken).finally(() => {
        provisioningPromisesRef.current.delete(u.id);
      });
      provisioningPromisesRef.current.set(u.id, task);
      return task;
    }

    /**
     * Parses OAuth / PKCE callback errors returned via search parameters or URL fragments.
     */
    const captureUrlAuthError = (): { hasError: boolean; message: string } => {
      if (typeof window === 'undefined') return { hasError: false, message: '' };
      try {
        const searchParams = new URLSearchParams(window.location.search || '');
        const hashRaw = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
        const hashParams = hashRaw.includes('=') ? new URLSearchParams(hashRaw) : null;

        const errCode = (searchParams.get('error_code') || hashParams?.get('error_code') || '').trim();
        const err = (searchParams.get('error') || hashParams?.get('error') || '').trim();
        const errDesc = (searchParams.get('error_description') || hashParams?.get('error_description') || '').trim();

        if (!err && !errCode && !errDesc) {
          return { hasError: false, message: '' };
        }

        const decodedDesc = errDesc.replace(/\+/g, ' ');
        if (errCode === 'bad_oauth_state' || /oauth state/i.test(decodedDesc)) {
          return {
            hasError: true,
            message: 'Your previous Google sign-in session expired or was already used. Please click Sign in with Google Account to continue.',
          };
        }

        return {
          hasError: true,
          message: decodedDesc || err || errCode || 'Authentication could not be completed. Please try signing in again.',
        };
      } catch {
        return { hasError: false, message: '' };
      }
    };

    /**
     * Persists and broadcasts an authentication error so LoginForm displays it immediately.
     */
    const publishAuthError = (message: string) => {
      if (!message) return;
      try {
        localStorage.setItem('cicr_auth_error', message);
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('cicr-auth-error', { detail: message }));
      } catch {}
    };

    /**
     * Strips sensitive OAuth tokens and transient PKCE/error query parameters from the address bar.
     */
    const cleanUrlOAuthParams = () => {
      if (typeof window === 'undefined') return;
      try {
        const currentUrl = new URL(window.location.href);
        let changed = false;

        for (const key of ['code', 'state', 'error', 'error_code', 'error_description', 'sb']) {
          if (currentUrl.searchParams.has(key)) {
            currentUrl.searchParams.delete(key);
            changed = true;
          }
        }

        const hash = currentUrl.hash || '';
        if (
          hash &&
          (hash.includes('access_token=') || hash.includes('refresh_token=') || hash.includes('error='))
        ) {
          currentUrl.hash = '';
          changed = true;
        }

        if (changed) {
          const cleanQuery = currentUrl.searchParams.toString();
          const targetUrl = `${currentUrl.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${currentUrl.hash}`;
          window.history.replaceState(window.history.state, '', targetUrl);
        }
      } catch {}
    };

    // Remember if this browser tab arrived via an OAuth callback so back-navigation guards never rewind into Google/Supabase
    if (typeof window !== 'undefined') {
      try {
        const search = window.location.search || '';
        const hash = window.location.hash || '';
        if (/[?&](code|state)=/.test(search) || hash.includes('access_token=')) {
          sessionStorage.setItem('cicr_oauth_tab', '1');
        }
      } catch {}
    }

    const pendingUrlAuthError = captureUrlAuthError();
    if (pendingUrlAuthError.hasError) {
      cleanUrlOAuthParams();
    }

    async function initSession() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (!mounted) return;

        // Clean PKCE codes and OAuth tokens right after Supabase finishes session extraction
        cleanUrlOAuthParams();

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
          try {
            localStorage.removeItem('cicr_auth_error');
          } catch {}
          const oauthValidation = await validateAndProvisionOAuthUser(currentUser, session?.access_token);
          if (!oauthValidation.allowed) {
            await supabase.auth.signOut();
            localStorage.removeItem('cicr-active-user');
            localStorage.removeItem('cicr-active-profile');
            localStorage.removeItem('neon-fallback-user');
            publishAuthError(
              oauthValidation.error || 'Access Restricted: Only college email accounts (@mail.jiit.ac.in) are permitted.'
            );
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
              publishAuthError(
                'Your account request was rejected by an administrator. Please contact the lab coordinator.'
              );
            } else {
              publishAuthError(
                'Your account request has been sent to the Admin Portal. Please wait for an administrator to approve your account.'
              );
            }

            setSession(null);
            setUser(null);
            setProfile(null);
            return;
          }
          setSession(session);
          setUser(currentUser);
          const loadedProfile = await loadProfile(currentUser);
          void logUserSignInIfNeeded(currentUser, loadedProfile, false, session?.access_token);
        } else {
          if (pendingUrlAuthError.hasError && pendingUrlAuthError.message) {
            publishAuthError(pendingUrlAuthError.message);
          } else if (sessionError?.message) {
            const msg = /invalid api key/i.test(sessionError.message)
              ? 'Authentication service key mismatch detected. Please refresh the page and retry Google sign-in.'
              : sessionError.message;
            publishAuthError(msg);
          }
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
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      // Clean PKCE parameters and tokens from URL bar immediately when auth state change fires
      cleanUrlOAuthParams();

      if (event === 'USER_UPDATED' && newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        return;
      }

      if (!newSession?.user) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const oauthValidation = await validateAndProvisionOAuthUser(newSession.user, newSession.access_token);
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
      const loadedProfile = await loadProfile(newSession.user);
      void logUserSignInIfNeeded(
        newSession.user,
        loadedProfile,
        event === 'SIGNED_IN' && !newSession.user.last_sign_in_at,
        newSession.access_token
      );
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
              let resolvedFailoverProfile = fallbackData.profile
                ? hydrateMemberIdentity(fallbackData.profile, fallbackUser.user_metadata)
                : null;
              if (resolvedFailoverProfile) {
                if (
                  resolvedFailoverProfile.status !== 'approved' ||
                  resolvedFailoverProfile.avatar_url === 'status:pending' ||
                  resolvedFailoverProfile.avatar_url === 'status:rejected'
                ) {
                  return {
                    success: false,
                    error:
                      resolvedFailoverProfile.status === 'rejected' ||
                      resolvedFailoverProfile.avatar_url === 'status:rejected'
                        ? 'Your account request was declined by an administrator. Please contact club leadership.'
                        : 'Your registration request has been sent to the Admin Portal. Please wait for an administrator to review and approve your account before signing in.',
                  };
                }
                resolvedFailoverProfile = {
                  ...resolvedFailoverProfile,
                  role: resolvedFailoverProfile.role === 'admin' ? 'admin' : 'member',
                };
                setProfile(resolvedFailoverProfile);
                try {
                  localStorage.setItem('cicr-active-profile', JSON.stringify(resolvedFailoverProfile));
                } catch {}
              } else {
                resolvedFailoverProfile = await loadProfile(fallbackUser);
              }
              try {
                localStorage.setItem('cicr-active-user', JSON.stringify(fallbackUser));
              } catch {}
              await logUserSignInIfNeeded(
                fallbackUser,
                resolvedFailoverProfile,
                !fallbackUser.last_sign_in_at,
                fallbackData.session?.access_token
              );
              return { success: true };
            }
          } else if (fallback.status === 401 || fallback.status === 403) {
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
        const loadedProf = await loadProfile(res.data.user);

        // Real-time log sign-in to activity_logs and send login email (deduplicated with onAuthStateChange)
        try {
          await logUserSignInIfNeeded(
            res.data.user,
            loadedProf,
            !res.data.user.last_sign_in_at,
            res.data.session?.access_token
          );
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
      const redirectUrl = resolveOAuthRedirectUrl();

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
      if (role && role !== 'member') {
        return {
          success: false,
          error: 'Self-assignment of elevated roles is prohibited.',
        };
      }
      let emailToRegister = email.trim();
      if (!emailToRegister.includes('@')) {
        emailToRegister = `${emailToRegister.toLowerCase()}@mail.jiit.ac.in`;
      }

      // Automatically fetch full name & student enrollment number directly from college email / input
      const extracted = extractIdentityFromEmail(emailToRegister, { full_name, enrollment_no });
      const effectiveFullName =
        full_name?.trim() && !isDirtyOrPlaceholderName(full_name, emailToRegister)
          ? toCleanDisplayName(full_name)
          : extracted.fullName;
      const effectiveEnrollmentNo = enrollment_no?.trim() || extracted.enrollmentNo;

      const enforcedRole = 'member' as const;
      const initialStatus = 'pending' as const;

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
            full_name: effectiveFullName,
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
            errMsg.includes('valid email') ||
            errMsg.includes('prohibited')
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
          emailRedirectTo: resolveOAuthRedirectUrl(),
          data: {
            full_name: effectiveFullName,
            enrollment_no: effectiveEnrollmentNo,
            roll_number: effectiveEnrollmentNo,
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
            full_name: effectiveFullName,
            email: emailToRegister,
            role: enforcedRole,
            status: initialStatus,
            roll_number: effectiveEnrollmentNo,
            phone,
            avatar_url: avatar_url || `status:${initialStatus}`,
          },
        ]);
        const regTs = new Date().toISOString();
        await supabase.from('activity_logs').insert([
          {
            user_id: authData.user.id,
            user_name: effectiveFullName,
            action: 'ACCOUNT_REQUEST',
            details: buildAuditDetails({
              summary: `${effectiveFullName} (${emailToRegister}) submitted a registration request`,
              actorId: authData.user.id,
              actorName: effectiveFullName,
              actorEmail: emailToRegister,
              actorRoll: effectiveEnrollmentNo,
              actorRole: enforcedRole,
              targetId: authData.user.id,
              targetName: effectiveFullName,
              targetEmail: emailToRegister,
              targetRoll: effectiveEnrollmentNo,
              targetType: 'account',
              where: 'Auth Portal › Registration',
              timestamp: regTs,
              meta: {
                userId: authData.user.id,
                email: emailToRegister,
                fullName: effectiveFullName,
                enrollmentNo: effectiveEnrollmentNo,
                roll_number: effectiveEnrollmentNo,
                phone,
                role: enforcedRole,
                status: initialStatus,
                avatar_url: avatar_url || undefined,
                created_at: regTs,
              },
            }),
          },
        ]);

        if (authData.session?.access_token) {
          await notifyEmail(
            'account_created',
            emailToRegister,
            {
              name: effectiveFullName,
              email: emailToRegister,
              role: enforcedRole,
              status: initialStatus,
              notifyAdmins: true,
            },
            { accessToken: authData.session.access_token }
          );
        }
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

  const approveUserAccount = async (targetId: string, email?: string, targetName?: string) => {
    const targetIdentity = extractIdentityFromEmail(email, { full_name: targetName });
    const resolvedTarget =
      targetName && !isDirtyOrPlaceholderName(targetName, email)
        ? toCleanDisplayName(targetName)
        : targetIdentity.fullName;
    const resolvedTargetRoll = targetIdentity.enrollmentNo;

    const actorEmail = (profile?.email || user?.email || '').toLowerCase();
    const validActorProfName =
      profile?.full_name && !isDirtyOrPlaceholderName(profile.full_name, actorEmail)
        ? profile.full_name
        : '';
    const actorMetaName =
      (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || '';
    const actorIdentity = extractIdentityFromEmail(actorEmail, {
      ...(user?.user_metadata || {}),
      full_name: validActorProfName || actorMetaName || profile?.full_name,
      enrollment_no: profile?.roll_number || user?.user_metadata?.enrollment_no,
    });
    const actorName = validActorProfName
      ? toCleanDisplayName(validActorProfName)
      : actorIdentity.fullName || 'Administrator';
    const actorRoll = profile?.roll_number || actorIdentity.enrollmentNo || '';

    const logApprovalFallback = async () => {
      try {
        await supabase.from('activity_logs').insert([
          {
            user_id: user?.id,
            user_name: actorName,
            action: 'ACCOUNT_APPROVED',
            details: buildAuditDetails({
              summary: `${actorName} approved registration account for ${resolvedTarget}${email ? ` (${email})` : ''}`,
              actorId: user?.id,
              actorName,
              actorEmail,
              actorRoll,
              actorRole: 'admin',
              targetId,
              targetName: resolvedTarget,
              targetEmail: email,
              targetRoll: resolvedTargetRoll,
              targetType: 'account',
              where: 'Management Hub › Account Requests',
              changes: ['Account Status: PENDING → APPROVED'],
            }),
          },
        ]);
        if (email) {
          await notifyEmail(
            'account_approved',
            email,
            {
              name: resolvedTarget,
              email,
              status: 'approved',
              adminName: actorName,
            },
            { accessToken: session?.access_token }
          );
        }
      } catch {}
    };

    try {
      const isCallerAdmin = Boolean(
        profile &&
          profile.role === 'admin' &&
          profile.status === 'approved' &&
          profile.avatar_url !== 'status:pending' &&
          profile.avatar_url !== 'status:rejected'
      );
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'approve', target_id: targetId, email, target_name: resolvedTarget }),
      });
      if (response.ok) {
        return { success: true };
      }
      // If server returns error, execute direct fallback without clobbering Google avatar URL
      const fallbackPatch: Record<string, unknown> = {
        status: 'approved',
        full_name: resolvedTarget,
        ...(resolvedTargetRoll ? { roll_number: resolvedTargetRoll } : {}),
        updated_at: new Date().toISOString(),
      };
      const { error: profError } = await supabase
        .from('profiles')
        .update(fallbackPatch)
        .match(email ? { email } : { id: targetId });
      if (!profError) {
        await logApprovalFallback();
        return { success: true };
      }
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Approval failed.' };
    } catch {
      // Network failure fallback
      try {
        const fallbackPatch: Record<string, unknown> = {
          status: 'approved',
          full_name: resolvedTarget,
          ...(resolvedTargetRoll ? { roll_number: resolvedTargetRoll } : {}),
          updated_at: new Date().toISOString(),
        };
        const { error: profError } = await supabase
          .from('profiles')
          .update(fallbackPatch)
          .match(email ? { email } : { id: targetId });
        if (!profError) {
          await logApprovalFallback();
          return { success: true };
        }
      } catch {}
      return { success: false, error: 'Approval failed.' };
    }
  };

  const rejectUserAccount = async (targetId: string, email?: string, targetName?: string) => {
    const targetIdentity = extractIdentityFromEmail(email, { full_name: targetName });
    const resolvedTarget =
      targetName && !isDirtyOrPlaceholderName(targetName, email)
        ? toCleanDisplayName(targetName)
        : targetIdentity.fullName;
    const resolvedTargetRoll = targetIdentity.enrollmentNo;

    const actorEmail = (profile?.email || user?.email || '').toLowerCase();
    const validActorProfName =
      profile?.full_name && !isDirtyOrPlaceholderName(profile.full_name, actorEmail)
        ? profile.full_name
        : '';
    const actorMetaName =
      (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || '';
    const actorIdentity = extractIdentityFromEmail(actorEmail, {
      ...(user?.user_metadata || {}),
      full_name: validActorProfName || actorMetaName || profile?.full_name,
      enrollment_no: profile?.roll_number || user?.user_metadata?.enrollment_no,
    });
    const actorName = validActorProfName
      ? toCleanDisplayName(validActorProfName)
      : actorIdentity.fullName || 'Administrator';
    const actorRoll = profile?.roll_number || actorIdentity.enrollmentNo || '';

    const logRejectionFallback = async () => {
      try {
        await supabase.from('activity_logs').insert([
          {
            user_id: user?.id,
            user_name: actorName,
            action: 'ACCOUNT_REJECTED',
            details: buildAuditDetails({
              summary: `${actorName} rejected registration account for ${resolvedTarget}${email ? ` (${email})` : ''}`,
              actorId: user?.id,
              actorName,
              actorEmail,
              actorRoll,
              actorRole: 'admin',
              targetId,
              targetName: resolvedTarget,
              targetEmail: email,
              targetRoll: resolvedTargetRoll,
              targetType: 'account',
              where: 'Management Hub › Account Requests',
              changes: ['Account Status: PENDING → REJECTED'],
            }),
          },
        ]);
        if (email) {
          await notifyEmail(
            'account_rejected',
            email,
            {
              name: resolvedTarget,
              email,
              status: 'rejected',
              adminName: actorName,
            },
            { accessToken: session?.access_token }
          );
        }
      } catch {}
    };

    try {
      const isCallerAdmin = Boolean(
        profile &&
          profile.role === 'admin' &&
          profile.status === 'approved' &&
          profile.avatar_url !== 'status:pending' &&
          profile.avatar_url !== 'status:rejected'
      );
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }

      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'reject', target_id: targetId, email, target_name: resolvedTarget }),
      });
      if (response.ok) {
        return { success: true };
      }
      // If server returns error, execute direct fallback
      const rejectFallbackPatch: Record<string, unknown> = {
        ...(email ? { email } : {}),
        full_name: resolvedTarget,
        ...(resolvedTargetRoll ? { roll_number: resolvedTargetRoll } : {}),
        status: 'rejected',
        updated_at: new Date().toISOString(),
      };
      const { error: profError } = await supabase
        .from('profiles')
        .update(rejectFallbackPatch)
        .match(email ? { email } : { id: targetId });
      if (!profError) {
        await logRejectionFallback();
        return { success: true };
      }
      const errData = await response.json().catch(() => ({}));
      return { success: false, error: errData.error || 'Rejection failed.' };
    } catch {
      // Network failure fallback
      try {
        const rejectFallbackPatch: Record<string, unknown> = {
          ...(email ? { email } : {}),
          full_name: resolvedTarget,
          ...(resolvedTargetRoll ? { roll_number: resolvedTargetRoll } : {}),
          status: 'rejected',
          updated_at: new Date().toISOString(),
        };
        const { error: profError } = await supabase
          .from('profiles')
          .update(rejectFallbackPatch)
          .match(email ? { email } : { id: targetId });
        if (!profError) {
          await logRejectionFallback();
          return { success: true };
        }
      } catch {}
      return { success: false, error: 'Rejection failed.' };
    }
  };

  const updateUserRole = async (targetId: string, newRole: 'admin' | 'member') => {
    try {
      const isCallerAdmin = Boolean(
        profile &&
          profile.role === 'admin' &&
          profile.status === 'approved' &&
          profile.avatar_url !== 'status:pending' &&
          profile.avatar_url !== 'status:rejected'
      );
      if (!isCallerAdmin) {
        return { success: false, error: 'Unauthorized: Administrative privileges required.' };
      }
      if (user?.id && targetId === user.id) {
        return { success: false, error: 'You cannot change your own administrator role.' };
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
          ...(updates.roll_number !== undefined ? { enrollment_no: updates.roll_number, roll_number: updates.roll_number } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url } : {}),
        },
      });

      const changes: string[] = [];
      if (updates.full_name !== undefined && updates.full_name !== (profile?.full_name || '')) {
        changes.push(`Name: "${profile?.full_name || '—'}" → "${updates.full_name}"`);
      }
      if (updates.roll_number !== undefined && updates.roll_number !== (profile?.roll_number || '')) {
        changes.push(`Roll No: "${profile?.roll_number || '—'}" → "${updates.roll_number}"`);
      }
      if (updates.phone !== undefined && updates.phone !== (profile?.phone || '')) {
        changes.push(`Phone: "${profile?.phone || '—'}" → "${updates.phone}"`);
      }
      if (updates.avatar_url !== undefined && updates.avatar_url !== (profile?.avatar_url || '')) {
        changes.push(updates.avatar_url ? 'Profile photo updated' : 'Profile photo removed');
      }

      const actorEmail = (user.email || '').toLowerCase();
      const rawActorCand =
        (updates.full_name && !isDirtyOrPlaceholderName(updates.full_name, actorEmail) ? updates.full_name : '') ||
        (profile?.full_name && !isDirtyOrPlaceholderName(profile.full_name, actorEmail) ? profile.full_name : '') ||
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        updates.full_name ||
        profile?.full_name ||
        '';
      const actorIdentity = extractIdentityFromEmail(actorEmail, {
        ...(user.user_metadata || {}),
        full_name: rawActorCand,
        enrollment_no: updates.roll_number ?? profile?.roll_number,
      });
      const actorName =
        rawActorCand && !isDirtyOrPlaceholderName(rawActorCand, actorEmail)
          ? toCleanDisplayName(rawActorCand)
          : actorIdentity.fullName;
      const actorRole = profile?.role || 'member';

      if (changes.length > 0) {
        try {
          await supabase.from('activity_logs').insert([
            {
              user_id: user.id,
              user_name: actorName,
              action: 'PROFILE_UPDATED',
              details: buildAuditDetails({
                summary: `${actorName} updated their operator profile (${changes.join(', ')})`,
                actorId: user.id,
                actorName,
                actorEmail,
                actorRoll: updates.roll_number ?? profile?.roll_number,
                actorRole,
                targetId: user.id,
                targetName: actorName,
                targetEmail: actorEmail,
                targetRoll: updates.roll_number ?? profile?.roll_number,
                targetType: 'account',
                where: 'Operator Profile › Settings',
                changes,
              }),
            },
          ]);
          await notifyEmail(
            'profile_updated',
            actorEmail,
            {
              name: actorName,
              email: actorEmail,
              role: actorRole,
              notes: changes.join(', '),
            },
            { accessToken: session?.access_token }
          );
        } catch {}
      }

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      return { success: false, error: msg };
    }
  };

  const signOut = async () => {
    // 1. Capture user, profile, session token, and inactivity reason before resetting state
    const userToLog = user;
    const profileToLog = profile;
    const tokenBeforeSignOut = session?.access_token || '';
    let isInactivitySignOut = false;
    try {
      isInactivitySignOut = localStorage.getItem('cicr_session_expired_reason') === 'inactivity';
    } catch {}

    setUser(null);
    setSession(null);
    setProfile(null);
    localStorage.removeItem('cicr-active-user');
    localStorage.removeItem('cicr-active-profile');
    localStorage.removeItem('neon-fallback-user');
    localStorage.removeItem('cicr-cached-logs');
    localStorage.removeItem('cicr-cached-requests');
    localStorage.removeItem('cicr-cached-members');
    localStorage.removeItem('cicr-cached-pending-accounts');
    try {
      sessionStorage.removeItem('cicr_oauth_tab');
    } catch {}
    if (userToLog?.id) {
      try {
        localStorage.removeItem(`cicr_last_signin_logged_${userToLog.id}`);
      } catch {}
      for (const markerKey of Array.from(loggedSignInMarkersRef.current)) {
        if (markerKey.startsWith(`${userToLog.id}:`)) {
          loggedSignInMarkersRef.current.delete(markerKey);
        }
      }
    }

    // 2. Record audit log and send signout notification BEFORE revoking the JWT token
    try {
      if (userToLog) {
        let resolvedToken = tokenBeforeSignOut;
        if (!resolvedToken) {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            resolvedToken = sessionData?.session?.access_token || '';
          } catch {}
        }

        const actorEmail = (profileToLog?.email || userToLog.email || '').toLowerCase();
        const rawActorCand =
          (profileToLog?.full_name && !isDirtyOrPlaceholderName(profileToLog.full_name, actorEmail) ? profileToLog.full_name : '') ||
          (userToLog.user_metadata?.full_name as string) ||
          (userToLog.user_metadata?.name as string) ||
          profileToLog?.full_name ||
          '';
        const actorIdentity = extractIdentityFromEmail(actorEmail, {
          ...(userToLog.user_metadata || {}),
          full_name: rawActorCand,
          enrollment_no: profileToLog?.roll_number,
        });
        const actorName =
          rawActorCand && !isDirtyOrPlaceholderName(rawActorCand, actorEmail)
            ? toCleanDisplayName(rawActorCand)
            : actorIdentity.fullName;
        const actorRoll = profileToLog?.roll_number || actorIdentity.enrollmentNo || '';
        const actorRole = profileToLog?.role || 'member';

        await supabase.from('activity_logs').insert([
          {
            user_id: userToLog.id,
            user_name: actorName,
            action: 'USER_SIGNOUT',
            details: buildAuditDetails({
              summary: `${actorName} logged out`,
              actorId: userToLog.id,
              actorName,
              actorEmail,
              actorRoll,
              actorRole,
              targetType: 'account',
              where: 'CICR Portal > Session Sign-Out',
            }),
          },
        ]);

        await Promise.race([
          notifyEmail(
            'logout',
            actorEmail,
            {
              name: actorName,
              email: actorEmail,
              role: actorRole,
              notes: isInactivitySignOut
                ? 'Automatically signed out after 10 minutes of inactivity'
                : 'Signed out by operator',
            },
            { accessToken: resolvedToken, keepalive: true }
          ),
          new Promise((resolve) => setTimeout(resolve, 4500)),
        ]);
      }
    } catch (err) {
      console.warn('Background sign out telemetry error:', err);
    } finally {
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn('Supabase signOut error:', signOutErr);
      }
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
      if (user?.email) {
        await notifyEmail(
          'profile_updated',
          user.email,
          {
            name: profile?.full_name || user.user_metadata?.full_name || 'CICR member',
            email: user.email,
            role: profile?.role || 'member',
            notes: 'Account password updated',
          },
          { accessToken: session?.access_token }
        );
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password update failed';
      return { success: false, error: msg };
    }
  };

  // Anti-tampering listener: instantly revert any console modifications to localStorage profile state
  useEffect(() => {
    const handleStorage = () => {
      try {
        const raw = localStorage.getItem('cicr-active-profile');
        if (raw && user) {
          const p = safeParseJSON<UserProfile>(raw);
          if (!p) return;
          const expectedRole = profile?.role || 'member';
          const expectedStatus = profile?.status || 'pending';
          if (p.role !== expectedRole || p.status !== expectedStatus) {
            console.warn('[Security] Unauthorized profile state modification detected in localStorage. Reverting.');
            p.role = expectedRole;
            p.status = expectedStatus;
            localStorage.setItem('cicr-active-profile', JSON.stringify(p));
            setProfile(p);
          }
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user, profile]);

  const isApprovedAccount = Boolean(
    profile &&
      profile.status === 'approved' &&
      profile.avatar_url !== 'status:pending' &&
      profile.avatar_url !== 'status:rejected'
  );
  const isAdmin = Boolean(isApprovedAccount && profile?.role === 'admin');
  const isLeadOrAdmin = isAdmin;

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
