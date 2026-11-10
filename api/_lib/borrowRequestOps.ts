/**
 * Requisition submission and admin approval/rejection/return handlers
 * for `/api/inventory`. Enforces approved membership for submissions and strict
 * approved administrator clearance for status transitions with atomic stock updates.
 */

import type { VercelRequest } from '@vercel/node';
import {
  formatTodayIstDate,
  HttpError,
  recordServerAuditLog,
  requireApprovedAdmin,
  requireApprovedUser,
  validateFutureOrTodayIstDate,
} from './supabaseServer';

function computeStockStatus(avail: number, total: number, minThreshold: number): string {
  if (avail <= 0) return 'Out of Stock';
  if ((total > 0 && avail / total < 0.5) || avail <= minThreshold) return 'Low Stock';
  return 'In Stock';
}

/**
 * Submits a new pending borrow request scoped strictly to the authenticated caller.
 */
export async function handleSubmitBorrowRequest(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedUser(req);
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
  const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
  const quantity = Number(body.quantity);

  if (!itemId) throw new HttpError(400, 'itemId is required.');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError(400, 'Invalid quantity: Must be a positive integer.');
  }
  if (!projectName || !purpose) {
    throw new HttpError(400, 'Project name and purpose are required.');
  }

  const expectedReturnDate = validateFutureOrTodayIstDate(body.expectedReturnDate);

  const { data: item, error: itemErr } = await caller.adminClient
    .from('inventory_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (itemErr) throw new HttpError(500, itemErr.message);
  if (!item) throw new HttpError(404, 'Requested component was not found.');

  if (Number(item.available_qty ?? 0) < quantity) {
    throw new HttpError(409, `Only ${item.available_qty} items available in stock`);
  }

  const { data: dupPending } = await caller.adminClient
    .from('borrow_requests')
    .select('id')
    .eq('item_id', item.id)
    .eq('user_id', caller.user.id)
    .eq('status', 'pending')
    .limit(1);

  if (dupPending && dupPending.length > 0) {
    throw new HttpError(
      409,
      `You already have an active pending request for "${item.name}". Please wait for administrator clearance before submitting another request for this item.`
    );
  }

  // Server enforces owner identity, pending state, and null clearance metadata.
  const insertPayload = {
    item_id: item.id,
    user_id: caller.user.id,
    user_name: caller.actor.name,
    user_email: caller.actor.email,
    item_name: item.name,
    quantity,
    project_name: projectName,
    purpose,
    status: 'pending',
    borrow_date: null,
    expected_return_date: expectedReturnDate,
    actual_return_date: null,
    approved_by: null,
    admin_notes: null,
  };

  const { data: createdReq, error: insertErr } = await caller.adminClient
    .from('borrow_requests')
    .insert([insertPayload])
    .select()
    .single();

  if (insertErr || !createdReq) {
    throw new HttpError(400, insertErr?.message || 'Failed to submit borrow request.');
  }

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'BORROW_REQUEST',
    summary: `${caller.actor.name} requested ${quantity}x ${item.name} for "${projectName}"`,
    actor: caller.actor,
    itemId: item.id,
    targetId: item.id,
    targetName: `${quantity}x ${item.name}`,
    targetType: 'borrow_request',
    location: item.location,
    where: 'Component Vault > Requisition Checkout',
    changes: [
      `Project: "${projectName}"`,
      `Qty: ${quantity}`,
      `Due: ${expectedReturnDate}`,
    ],
    meta: {
      requestId: createdReq.id,
      itemId: item.id,
      itemName: item.name,
      quantity,
      projectName,
      expectedReturnDate,
      requesterId: caller.actor.id,
      requesterName: caller.actor.name,
      requesterEmail: caller.actor.email,
      requesterRoll: caller.actor.roll,
    },
  });

  return { statusCode: 201, body: { success: true, request: createdReq, item, auditLog } };
}

/**
 * Transitions a requisition to `approved`, `rejected`, or `returned` (approved admins only)
 * with atomic state preconditions, IST date stamping, and single source stock reconciliation.
 */
