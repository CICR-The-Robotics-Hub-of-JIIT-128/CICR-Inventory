import { supabase } from './supabase';

export type NotificationEvent =
  | 'login'
  | 'logout'
  | 'account_created'
  | 'account_approved'
  | 'account_rejected'
  | 'borrow_requested'
  | 'borrow_approved'
  | 'borrow_rejected'
  | 'item_returned'
  | 'return_reminder';

export async function notifyEmail(
  event: NotificationEvent,
  to: string | undefined,
  data: Record<string, unknown>
): Promise<boolean> {
  if (!to) return false;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      // Unauthenticated actions (like registration) are handled server-side
      return false;
    }

    const response = await fetch('/api/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event, to, data }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
