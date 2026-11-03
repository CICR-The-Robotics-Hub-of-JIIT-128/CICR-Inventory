import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { sendDeviceNotification } from '../utils/deviceNotification';

export const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds
const ACTIVITY_THROTTLE_MS = 5 * 1000; // Throttle storage writes to once per 5 seconds
const STORAGE_KEY = 'cicr_last_activity_timestamp';

/**
 * Hook to enforce automatic logout after 10 minutes of inactivity.
 * Synchronizes across multiple browser tabs via localStorage and checks
 * upon window focus / visibility change.
 */
export const useInactivityTimeout = () => {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const lastActiveRef = useRef<number>(Date.now());
  const isLoggingOutRef = useRef<boolean>(false);

  const performLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      localStorage.setItem('cicr_session_expired_reason', 'inactivity');
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    // 1. In-app toast alert
    showToast(
      'warning',
      'Session Expired',
      'You have been logged out due to 10 minutes of inactivity.'
    );

    // 2. Native OS / Device push notification
    sendDeviceNotification('CICR Session Expired', {
      body: 'You were logged out due to 10 minutes of inactivity.',
      tag: 'cicr-inactivity-logout',
    }).catch(() => {});

    // 3. Complete auth sign out
    try {
      await signOut();
    } catch (err) {
      console.warn('Inactivity signout error:', err);
    } finally {
      isLoggingOutRef.current = false;
    }
  }, [signOut, showToast]);

  useEffect(() => {
    if (!user) {
      isLoggingOutRef.current = false;
      return;
    }

    // Initialize activity timestamp
    const now = Date.now();
    lastActiveRef.current = now;
    try {
      localStorage.setItem(STORAGE_KEY, now.toString());
    } catch {}

    let lastRecordTime = 0;
    const recordActivity = () => {
      const current = Date.now();
      lastActiveRef.current = current;
      if (current - lastRecordTime > ACTIVITY_THROTTLE_MS) {
        lastRecordTime = current;
        try {
          localStorage.setItem(STORAGE_KEY, current.toString());
        } catch {}
      }
    };

    // User activity listeners
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    events.forEach((evt) => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });

    // Regular interval checking
    const intervalId = setInterval(() => {
      let storedTime = 0;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        storedTime = stored ? Number(stored) : 0;
      } catch {}

      const effectiveLastActive = Math.max(lastActiveRef.current, storedTime);
      const elapsed = Date.now() - effectiveLastActive;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        performLogout();
      }
    }, CHECK_INTERVAL_MS);

    // Immediate check on tab focus or visibility change (e.g. system wake / tab return)
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        let storedTime = 0;
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          storedTime = stored ? Number(stored) : 0;
        } catch {}

        const effectiveLastActive = Math.max(lastActiveRef.current, storedTime);
        const elapsed = Date.now() - effectiveLastActive;

        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          performLogout();
        } else {
          recordActivity();
        }
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, recordActivity);
      });
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(intervalId);
    };
  }, [user, performLogout]);
};