export async function handleUpdateBorrowStatus(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedAdmin(req);
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const newStatus = typeof body.status === 'string' ? body.status.trim() : '';
  const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() : undefined;

  if (!requestId) throw new HttpError(400, 'requestId is required.');
  if (!['approved', 'rejected', 'returned'].includes(newStatus)) {
    throw new HttpError(400, 'status must be approved, rejected, or returned.');
  }

  const { data: targetReq, error: reqFetchErr } = await caller.adminClient
    .from('borrow_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (reqFetchErr) throw new HttpError(500, reqFetchErr.message);
  if (!targetReq) throw new HttpError(404, 'Requisition record not found.');

  const allowedPreviousStatuses = newStatus === 'returned' ? ['approved', 'overdue'] : ['pending'];
  if (!allowedPreviousStatuses.includes(targetReq.status)) {
    throw new HttpError(409, `Requisition is already "${targetReq.status}" and cannot transition to "${newStatus}".`);
  }

  const { data: preItem } = await caller.adminClient
    .from('inventory_items')
    .select('*')
    .eq('id', targetReq.item_id)
    .maybeSingle();

  const reqQty = Math.max(1, Number(targetReq.quantity ?? 1));
  const qtyBefore = preItem ? Number(preItem.available_qty ?? 0) : 0;
  const totalQty = preItem ? Number(preItem.total_qty ?? 0) : 0;
  const minThreshold = preItem ? Number(preItem.min_threshold ?? 0) : 0;

  if (newStatus === 'approved' && preItem && qtyBefore < reqQty) {
    throw new HttpError(409, `Insufficient vault stock for "${preItem.name}": only ${qtyBefore} available, ${reqQty} requested.`);
  }

  const istToday = formatTodayIstDate();
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    approved_by: caller.actor.name || 'Admin',
    updated_at: new Date().toISOString(),
  };
  if (newStatus === 'approved') {
    updatePayload.borrow_date = istToday;
    if (adminNotes !== undefined) updatePayload.admin_notes = adminNotes || null;
  } else if (newStatus === 'rejected') {
    if (adminNotes !== undefined) updatePayload.admin_notes = adminNotes || null;
  } else {
    updatePayload.actual_return_date = istToday;
    const cleanExisting = String(targetReq.admin_notes || '')
      .replace(/\[RETURN_REQUESTED\][^\n|]*/g, '')
      .replace(/\|+/g, '|')
      .trim();
    updatePayload.admin_notes = adminNotes || (cleanExisting ? `${cleanExisting} (Returned & Restocked)` : 'Returned & Restocked');
  }

  const { data: updatedRows, error: updateErr } = await caller.adminClient
    .from('borrow_requests')
    .update(updatePayload)
    .eq('id', requestId)
    .in('status', allowedPreviousStatuses)
    .select();

  if (updateErr) throw new HttpError(400, updateErr.message);
  if (!updatedRows || updatedRows.length === 0) {
    throw new HttpError(409, 'Requisition was already processed concurrently.');
  }
  const updatedReq = updatedRows[0];

  const expectedAvail = newStatus === 'approved'
    ? Math.max(0, qtyBefore - reqQty)
    : newStatus === 'returned'
    ? (totalQty > 0 ? Math.min(totalQty, qtyBefore + reqQty) : qtyBefore + reqQty)
    : qtyBefore;

  let finalAvail = qtyBefore;
  let updatedItem = preItem || null;

  if ((newStatus === 'approved' || newStatus === 'returned') && preItem) {
    const { data: postItem } = await caller.adminClient
      .from('inventory_items')
      .select('*')
      .eq('id', preItem.id)
      .maybeSingle();

    const postAvail = postItem ? Number(postItem.available_qty) : qtyBefore;
    if (postItem && postAvail !== qtyBefore) {
      // Adopt authoritative quantity when Postgres trigger adjusted stock atomically.
      finalAvail = postAvail;
      updatedItem = postItem;
    } else if (expectedAvail !== qtyBefore) {
      finalAvail = expectedAvail;
      const nextItemStatus = computeStockStatus(expectedAvail, totalQty, minThreshold);
      const { data: syncedItem } = await caller.adminClient
        .from('inventory_items')
        .update({ available_qty: finalAvail, status: nextItemStatus, updated_at: new Date().toISOString() })
        .eq('id', preItem.id)
        .eq('available_qty', qtyBefore)
        .select()
        .maybeSingle();
      updatedItem = syncedItem || { ...preItem, available_qty: finalAvail, status: nextItemStatus };
    }
  }

  const mappedAction = newStatus === 'approved' ? 'BORROW_APPROVED' : newStatus === 'rejected' ? 'BORROW_REJECTED' : 'ITEM_RETURNED';
  const whereLocation = newStatus === 'returned' ? 'Requisitions & Clearance > Return Clearance' : 'Requisitions & Clearance > Review Queue';
  const actionSummary = newStatus === 'approved'
    ? `${caller.actor.name} approved issue of ${reqQty}x ${targetReq.item_name} for ${targetReq.user_name}`
    : newStatus === 'rejected'
    ? `${caller.actor.name} rejected issue of ${reqQty}x ${targetReq.item_name} for ${targetReq.user_name}${adminNotes ? ` (${adminNotes})` : ''}`
    : `${caller.actor.name} approved return of ${reqQty}x ${targetReq.item_name} from ${targetReq.user_name}`;

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: mappedAction,
    summary: actionSummary,
    actor: caller.actor,
    itemId: targetReq.item_id,
    targetId: targetReq.item_id,
    targetName: `${reqQty}x ${targetReq.item_name}`,
    targetType: 'borrow_request',
    location: preItem?.location,
    where: whereLocation,
    changes: [
      `Borrower: ${targetReq.user_name}`,
      `Qty: ${reqQty}`,
      ...(newStatus === 'approved' || newStatus === 'returned' ? [`Available Qty: ${qtyBefore} -> ${finalAvail}`] : []),
      `Project: "${targetReq.project_name}"`,
      `Status -> ${newStatus.toUpperCase()}`,
      ...(adminNotes ? [`Note: ${adminNotes}`] : []),
    ],
    meta: {
      requestId,
      itemId: targetReq.item_id,
      itemName: targetReq.item_name,
      quantity: reqQty,
      projectName: targetReq.project_name,
      requesterId: targetReq.user_id,
      requesterName: targetReq.user_name,
      requesterEmail: targetReq.user_email,
    },
  });

  return { statusCode: 200, body: { success: true, request: updatedReq, item: updatedItem, qtyBefore, finalAvail, auditLog } };
}

