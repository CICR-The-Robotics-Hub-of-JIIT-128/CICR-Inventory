/**
 * Administrator only catalog CRUD handlers (`add_item`, `update_item`, `delete_item`)
 * for `/api/inventory`. Validates caller clearance, sanitizes counts, and writes audit telemetry.
 */

import type { VercelRequest } from '@vercel/node';
import {
  HttpError,
  recordServerAuditLog,
  requireApprovedAdmin,
} from './supabaseServer';

const VALID_ITEM_STATUSES = new Set(['In Stock', 'Low Stock', 'Out of Stock', 'Maintenance']);

function parseNonNegativeInt(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new HttpError(400, `${fieldName} must be a non-negative integer.`);
  }
  return num;
}

function deriveStockStatus(available: number, total: number, minThreshold: number, requestedStatus?: unknown): string {
  if (requestedStatus === 'Maintenance') return 'Maintenance';
  if (available <= 0) return 'Out of Stock';
  if ((total > 0 && available / total < 0.5) || available <= minThreshold) return 'Low Stock';
  return 'In Stock';
}

/**
 * Registers a new hardware component into `inventory_items` (approved admins only).
 */
export async function handleAddItem(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedAdmin(req);
  const rawItem = (body.item && typeof body.item === 'object' ? body.item : body) as Record<string, any>;

  const name = typeof rawItem.name === 'string' ? rawItem.name.trim() : '';
  const category = typeof rawItem.category === 'string' ? rawItem.category.trim() : '';
  if (!name || !category) {
    throw new HttpError(400, 'Component name and category are required.');
  }

  const totalQty = parseNonNegativeInt(rawItem.total_qty ?? 1, 'total_qty');
  const availableQty = rawItem.available_qty !== undefined
    ? parseNonNegativeInt(rawItem.available_qty, 'available_qty')
    : totalQty;
  if (availableQty > totalQty) {
    throw new HttpError(400, 'available_qty cannot exceed total_qty.');
  }

  const minThreshold = rawItem.min_threshold !== undefined
    ? parseNonNegativeInt(rawItem.min_threshold, 'min_threshold')
    : 2;

  const status = typeof rawItem.status === 'string' && VALID_ITEM_STATUSES.has(rawItem.status)
    ? deriveStockStatus(availableQty, totalQty, minThreshold, rawItem.status)
    : deriveStockStatus(availableQty, totalQty, minThreshold);

  const insertPayload: Record<string, unknown> = {
    name,
    category,
    description: typeof rawItem.description === 'string' ? rawItem.description.trim() : '',
    location: typeof rawItem.location === 'string' ? rawItem.location.trim() : '',
    total_qty: totalQty,
    available_qty: availableQty,
    min_threshold: minThreshold,
    condition: typeof rawItem.condition === 'string' && rawItem.condition.trim() ? rawItem.condition.trim() : 'Good',
    status,
  };
  if (typeof rawItem.sku === 'string' && rawItem.sku.trim()) insertPayload.sku = rawItem.sku.trim();
  if (typeof rawItem.datasheet_url === 'string' && rawItem.datasheet_url.trim()) insertPayload.datasheet_url = rawItem.datasheet_url.trim();
  if (typeof rawItem.image_url === 'string' && rawItem.image_url.trim()) insertPayload.image_url = rawItem.image_url.trim();

  const { data: created, error } = await caller.adminClient
    .from('inventory_items')
    .insert([insertPayload])
    .select()
    .single();

  if (error || !created) {
    throw new HttpError(400, error?.message || 'Failed to add inventory component.');
  }

  const itemChanges = [
    `Category: ${created.category}`,
    `Total Qty: ${created.total_qty}`,
    `Available Qty: ${created.available_qty}`,
    ...(created.sku ? [`SKU: ${created.sku}`] : []),
    ...(created.location ? [`Shelf: ${created.location}`] : []),
  ];

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'CREATE_ITEM',
    summary: `${caller.actor.name} added new component "${created.name}" (${created.category}, Qty: ${created.total_qty})`,
    actor: caller.actor,
    itemId: created.id,
    targetId: created.id,
    targetName: created.name,
    targetType: 'inventory_item',
    location: created.location,
    where: 'Component Vault > Add Component',
    changes: itemChanges,
  });

  return { statusCode: 201, body: { success: true, item: created, auditLog } };
}

/**
 * Updates hardware component specifications or stock counts (approved admins only).
 */
