import { supabase } from './supabase';

export type NotificationEvent =
  | 'login'
  | 'logout'
  | 'account_created'
  | 'account_approved'
  | 'account_rejected'
  | 'role_updated'
  | 'profile_updated'
  | 'borrow_requested'
  | 'borrow_approved'
  | 'borrow_rejected'
  | 'return_requested'
  | 'item_returned'
  | 'return_declined'
  | 'item_created'
  | 'item_edited'
  | 'item_deleted'
  | 'return_reminder';

export interface NotifyEmailOptions {
  /** Pre captured Supabase access token used when local auth state or session is tearing down. */
  accessToken?: string;
  /** Enables fetch keepalive so signout emails survive immediate tab navigation or close. */
  keepalive?: boolean;
}

/**
 * Dispatches an authenticated transactional email request to `/api/email`.
 * Uses an explicit access token when provided (essential during signout before token revocation)
 * and logs delivery issues rather than silently dropping notification telemetry.
 */
export async function notifyEmail(
  event: NotificationEvent,
  to: string | undefined,
  data: Record<string, unknown>,
  options?: NotifyEmailOptions
): Promise<boolean> {
  const recipient = (to || '').trim();
  if (!recipient) return false;

  try {
    let token = (options?.accessToken || '').trim();
    if (!token) {
      const { data: sessionData } = await supabase.auth.getSession();
      token = (sessionData?.session?.access_token || '').trim();
    }
    if (!token) {
      console.warn(`[notifications] Skipped ${event} email for ${recipient}: no active access token.`);
      return false;
    }

    const response = await fetch('/api/email', {
      method: 'POST',
      keepalive: Boolean(options?.keepalive),
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event, to: recipient, data }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[notifications] /api/email rejected ${event} (${response.status}):`, detail);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`[notifications] Failed sending ${event} email for ${recipient}:`, err);
    return false;
  }
}
