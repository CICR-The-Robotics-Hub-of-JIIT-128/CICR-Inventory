/**
 * Client gateway wrapper for authoritative `/api/inventory` serverless mutations.
 * Attaches the verified Supabase session bearer token and fails closed on errors
 * so catalog changes and borrow request approvals cannot bypass server RBAC.
 */

import { supabase } from './supabase';

/**
 * Executes a POST request to `/api/inventory` with the caller's Supabase bearer token.
 * Throws an Error with the server's explicit diagnostic message when unauthorized or invalid.
 */
export async function callInventoryApi<T extends Record<string, any> = Record<string, any>>(
  payload: Record<string, unknown>,
  accessToken?: string
): Promise<T> {
  let token = (accessToken || '').trim();
  if (!token) {
    const { data: sessionData } = await supabase.auth.getSession();
    token = (sessionData?.session?.access_token || '').trim();
  }

  if (!token) {
    throw new Error('Authentication required. Please sign in again.');
  }

  const response = await fetch('/api/inventory', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || (data && typeof data.error === 'string' && data.error)) {
    throw new Error(data?.error || `Inventory request failed (${response.status}).`);
  }

  return data as T;
}