export async function handleUpdateItem(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedAdmin(req);
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
  const updates = body.updates && typeof body.updates === 'object' ? (body.updates as Record<string, any>) : null;
  if (!itemId || !updates) {
    throw new HttpError(400, 'itemId and updates payload are required.');
  }

  const { data: existing, error: fetchError } = await caller.adminClient
    .from('inventory_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchError) throw new HttpError(500, fetchError.message);
  if (!existing) throw new HttpError(404, 'Inventory component not found.');

  const nextTotal = updates.total_qty !== undefined ? parseNonNegativeInt(updates.total_qty, 'total_qty') : Number(existing.total_qty ?? 0);
  const nextAvail = updates.available_qty !== undefined
    ? parseNonNegativeInt(updates.available_qty, 'available_qty')
    : Math.min(nextTotal, Number(existing.available_qty ?? 0));

  if (nextAvail > nextTotal) {
    throw new HttpError(400, 'available_qty cannot exceed total_qty.');
  }

  const nextMinThreshold = updates.min_threshold !== undefined
    ? parseNonNegativeInt(updates.min_threshold, 'min_threshold')
    : Number(existing.min_threshold ?? 2);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    total_qty: nextTotal,
    available_qty: nextAvail,
    min_threshold: nextMinThreshold,
  };

  if (typeof updates.name === 'string') {
    const cleaned = updates.name.trim();
    if (!cleaned) throw new HttpError(400, 'Component name cannot be empty.');
    patch.name = cleaned;
  }
  if (typeof updates.category === 'string' && updates.category.trim()) patch.category = updates.category.trim();
  if (typeof updates.description === 'string') patch.description = updates.description.trim();
  if (typeof updates.location === 'string') patch.location = updates.location.trim();
  if (typeof updates.condition === 'string' && updates.condition.trim()) patch.condition = updates.condition.trim();
  if (typeof updates.sku === 'string') patch.sku = updates.sku.trim() || null;
  if (typeof updates.datasheet_url === 'string') patch.datasheet_url = updates.datasheet_url.trim() || null;
  if (typeof updates.image_url === 'string') patch.image_url = updates.image_url.trim() || null;
  patch.status = deriveStockStatus(nextAvail, nextTotal, nextMinThreshold, updates.status);

  const { data: updated, error: updateErr } = await caller.adminClient
    .from('inventory_items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new HttpError(400, updateErr?.message || 'Failed to update inventory component.');
  }

  const changeParts: string[] = [];
  if (patch.name && patch.name !== existing.name) changeParts.push(`Name: "${existing.name}" -> "${patch.name}"`);
  if (patch.category && patch.category !== existing.category) changeParts.push(`Category: "${existing.category}" -> "${patch.category}"`);
  if (nextTotal !== Number(existing.total_qty)) changeParts.push(`Total Qty: ${existing.total_qty} -> ${nextTotal}`);
  if (nextAvail !== Number(existing.available_qty)) changeParts.push(`Available Qty: ${existing.available_qty} -> ${nextAvail}`);
  if (patch.status && patch.status !== existing.status) changeParts.push(`Status: ${existing.status} -> ${patch.status}`);

  const summary = changeParts.length > 0
    ? `${caller.actor.name} edited "${updated.name}": ${changeParts.join(', ')}`
    : `${caller.actor.name} updated component "${updated.name}" (Total: ${nextTotal}, Available: ${nextAvail})`;

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'UPDATE_ITEM',
    summary,
    actor: caller.actor,
    itemId,
    targetId: itemId,
    targetName: updated.name,
    targetType: 'inventory_item',
    location: updated.location,
    where: 'Component Vault > Component Editor',
    changes: changeParts,
  });

  return { statusCode: 200, body: { success: true, item: updated, auditLog } };
}

/**
 * Deletes a component from `inventory_items` (approved admins only).
 */
export async function handleDeleteItem(req: VercelRequest, body: Record<string, any>) {
  const caller = await requireApprovedAdmin(req);
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
  if (!itemId) throw new HttpError(400, 'itemId is required.');

  const { data: existing, error: fetchError } = await caller.adminClient
    .from('inventory_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchError) throw new HttpError(500, fetchError.message);
  if (!existing) throw new HttpError(404, 'Inventory component not found.');

  const { error: deleteErr } = await caller.adminClient.from('inventory_items').delete().eq('id', itemId);
  if (deleteErr) throw new HttpError(400, deleteErr.message);

  const auditLog = await recordServerAuditLog(caller.adminClient, {
    action: 'DELETE_ITEM',
    summary: `${caller.actor.name} deleted component "${existing.name || itemId}" from vault inventory`,
    actor: caller.actor,
    itemId,
    targetId: itemId,
    targetName: existing.name || itemId,
    targetType: 'inventory_item',
    location: existing.location,
    where: 'Component Vault > Component Removal',
    changes: [
      `Category: ${existing.category}`,
      `Qty Removed: ${existing.total_qty}`,
      ...(existing.sku ? [`SKU: ${existing.sku}`] : []),
    ],
  });

  return { statusCode: 200, body: { success: true, deletedId: itemId, removedItem: existing, auditLog } };
}

