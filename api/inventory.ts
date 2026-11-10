/**
 * Authoritative serverless RBAC gateway for inventory catalog mutations and borrow request
 * lifecycle transitions (`/api/inventory`). Rejects unauthenticated, unapproved, and non-admin
 * callers cleanly using verified PostgreSQL profile roles rather than client state.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from './_lib/supabaseServer';
import {
  handleAddItem,
  handleDeleteItem,
  handleUpdateItem,
} from './_lib/inventoryCatalogOps';
import {
  handleSubmitBorrowRequest,
  handleUpdateBorrowStatus,
} from './_lib/borrowRequestOps';
import {
  handleDeclineReturn,
  handleDeleteBorrowRequest,
  handleRequestReturn,
} from './_lib/borrowLifecycleOps';

function sendJson(res: VercelResponse, statusCode: number, body: unknown) {
  res.setHeader('content-type', 'application/json');
  return res.status(statusCode).json(body);
}

/**
 * Serverless route handler dispatching authenticated inventory and borrow request actions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  let body: Record<string, any> = (req.body || {}) as Record<string, any>;
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as Record<string, any>;
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON request payload.' });
    }
  }

  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  if (!action) {
    return sendJson(res, 400, { error: 'Inventory action is required.' });
  }

  try {
    let result: { statusCode: number; body: unknown };
    switch (action) {
      case 'add_item':
        result = await handleAddItem(req, body);
        break;
      case 'update_item':
        result = await handleUpdateItem(req, body);
        break;
      case 'delete_item':
        result = await handleDeleteItem(req, body);
        break;
      case 'submit_borrow_request':
        result = await handleSubmitBorrowRequest(req, body);
        break;
      case 'update_borrow_status':
        result = await handleUpdateBorrowStatus(req, body);
        break;
      case 'request_return':
        result = await handleRequestReturn(req, body);
        break;
      case 'decline_return':
        result = await handleDeclineReturn(req, body);
        break;
      case 'delete_borrow_request':
        result = await handleDeleteBorrowRequest(req, body);
        break;
      default:
        return sendJson(res, 400, { error: `Unsupported inventory action: ${action}` });
    }

    return sendJson(res, result.statusCode, result.body);
  } catch (err: unknown) {
    if (
      err instanceof HttpError ||
      (err &&
        typeof err === 'object' &&
        'statusCode' in err &&
        typeof (err as { statusCode?: unknown }).statusCode === 'number' &&
        err instanceof Error)
    ) {
      const httpErr = err as { statusCode: number; message: string };
      return sendJson(res, httpErr.statusCode, { error: httpErr.message });
    }
    console.error(`[api/inventory] Unexpected failure during action=${action}:`, err);
    return sendJson(res, 500, { error: 'Internal server error processing inventory action.' });
  }
}
