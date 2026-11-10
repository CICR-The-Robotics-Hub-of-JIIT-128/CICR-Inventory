/**
 * Borrow request lifecycle operations (`request_return`, `decline_return`, `delete_borrow_request`)
 * for `/api/inventory`. Enforces borrower ownership on return submissions and strict
 * approved administrator clearance on return declines and request deletions.
 */

import type { VercelRequest } from '@vercel/node';
import {
  formatTodayIstDate,
  HttpError,
  recordServerAuditLog,
  requireApprovedAdmin,
  requireApprovedUser,
} from './supabaseServer';

function computeStockStatus(avail: number, total: number, minThreshold: number): string {
  if (avail <= 0) return 'Out of Stock';
  if ((total > 0 && avail / total < 0.5) || avail <= minThreshold) return 'Low Stock';
  return 'In Stock';
}

/**
 * Initiates a return clearance notification on an active (`approved` or `overdue`) loan.
 * Strictly restricted to the borrower who owns the loan or an approved administrator.
 */
export async function handleRequestReturn(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedUser(req);
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const returnNotes = typeof body.returnNotes === 'string' ? body.returnNotes.trim() : '';
  if (!requestId) throw new HttpError(400, 'requestId is required.');

  const { data: targetReq, error: fetchErr } = await caller.adminClient
    .from('borrow_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchErr) throw new HttpError(500, fetchErr.message);
  if (!targetReq) throw new HttpError(404, 'Requisition record not found.');

  const isOwner =
    targetReq.user_id === caller.user.id ||
    (caller.actor.email && String(targetReq.user_email || '').toLowerCase() === caller.actor.email);
  const isAdmin = caller.profile.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new HttpError(403, 'Unauthorized: Only the member who issued this component can initiate its return.');
  }

  if (!['approved', 'overdue'].includes(targetReq.status)) {
    throw new HttpError(409, 'Only active issued loans can be submitted for return.');
  }

  const cleanExistingNotes = String(targetReq.admin_notes || '')
    .replace(/\[RETURN_REQUESTED\][^\n|]*/g, '')
    .replace(/\|+/g, '|')
    .trim();
  const noteTag = '[RETURN_REQUESTED]';
  const updatedNotes = returnNotes
    ? `${noteTag} (${caller.actor.name}): ${returnNotes}${cleanExistingNotes ? ` | ${cleanExistingNotes}` : ''}`
    : `${noteTag} Return submitted by ${caller.actor.name} on ${formatTodayIstDate()}${cleanExistingNotes ? ` | ${cleanExistingNotes}` : ''}`;

  const { data: updatedReq, error: updateErr } = await caller.adminClient
    .from('borrow_requests')
    .update({ admin_notes: updatedNotes, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();

  if (updateErr || !updatedReq) {
    throw new HttpError(400, updateErr?.message || 'Failed to submit return request.');
  }

  const { data: item } = await caller.adminClient
    .from('inventory_items')
    .select('location')
    .eq('id', targetReq.item_id)
    .maybeSingle();

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'RETURN_REQUEST',
    summary: `${caller.actor.name} requested return of ${targetReq.quantity}x ${targetReq.item_name} for "${targetReq.project_name}"`,
    actor: caller.actor,
    itemId: targetReq.item_id,
    targetId: targetReq.item_id,
    targetName: `${targetReq.quantity}x ${targetReq.item_name}`,
    targetType: 'borrow_request',
    location: item?.location,
    where: 'Requisitions & Clearance > My Requisitions',
    changes: [
      `Project: "${targetReq.project_name}"`,
      `Qty: ${targetReq.quantity}`,
      ...(returnNotes ? [`Note: ${returnNotes}`] : []),
    ],
    meta: {
      requestId,
      itemId: targetReq.item_id,
      itemName: targetReq.item_name,
      quantity: targetReq.quantity,
      projectName: targetReq.project_name,
      requesterId: caller.actor.id,
      requesterName: caller.actor.name,
      requesterEmail: caller.actor.email,
      requesterRoll: caller.actor.roll,
    },
  });

  return { statusCode: 200, body: { success: true, request: updatedReq, auditLog } };
}

/**
 * Declines a pending `[RETURN_REQUESTED]` submission while keeping the loan active (admins only).
 */
