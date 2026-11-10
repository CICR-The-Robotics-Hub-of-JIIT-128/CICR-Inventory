/**
 * @fileoverview Bulk laboratory component return and vault stock reconciliation utility.
 * Transitions all active approved and overdue borrow requests to returned, clears pending
 * return markers, relies on PostgreSQL stock triggers for loan returns, reconciles any
 * residual stock drift to full capacity, and writes structured activity_logs entries.
 */

const { createClient } = require('@supabase/supabase-js');
const { loadEnv } = require('./loadEnv.cjs');

/**
 * Strips user return markers from existing admin notes and appends canonical return status.
 *
 * @param {string | null | undefined} existingNotes - Existing admin_notes on the loan row.
 * @returns {string} Cleaned note persisted on the returned borrow request.
 */
function buildReturnedAdminNotes(existingNotes) {
  const cleaned = String(existingNotes || '')
    .replace(/\[RETURN_REQUESTED\][^\n|]*/g, '')
    .replace(/\|+/g, '|')
    .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
    .trim();

  return cleaned ? `${cleaned} (Returned & Restocked)` : 'Returned & Restocked';
}

/**
 * Resolves the authoritative administrator profile used as the audit actor for batch returns.
 * Falls back gracefully if profile lookup fails so offline or schema edge cases do not block.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Service role client.
 * @returns {Promise<{actorId: string | null, actorName: string, actorEmail: string, actorRoll: string, actorRole: string}>}
 */
async function resolveAdminActor(supabase) {
  const preferredEmail = (process.env.RETURN_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();

  try {
    const { data: admins, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, roll_number, role, status')
      .in('role', ['admin', 'lead'])
      .eq('status', 'approved');

    if (!error && Array.isArray(admins) && admins.length > 0) {
      const matched =
        (preferredEmail
          ? admins.find((profile) => String(profile.email || '').toLowerCase() === preferredEmail)
          : undefined) ||
        admins.find((profile) => profile.role === 'admin') ||
        admins[0];
      if (matched) {
        return {
          actorId: matched.id || null,
          actorName: matched.full_name || 'System Operator',
          actorEmail: matched.email || preferredEmail,
          actorRoll: matched.roll_number || '',
          actorRole: matched.role || 'admin',
        };
      }
    }
  } catch (err) {
    console.warn('Warning: Could not resolve admin profile, using fallback actor metadata.', err);
  }

  return { actorId: null, actorName: 'System Operator', actorEmail: preferredEmail, actorRoll: '', actorRole: 'admin' };
}

/**
 * Inserts a structured JSON audit record compatible with parseAuditLog in src/lib/audit.ts.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Service role client.
 * @param {Awaited<ReturnType<typeof resolveAdminActor>>} actor - Administrator actor metadata.
 * @param {string} action - Canonical audit action code (ITEM_RETURNED or UPDATE_ITEM).
 * @param {string | null} itemId - Target inventory_items UUID.
 * @param {Record<string, unknown>} details - Additional domain attributes merged with actor fields.
 * @returns {Promise<void>}
 */
async function insertAuditEntry(supabase, actor, action, itemId, details) {
  const merged = {
    ...details,
    actorId: actor.actorId || undefined,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    actorRoll: actor.actorRoll,
    actorRole: actor.actorRole,
    route: '/scripts/return_all',
  };
  const payload = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined && value !== '')
  );

  const { error } = await supabase.from('activity_logs').insert([
    {
      user_id: actor.actorId || null,
      user_name: actor.actorName,
      action,
      item_id: itemId || null,
      details: JSON.stringify(payload),
    },
  ]);

  if (error) {
    console.error(`Audit log insert failed for ${action} (${itemId || 'batch'}):`, error.message);
  }
}

/**
 * Executes atomic bulk return of all approved/overdue loans, reconciles residual stock drift
 * across inventory_items, logs structured telemetry, and verifies zero open loans remain.
 *
 * @returns {Promise<void>}
 */