export async function handleDeclineReturn(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedAdmin(req);
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!requestId) throw new HttpError(400, 'requestId is required.');

  const { data: targetReq, error: fetchErr } = await caller.adminClient
    .from('borrow_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchErr) throw new HttpError(500, fetchErr.message);
  if (!targetReq) throw new HttpError(404, 'Requisition record not found.');

  if (!['approved', 'overdue'].includes(targetReq.status)) {
    throw new HttpError(409, 'Only active loans with a return request can be declined.');
  }

  const cleanNotes = String(targetReq.admin_notes || '')
    .replace(/\[RETURN_REQUESTED\][^\n|]*/g, '')
    .replace(/\|+/g, '|')
    .trim();
  const updatedNotes = reason ? `${cleanNotes ? `${cleanNotes} | ` : ''}Return declined: ${reason}` : (cleanNotes || null);

  const { data: updatedReq, error: updateErr } = await caller.adminClient
    .from('borrow_requests')
    .update({ admin_notes: updatedNotes, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();

  if (updateErr || !updatedReq) {
    throw new HttpError(400, updateErr?.message || 'Failed to decline return request.');
  }

  const { data: item } = await caller.adminClient
    .from('inventory_items')
    .select('location')
    .eq('id', targetReq.item_id)
    .maybeSingle();

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'RETURN_DECLINED',
    summary: `${caller.actor.name} rejected return of ${targetReq.quantity}x ${targetReq.item_name} from ${targetReq.user_name}${reason ? ` (${reason})` : ''}`,
    actor: caller.actor,
    itemId: targetReq.item_id,
    targetId: targetReq.item_id,
    targetName: `${targetReq.quantity}x ${targetReq.item_name}`,
    targetType: 'borrow_request',
    location: item?.location,
    where: 'Requisitions & Clearance > Return Clearance',
    changes: [
      `Borrower: ${targetReq.user_name}`,
      `Qty: ${targetReq.quantity}`,
      ...(reason ? [`Reason: ${reason}`] : []),
    ],
    meta: {
      requestId,
      itemId: targetReq.item_id,
      itemName: targetReq.item_name,
      quantity: targetReq.quantity,
      requesterId: targetReq.user_id,
      requesterName: targetReq.user_name,
      requesterEmail: targetReq.user_email,
    },
  });

  return { statusCode: 200, body: { success: true, request: updatedReq, auditLog } };
}

/**
 * Deletes a borrow request record (approved admins only), safely restoring `available_qty`
 * if an active (`approved` or `overdue`) loan is removed.
 */
export async function handleDeleteBorrowRequest(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedAdmin(req);
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) throw new HttpError(400, 'requestId is required.');

  const { data: targetReq, error: fetchErr } = await caller.adminClient
    .from('borrow_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchErr) throw new HttpError(500, fetchErr.message);
  if (!targetReq) throw new HttpError(404, 'Requisition record not found.');

  let restockedItem: any = null;
  if (targetReq.status === 'approved' || targetReq.status === 'overdue') {
    const { data: item } = await caller.adminClient
      .from('inventory_items')
      .select('*')
      .eq('id', targetReq.item_id)
      .maybeSingle();

    if (item) {
      const reqQty = Math.max(1, Number(targetReq.quantity ?? 1));
      const qtyBefore = Number(item.available_qty ?? 0);
      const totalQty = Number(item.total_qty ?? 0);
      const restoredAvail = totalQty > 0 ? Math.min(totalQty, qtyBefore + reqQty) : qtyBefore + reqQty;
      const nextStatus = computeStockStatus(restoredAvail, totalQty, Number(item.min_threshold ?? 0));
      const { data: updatedItem } = await caller.adminClient
        .from('inventory_items')
        .update({ available_qty: restoredAvail, status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .select()
        .maybeSingle();
      restockedItem = updatedItem || { ...item, available_qty: restoredAvail, status: nextStatus };
    }
  }

  const { error: deleteErr } = await caller.adminClient.from('borrow_requests').delete().eq('id', requestId);
  if (deleteErr) throw new HttpError(400, deleteErr.message);

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'DELETE_BORROW_REQUEST',
    summary: `${caller.actor.name} deleted borrow request for ${targetReq.quantity}x ${targetReq.item_name} (${targetReq.user_name})`,
    actor: caller.actor,
    itemId: targetReq.item_id,
    targetId: requestId,
    targetName: `${targetReq.quantity}x ${targetReq.item_name}`,
    targetType: 'borrow_request',
    where: 'Requisitions & Clearance > Admin Cleanup',
    changes: [
      `Borrower: ${targetReq.user_name}`,
      `Previous Status: ${targetReq.status}`,
      ...(restockedItem ? [`Restocked Available Qty: ${restockedItem.available_qty}`] : []),
    ],
  });

  return { statusCode: 200, body: { success: true, deletedId: requestId, item: restockedItem, auditLog } };
}