async function returnAll() {
  const { supabaseUrl, serviceRoleKey } = loadEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to return inventory.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Returning all active component loans and reconciling vault inventory...');
  const actor = await resolveAdminActor(supabase);
  const nowIso = new Date().toISOString();
  const todayIsoDate = nowIso.split('T')[0];

  const { data: initialItems, error: itemsFetchErr } = await supabase
    .from('inventory_items')
    .select('id, name, location, total_qty, available_qty, status');
  if (itemsFetchErr) throw new Error(`Failed to fetch inventory items: ${itemsFetchErr.message}`);

  const itemsById = new Map((initialItems || []).map((item) => [item.id, item]));

  const { data: activeRequests, error: reqFetchErr } = await supabase
    .from('borrow_requests')
    .select('*')
    .in('status', ['approved', 'overdue'])
    .order('created_at', { ascending: true });
  if (reqFetchErr) throw new Error(`Failed to fetch active borrow requests: ${reqFetchErr.message}`);

  let returnedRequestCount = 0;

  // Transition active approved/overdue loans individually so Postgres triggers execute once per loan.
  for (const req of activeRequests || []) {
    const targetItem = itemsById.get(req.item_id);
    const reqQty = Math.max(1, Number(req.quantity || 1));
    const preAvail = targetItem ? Number(targetItem.available_qty || 0) : 0;

    const { data: updatedRows, error: reqUpdateErr } = await supabase
      .from('borrow_requests')
      .update({
        status: 'returned',
        actual_return_date: todayIsoDate,
        approved_by: actor.actorName,
        admin_notes: buildReturnedAdminNotes(req.admin_notes),
        updated_at: nowIso,
      })
      .eq('id', req.id)
      .in('status', ['approved', 'overdue'])
      .select();

    if (reqUpdateErr) throw new Error(`Failed to transition request ${req.id} (${req.item_name}): ${reqUpdateErr.message}`);
    if (!updatedRows || updatedRows.length === 0) continue;

    returnedRequestCount += 1;
    const { data: postItem } = await supabase
      .from('inventory_items')
      .select('id, name, location, total_qty, available_qty, status')
      .eq('id', req.item_id)
      .maybeSingle();

    const postAvail = postItem
      ? Number(postItem.available_qty || 0)
      : Math.min(Number(targetItem?.total_qty || preAvail + reqQty), preAvail + reqQty);
    if (postItem) itemsById.set(postItem.id, postItem);

    const borrowerName = req.user_name || 'Member';
    const itemName = postItem?.name || targetItem?.name || req.item_name || 'Component';
    console.log(`Returned loan: ${reqQty}x ${itemName} from ${borrowerName} (${preAvail} -> ${postAvail})`);

    await insertAuditEntry(supabase, actor, 'ITEM_RETURNED', req.item_id, {
      summary: `${actor.actorName} approved return of ${reqQty}x ${itemName} from ${borrowerName}`,
      targetId: req.item_id,
      targetName: `${reqQty}x ${itemName}`,
      targetType: 'borrow_request',
      location: postItem?.location || targetItem?.location || undefined,
      where: 'Requisitions & Clearance > Return Clearance',
      changes: [
        `Borrower: ${borrowerName}`,
        `Qty: ${reqQty}`,
        `Available Qty: ${preAvail} -> ${postAvail}`,
        req.project_name ? `Project: "${req.project_name}"` : undefined,
        'Status -> RETURNED',
      ].filter(Boolean),
      requestId: req.id,
      itemId: req.item_id,
      itemName,
      quantity: reqQty,
      projectName: req.project_name || undefined,
      requesterId: req.user_id || undefined,
      requesterName: borrowerName,
      requesterEmail: req.user_email || undefined,
      timestamp: nowIso,
    });
  }

  // Reconcile any residual discrepancy where available_qty != total_qty or status != In Stock.
  const { data: postReturnItems, error: reconcileFetchErr } = await supabase
    .from('inventory_items')
    .select('id, name, location, total_qty, available_qty, status');
  if (reconcileFetchErr) throw new Error(`Failed to reload inventory items: ${reconcileFetchErr.message}`);

  let reconciledItemCount = 0;
  for (const item of postReturnItems || []) {
    if (Number(item.available_qty) !== Number(item.total_qty) || item.status !== 'In Stock') {
      const { error: itemUpdateErr } = await supabase
        .from('inventory_items')
        .update({ available_qty: item.total_qty, status: 'In Stock', updated_at: nowIso })
        .eq('id', item.id);
      if (itemUpdateErr) throw new Error(`Failed to restore stock on ${item.name}: ${itemUpdateErr.message}`);

      reconciledItemCount += 1;
      console.log(`Reconciled stock: ${item.name} (${item.available_qty} -> ${item.total_qty}/${item.total_qty})`);

      await insertAuditEntry(supabase, actor, 'UPDATE_ITEM', item.id, {
        summary: `${actor.actorName} reconciled "${item.name}" stock to ${item.total_qty}/${item.total_qty}`,
        targetId: item.id,
        targetName: item.name,
        targetType: 'inventory_item',
        location: item.location || undefined,
        where: 'Component Vault > Bulk Stock Return',
        changes: [
          `Available Qty: ${item.available_qty} -> ${item.total_qty}`,
          item.status !== 'In Stock' ? `Status: ${item.status} -> In Stock` : undefined,
        ].filter(Boolean),
        itemId: item.id,
        itemName: item.name,
        timestamp: nowIso,
      });
    }
  }

  // Final verification query to guarantee 100% available assets and zero open loans.
  const { data: verifiedItems, error: verifyItemsErr } = await supabase
    .from('inventory_items')
    .select('id, name, total_qty, available_qty, status');
  if (verifyItemsErr) throw new Error(`Verification query failed on inventory_items: ${verifyItemsErr.message}`);

  const { data: remainingLoans, error: verifyReqErr } = await supabase
    .from('borrow_requests')
    .select('id, item_name, status')
    .in('status', ['approved', 'overdue']);
  if (verifyReqErr) throw new Error(`Verification query failed on borrow_requests: ${verifyReqErr.message}`);

  const totalUnits = (verifiedItems || []).reduce((sum, item) => sum + Number(item.total_qty || 0), 0);
  const availableUnits = (verifiedItems || []).reduce((sum, item) => sum + Number(item.available_qty || 0), 0);
  const unreturnedItems = (verifiedItems || []).filter(
    (item) => Number(item.available_qty) !== Number(item.total_qty) || item.status !== 'In Stock'
  );

  console.log(
    `Verified Backend: Returned Loans = ${returnedRequestCount}, Reconciled Items = ${reconciledItemCount}, ` +
      `Total Assets = ${totalUnits}, Available = ${availableUnits}, Unreturned = ${unreturnedItems.length}, ` +
      `Open Loans = ${(remainingLoans || []).length}`
  );

  if (unreturnedItems.length > 0 || (remainingLoans || []).length > 0 || availableUnits !== totalUnits) {
    throw new Error('Final inventory verification failed: residual unreturned components or active loans remain.');
  }
}

returnAll().catch((error) => {
  console.error('Failed to return all inventory components:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
