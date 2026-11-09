import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem, BorrowRequest, ActivityLog } from '../types/inventory';
import { useAuth, MASTER_ADMIN_EMAILS } from './AuthContext';
import { notifyEmail } from '../lib/notifications';
import { buildAuditDetails } from '../lib/audit';
import {
  extractIdentityFromEmail,
  isDirtyOrPlaceholderName,
  toCleanDisplayName,
} from '../lib/identity';
import { useToast } from '../components/common/Toast';
import {
  notifyRequisitionApproved,
  notifyRequisitionRejected,
  notifyReturnRequested,
  notifyReturnCleared,
  notifyAccountApproved,
  notifyAccountRejected,
  sendDeviceNotification,
} from '../utils/deviceNotification';
import {
  getTodayIsoDate,
  validateExpectedReturnDate,
} from '../utils/returnDate';

const playNotificationChime = (tone: 'up' | 'down') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    if (tone === 'up') {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08);
    } else {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(440.00, ctx.currentTime + 0.08);
    }
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
};

function areItemsEqual(a: InventoryItem[], b: InventoryItem[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].available_qty !== b[i].available_qty ||
      a[i].total_qty !== b[i].total_qty ||
      a[i].status !== b[i].status ||
      a[i].name !== b[i].name ||
      a[i].updated_at !== b[i].updated_at
    ) {
      return false;
    }
  }
  return true;
}

function areRequestsEqual(a: BorrowRequest[], b: BorrowRequest[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].status !== b[i].status ||
      a[i].quantity !== b[i].quantity ||
      a[i].admin_notes !== b[i].admin_notes ||
      a[i].updated_at !== b[i].updated_at
    ) {
      return false;
    }
  }
  return true;
}

function areLogsEqual(a: ActivityLog[], b: ActivityLog[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a[0]?.id === b[0]?.id && a.length === b.length;
}

interface InventoryContextType {
  items: InventoryItem[];
  requests: BorrowRequest[];
  logs: ActivityLog[];
  loading: boolean;
  isLiveDatabase: boolean;
  schemaNeeded: boolean;
  addItem: (item: Omit<InventoryItem, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateItem: (id: string, item: Partial<InventoryItem>) => Promise<{ success: boolean; error?: string }>;
  deleteItem: (id: string) => Promise<{ success: boolean; error?: string }>;
  submitBorrowRequest: (data: {
    itemId: string;
    quantity: number;
    projectName: string;
    purpose: string;
    expectedReturnDate: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateBorrowStatus: (
    requestId: string,
    status: 'approved' | 'rejected' | 'returned',
    adminNotes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  requestItemReturn: (requestId: string, returnNotes?: string) => Promise<{ success: boolean; error?: string }>;
  cancelReturnRequest: (requestId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => Promise<void>;
  broadcastAccountStatus?: (userId: string, email: string, name: string, status: 'approved' | 'rejected') => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, session } = useAuth();
  const { showToast } = useToast();

  const userRef = useRef({ user, profile });
  userRef.current = { user, profile };

  const prevRequestsMapRef = useRef<Map<string, BorrowRequest>>(new Map());
  const hasInitializedRef = useRef<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);
  const inFlightRequestIdsRef = useRef<Set<string>>(new Set());

  const getActorMeta = useCallback(() => {
    const currentUser = userRef.current.user;
    const currentProfile = userRef.current.profile;
    const actorEmail = (currentProfile?.email || currentUser?.email || '').toLowerCase();
    const validProfileName =
      currentProfile?.full_name && !isDirtyOrPlaceholderName(currentProfile.full_name, actorEmail)
        ? currentProfile.full_name
        : '';
    const rawMetaName =
      (currentUser?.user_metadata?.full_name as string) ||
      (currentUser?.user_metadata?.name as string) ||
      '';
    const rawName = validProfileName || rawMetaName || currentProfile?.full_name || '';
    const rawRoll =
      currentProfile?.roll_number ||
      currentProfile?.enrollment_no ||
      (currentUser?.user_metadata?.enrollment_no as string) ||
      (currentUser?.user_metadata?.roll_number as string) ||
      '';
    const identity = extractIdentityFromEmail(actorEmail, {
      ...(currentUser?.user_metadata || {}),
      full_name: rawName,
      enrollment_no: rawRoll,
    });
    const actorName = validProfileName
      ? toCleanDisplayName(validProfileName)
      : identity.fullName || 'System Operator';
    const actorRoll = rawRoll || identity.enrollmentNo || '';
    const isMaster = MASTER_ADMIN_EMAILS.includes(actorEmail);
    const actorRole = isMaster ? 'admin' : currentProfile?.role || 'member';
    return {
      actorId: currentUser?.id,
      actorName,
      actorEmail,
      actorRoll,
      actorRole,
    };
  }, []);

  const writeAuditLog = useCallback(
    async (entry: {
      action: string;
      details: string;
      item_id?: string;
      actorName: string;
      actorId?: string;
    }) => {
      const createdAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        user_id: entry.actorId || null,
        user_name: entry.actorName,
        action: entry.action,
        details: entry.details,
        created_at: createdAt,
        ...(entry.item_id ? { item_id: entry.item_id } : {}),
      };
      try {
        await supabase.from('activity_logs').insert([payload]);
        const optimisticLog: ActivityLog = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          user_id: entry.actorId,
          user_name: entry.actorName,
          action: entry.action,
          details: entry.details,
          item_id: entry.item_id,
          created_at: createdAt,
        };
        setLogs((prev) => [optimisticLog, ...prev]);
      } catch {
        // Logging errors must never fail primary inventory operations
      }
    },
    []
  );

  const broadcastAccountStatus = useCallback(
    (userId: string, email: string, name: string, status: 'approved' | 'rejected') => {
      try {
        if (realtimeChannelRef.current) {
          realtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'ACCOUNT_STATUS_SYNC',
            payload: {
              userId,
              email,
              name,
              status,
              timestamp: Date.now(),
            },
          });
        }
      } catch (err) {
        console.warn('Realtime account sync broadcast note:', err);
      }
    },
    []
  );

  const broadcastLiveEvent = useCallback((eventType: string, reqData: any) => {
    try {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'REQ_SYNC',
          payload: {
            eventType,
            request: reqData,
            senderEmail: userRef.current.user?.email,
            senderName: userRef.current.profile?.full_name || userRef.current.user?.email,
            timestamp: Date.now(),
          },
        });
      }
    } catch {}
  }, []);

  const handleRequestNotification = useCallback(
    (action: string, req: BorrowRequest, fromSelf: boolean) => {
      if (fromSelf) return;

      const currentUser = userRef.current.user;
      const currentProfile = userRef.current.profile;
      const myEmail = (currentUser?.email || '').toLowerCase();
      const myId = currentUser?.id;

      const isCurrentAdmin =
        currentProfile?.role === 'admin' ||
        currentProfile?.role === 'lead' ||
        ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com', '992501030399@mail.jiit.ac.in'].includes(myEmail);

      const isMyRequest =
        (myId && req.user_id === myId) ||
        (myEmail && req.user_email && req.user_email.toLowerCase() === myEmail);

      if (action === 'NEW_REQUEST' && isCurrentAdmin) {
        playNotificationChime('up');
        showToast(
          'info',
          '🔔 New Requisition Request',
          `${req.user_name || 'Member'} requested ${req.quantity}x ${req.item_name} for "${req.project_name || 'project'}"`
        );
        sendDeviceNotification('🔔 New Requisition Request', {
          body: `${req.user_name || 'Member'} requested ${req.quantity}x ${req.item_name} for "${req.project_name || 'project'}"`,
          tag: `admin-req-${req.id}`,
        });
      } else if (action === 'APPROVED') {
        if (isMyRequest) {
          playNotificationChime('up');
          showToast(
            'success',
            '🎉 Requisition Approved!',
            `Your requisition for ${req.quantity}x ${req.item_name} has been approved by admin.`
          );
          notifyRequisitionApproved(req.item_name, req.quantity);
        } else if (isCurrentAdmin) {
          showToast(
            'info',
            'Requisition Approved',
            `${req.approved_by || 'Admin'} approved ${req.item_name} for ${req.user_name}.`
          );
        }
      } else if (action === 'REJECTED' && isMyRequest) {
        playNotificationChime('down');
        showToast(
          'error',
          '❌ Requisition Rejected',
          `Your requisition for ${req.item_name} was rejected.${req.admin_notes ? ` Note: ${req.admin_notes}` : ''}`
        );
        notifyRequisitionRejected(req.item_name, req.admin_notes);
      } else if (action === 'RETURN_REQUESTED' && isCurrentAdmin) {
        playNotificationChime('up');
        showToast(
          'info',
          '🔄 Return Clearance Requested',
          `${req.user_name || 'Member'} requested return for ${req.item_name}.`
        );
        notifyReturnRequested(req.item_name, req.user_name);
      } else if (action === 'RETURN_ACCEPTED' && isMyRequest) {
        playNotificationChime('up');
        showToast(
          'success',
          '📦 Hardware Return Cleared',
          `Your return for ${req.item_name} has been verified & restocked by laboratory admin.`
        );
        notifyReturnCleared(req.item_name);
      }
    },
    [showToast]
  );

  const [items, setItems] = useState<InventoryItem[]>(() => {
    try {
      const cached = localStorage.getItem('cicr-cached-inventory');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [requests, setRequests] = useState<BorrowRequest[]>(() => {
    try {
      const cached = localStorage.getItem('cicr-cached-requests');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    try {
      // Purge unencrypted historical audit logs from localStorage to prevent console inspection
      localStorage.removeItem('cicr-cached-logs');
      return [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('cicr-cached-inventory');
      return !cached || JSON.parse(cached).length === 0;
    } catch {
      return true;
    }
  });
  const [isLiveDatabase, setIsLiveDatabase] = useState<boolean>(false);
  const [schemaNeeded, setSchemaNeeded] = useState<boolean>(false);

  // Fetch real data from Supabase backend in parallel for maximum speed
  const refreshData = useCallback(async () => {
    // Only set visible loading state if there are zero cached items (avoids UI flickering)
    setItems((currentItems) => {
      if (currentItems.length === 0) setLoading(true);
      return currentItems;
    });

    const currentUser = userRef.current.user;
    const currentProfile = userRef.current.profile;
    const isUserAdmin = Boolean(
      currentUser &&
      (MASTER_ADMIN_EMAILS.includes((currentUser.email || '').toLowerCase()) || currentProfile?.role === 'admin')
    );

    try {
      // Parallelize item, request, and (for admins only) audit log queries simultaneously
      const [itemsRes, requestsRes, logsRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('*')
          .order('created_at', { ascending: false })
          .then(
            (res) => res,
            (err: unknown) => ({ data: null, error: err as any })
          ),
        currentUser
          ? supabase
              .from('borrow_requests')
              .select('*')
              .order('created_at', { ascending: false })
              .then(
                (res) => res,
                (err: unknown) => ({ data: null, error: err as any })
              )
          : Promise.resolve({ data: [] as any[], error: null }),
        isUserAdmin
          ? supabase
              .from('activity_logs')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(2500)
              .then(
                (res) => res,
                (err: unknown) => ({ data: null, error: err as any })
              )
          : Promise.resolve({ data: null as ActivityLog[] | null, error: null }),
      ]);

      const { data: dbItems, error: itemsError } = itemsRes;

      if (itemsError) {
        if (itemsError.code === 'PGRST205' || itemsError.message.includes('not find the table')) {
          setSchemaNeeded(true);
          setIsLiveDatabase(false);
          setItems([]);
        } else {
          setItems([]);
        }
      } else if (dbItems) {
        setIsLiveDatabase(true);
        setSchemaNeeded(false);
        const normalizedItems: InventoryItem[] = (dbItems as any[]).map((item) => ({
          ...item,
          total_qty: Number(item.total_qty ?? item.quantity ?? 1),
          available_qty: Number(item.available_qty ?? item.available_quantity ?? item.total_qty ?? item.quantity ?? 1),
        }));

        setItems((prev) => {
          if (areItemsEqual(prev, normalizedItems)) return prev;
          try {
            localStorage.setItem('cicr-cached-inventory', JSON.stringify(normalizedItems));
          } catch {}
          return normalizedItems;
        });

        if (requestsRes.data) {
          const newReqs = requestsRes.data as BorrowRequest[];

          // Sub-second status change detection
          if (hasInitializedRef.current) {
            const prevMap = prevRequestsMapRef.current;
            for (const r of newReqs) {
              const old = prevMap.get(r.id);
              if (!old) {
                if (r.status === 'pending') {
                  handleRequestNotification('NEW_REQUEST', r, false);
                }
              } else if (old.status !== r.status) {
                if (r.status === 'approved') {
                  handleRequestNotification('APPROVED', r, false);
                } else if (r.status === 'rejected') {
                  handleRequestNotification('REJECTED', r, false);
                } else if (r.status === 'returned') {
                  handleRequestNotification('RETURN_ACCEPTED', r, false);
                }
              }
            }
          }

          const newMap = new Map<string, BorrowRequest>();
          newReqs.forEach((r) => newMap.set(r.id, r));
          prevRequestsMapRef.current = newMap;
          hasInitializedRef.current = true;

          setRequests((prev) => {
            if (areRequestsEqual(prev, newReqs)) return prev;
            try {
              localStorage.setItem('cicr-cached-requests', JSON.stringify(newReqs));
            } catch {}
            return newReqs;
          });
        }

        if (logsRes && logsRes.data) {
          const rawLogs = logsRes.data as ActivityLog[];
          // Security: scrub any sensitive fields before storing in state and do not persist to localStorage
          const sanitizedLogs = rawLogs.map((log) => {
            if (typeof log.details === 'string') {
              try {
                const parsed = JSON.parse(log.details);
                if (parsed.password || parsed.password_hash || parsed.token) {
                  delete parsed.password;
                  delete parsed.password_hash;
                  delete parsed.token;
                  parsed.password_scrubbed = true;
                  return { ...log, details: JSON.stringify(parsed) };
                }
              } catch {}
            }
            return log;
          });

          setLogs((prev) => {
            if (areLogsEqual(prev, sanitizedLogs)) return prev;
            return sanitizedLogs;
          });
        }
      }
    } catch {
      // Fallback on network errors
    } finally {
      setLoading(false);
    }
  }, [handleRequestNotification]);

  useEffect(() => {
    refreshData();

    // Supabase Realtime Broadcast Channel (sub-50ms instant sync)
    const channel = supabase.channel('cicr-live-requisitions-sync');
    realtimeChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'ACCOUNT_STATUS_SYNC' }, (payload) => {
        const data = payload?.payload;
        if (!data) return;
        const myEmail = (user?.email || '').toLowerCase().trim();
        const myId = user?.id;
        const targetEmail = (data?.email || '').toLowerCase().trim();
        const targetId = data?.userId;
        const isMe = (myEmail && targetEmail && myEmail === targetEmail) || (myId && targetId && myId === targetId);

        if (isMe) {
          if (data.status === 'approved') {
            notifyAccountApproved(data.name || 'Member', true);
            showToast('success', '🎉 Account Approved!', 'Your account has been authorized. You can now access all portal features.');
          } else if (data.status === 'rejected') {
            notifyAccountRejected(data.name || 'Member', true);
            showToast('error', 'Account Registration Update', 'Your registration request was reviewed and declined by administrator.');
          }
        }
      })
      .on('broadcast', { event: 'REQ_SYNC' }, (payload) => {
        const data = payload?.payload;
        if (!data) return;
        const { eventType, request, senderEmail } = data;
        const isFromSelf = Boolean(
          senderEmail && user?.email && senderEmail.toLowerCase() === user.email.toLowerCase()
        );
        if (request) {
          handleRequestNotification(eventType, request, isFromSelf);
        }
        // Immediately fetch latest state without refreshing page
        refreshData();
      })
      .subscribe();

    // Gentle 25s background sync fallback (instant real-time updates are pushed via Supabase Realtime Broadcast)
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshData();
      }
    }, 25000);

    const handleFocus = () => {
      refreshData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [refreshData, handleRequestNotification, user?.email]);

  // Real Add Item in Supabase
  const addItem = async (newItemData: Omit<InventoryItem, 'id'>) => {
    try {
      const isAuthorized =
        profile?.role === 'admin' ||
        profile?.role === 'lead' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com', '992501030399@mail.jiit.ac.in'].includes(
              user.email.toLowerCase()
            )
        );
      if (!isAuthorized) {
        return { success: false, error: 'Unauthorized: Administrative role required to register equipment.' };
      }
      const { data, error } = await supabase
        .from('inventory_items')
        .insert([newItemData])
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      if (data) {
        setItems((prev) => [data as InventoryItem, ...prev]);
        const actor = getActorMeta();
        const itemChanges = [
          `Category: ${newItemData.category}`,
          `Total Qty: ${newItemData.total_qty}`,
          `Available Qty: ${newItemData.available_qty}`,
          ...(newItemData.sku ? [`SKU: ${newItemData.sku}`] : []),
          ...(newItemData.location ? [`Shelf: ${newItemData.location}`] : []),
        ];
        await writeAuditLog({
          action: 'CREATE_ITEM',
          actorId: actor.actorId,
          actorName: actor.actorName,
          item_id: data.id,
          details: buildAuditDetails({
            summary: `${actor.actorName} added new component "${newItemData.name}" (${newItemData.category}, Qty: ${newItemData.total_qty})`,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorEmail: actor.actorEmail,
            actorRoll: actor.actorRoll,
            actorRole: actor.actorRole,
            targetId: data.id,
            targetName: newItemData.name,
            targetType: 'inventory_item',
            location: newItemData.location,
            where: 'Component Vault › Add Component',
            changes: itemChanges,
          }),
        });
        await notifyEmail(
          'item_created',
          actor.actorEmail,
          {
            name: actor.actorName,
            email: actor.actorEmail,
            role: actor.actorRole,
            item: newItemData.name,
            category: newItemData.category,
            notes: itemChanges.join(', '),
          },
          { accessToken: session?.access_token }
        );
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  };

  // Real Update Item in Supabase with guaranteed backend persistence & audit logging
  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    try {
      const isAuthorized =
        profile?.role === 'admin' ||
        profile?.role === 'lead' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com', '992501030399@mail.jiit.ac.in'].includes(
              user.email.toLowerCase()
            )
        );

      if (!isAuthorized) {
        return { success: false, error: 'Unauthorized: Administrative privileges required to edit equipment.' };
      }

      const targetItem = items.find((i) => i.id === id);

      const cleanUpdates: any = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      delete cleanUpdates.id;
      delete cleanUpdates.created_at;

      // Update via Supabase client
      let { data, error } = await supabase
        .from('inventory_items')
        .update(cleanUpdates)
        .eq('id', id)
        .select();

      if (error) {
        return { success: false, error: error.message };
      }

      // Update immediate local state
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...cleanUpdates } : item))
      );

      // Detailed change tracking for audit log
      const actor = getActorMeta();
      const logName = cleanUpdates.name || targetItem?.name || 'Component';
      const itemLocation = cleanUpdates.location !== undefined ? cleanUpdates.location : targetItem?.location;

      const changeParts: string[] = [];
      if (cleanUpdates.name && targetItem && cleanUpdates.name !== targetItem.name) {
        changeParts.push(`Name: "${targetItem.name}" → "${cleanUpdates.name}"`);
      }
      if (cleanUpdates.category && targetItem && cleanUpdates.category !== targetItem.category) {
        changeParts.push(`Category: "${targetItem.category}" → "${cleanUpdates.category}"`);
      }
      if (cleanUpdates.sku !== undefined && targetItem && (cleanUpdates.sku || '') !== (targetItem.sku || '')) {
        changeParts.push(`SKU: "${targetItem.sku || '—'}" → "${cleanUpdates.sku || '—'}"`);
      }
      if (cleanUpdates.location !== undefined && targetItem && (cleanUpdates.location || '') !== (targetItem.location || '')) {
        changeParts.push(`Location: "${targetItem.location || '—'}" → "${cleanUpdates.location || '—'}"`);
      }
      if (cleanUpdates.total_qty !== undefined && targetItem && Number(cleanUpdates.total_qty) !== Number(targetItem.total_qty)) {
        changeParts.push(`Total Qty: ${targetItem.total_qty} → ${cleanUpdates.total_qty}`);
      }
      if (cleanUpdates.available_qty !== undefined && targetItem && Number(cleanUpdates.available_qty) !== Number(targetItem.available_qty)) {
        changeParts.push(`Available Qty: ${targetItem.available_qty} → ${cleanUpdates.available_qty}`);
      }
      if (cleanUpdates.min_threshold !== undefined && targetItem && Number(cleanUpdates.min_threshold) !== Number(targetItem.min_threshold)) {
        changeParts.push(`Min Threshold: ${targetItem.min_threshold} → ${cleanUpdates.min_threshold}`);
      }
      if (cleanUpdates.condition !== undefined && targetItem && (cleanUpdates.condition || '') !== (targetItem.condition || '')) {
        changeParts.push(`Condition: "${targetItem.condition || '—'}" → "${cleanUpdates.condition || '—'}"`);
      }
      if (cleanUpdates.status && targetItem && cleanUpdates.status !== targetItem.status) {
        changeParts.push(`Status: ${targetItem.status} → ${cleanUpdates.status}`);
      }
      if (cleanUpdates.description !== undefined && targetItem && cleanUpdates.description !== targetItem.description) {
        changeParts.push('Description updated');
      }

      const logSummary =
        changeParts.length > 0
          ? `${actor.actorName} edited "${logName}": ${changeParts.join(', ')}`
          : `${actor.actorName} updated component "${logName}" (Total: ${cleanUpdates.total_qty ?? targetItem?.total_qty}, Available: ${cleanUpdates.available_qty ?? targetItem?.available_qty})`;

      await writeAuditLog({
        action: 'UPDATE_ITEM',
        actorId: actor.actorId,
        actorName: actor.actorName,
        item_id: id,
        details: buildAuditDetails({
          summary: logSummary,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorEmail: actor.actorEmail,
          actorRoll: actor.actorRoll,
          actorRole: actor.actorRole,
          targetId: id,
          targetName: logName,
          targetType: 'inventory_item',
          location: itemLocation,
          where: 'Component Vault › Component Editor',
          changes: changeParts,
        }),
      });

      await notifyEmail(
        'item_edited',
        actor.actorEmail,
        {
          name: actor.actorName,
          email: actor.actorEmail,
          role: actor.actorRole,
          item: logName,
          category: cleanUpdates.category || targetItem?.category,
          notes: changeParts.length > 0 ? changeParts.join(', ') : logSummary,
        },
        { accessToken: session?.access_token }
      );

      // Re-sync with backend in background
      refreshData();

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database update failed';
      return { success: false, error: msg };
    }
  };

  // Real Delete Item in Supabase
  const deleteItem = async (id: string) => {
    try {
      const isAuthorized =
        profile?.role === 'admin' ||
        profile?.role === 'lead' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com', '992501030399@mail.jiit.ac.in'].includes(
              user.email.toLowerCase()
            )
        );
      if (!isAuthorized) {
        return { success: false, error: 'Unauthorized: Administrative role required to delete equipment.' };
      }
      const targetItem = items.find((i) => i.id === id);
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) return { success: false, error: error.message };

      setItems((prev) => prev.filter((i) => i.id !== id));
      const actor = getActorMeta();
      await writeAuditLog({
        action: 'DELETE_ITEM',
        actorId: actor.actorId,
        actorName: actor.actorName,
        item_id: id,
        details: buildAuditDetails({
          summary: `${actor.actorName} deleted component "${targetItem?.name || id}" from vault inventory`,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorEmail: actor.actorEmail,
          actorRoll: actor.actorRoll,
          actorRole: actor.actorRole,
          targetId: id,
          targetName: targetItem?.name || id,
          targetType: 'inventory_item',
          location: targetItem?.location,
          where: 'Component Vault › Component Removal',
          changes: targetItem
            ? [
                `Category: ${targetItem.category}`,
                `Qty Removed: ${targetItem.total_qty}`,
                ...(targetItem.sku ? [`SKU: ${targetItem.sku}`] : []),
              ]
            : undefined,
        }),
      });
      await notifyEmail(
        'item_deleted',
        actor.actorEmail,
        {
          name: actor.actorName,
          email: actor.actorEmail,
          role: actor.actorRole,
          item: targetItem?.name || id,
          category: targetItem?.category,
          notes: 'Component removed from vault inventory',
        },
        { accessToken: session?.access_token }
      );
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete from DB';
      return { success: false, error: msg };
    }
  };

  // Real Submit Borrow Request
  const submitBorrowRequest = async (data: {
    itemId: string;
    quantity: number;
    projectName: string;
    purpose: string;
    expectedReturnDate: string;
  }) => {
    if (!user) {
      return { success: false, error: 'Authentication required to submit requisition.' };
    }
    if (!data.quantity || data.quantity < 1 || !Number.isInteger(data.quantity)) {
      return { success: false, error: 'Invalid quantity: Must be a positive integer.' };
    }
    const returnDateCheck = validateExpectedReturnDate(data.expectedReturnDate);
    if (!returnDateCheck.valid || !returnDateCheck.normalizedDate) {
      return {
        success: false,
        error: returnDateCheck.error || 'Expected return date cannot be in the past.',
      };
    }
    const validatedReturnDate = returnDateCheck.normalizedDate;
    const item = items.find((i) => i.id === data.itemId);
    if (!item) return { success: false, error: 'Item not found' };
    if (item.available_qty < data.quantity) {
      return { success: false, error: `Only ${item.available_qty} items available in stock` };
    }
    // Prevent duplicate pending borrow request for the same item by the same member
    const existingPending = requests.find(
      (r) =>
        r.item_id === item.id &&
        (r.user_id === user?.id || (user?.email && r.user_email?.toLowerCase() === user?.email?.toLowerCase())) &&
        r.status === 'pending'
    );
    if (existingPending) {
      return {
        success: false,
        error: `You already have an active pending request for "${item.name}". Please wait for administrator clearance before submitting another request for this item.`,
      };
    }


    try {
      const actor = getActorMeta();
      const borrowerEmail = actor.actorEmail || profile?.email || user?.email || '';
      const borrowerName = actor.actorName || 'Student Member';
      const { data: dbData, error } = await supabase
        .from('borrow_requests')
        .insert([
          {
            item_id: item.id,
            user_id: user?.id,
            user_name: borrowerName,
            user_email: borrowerEmail,
            item_name: item.name,
            quantity: data.quantity,
            project_name: data.projectName,
            purpose: data.purpose,
            status: 'pending',
            expected_return_date: validatedReturnDate,
          },
        ])
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      if (dbData) {
        setRequests((prev) => [dbData as BorrowRequest, ...prev]);
        broadcastLiveEvent('NEW_REQUEST', dbData);
        await writeAuditLog({
          action: 'BORROW_REQUEST',
          actorId: actor.actorId,
          actorName: borrowerName,
          item_id: item.id,
          details: buildAuditDetails({
            summary: `${borrowerName} requested ${data.quantity}x ${item.name} for "${data.projectName}"`,
            actorId: actor.actorId,
            actorName: borrowerName,
            actorEmail: borrowerEmail,
            actorRoll: actor.actorRoll,
            actorRole: actor.actorRole,
            targetId: item.id,
            targetName: `${data.quantity}x ${item.name}`,
            targetType: 'borrow_request',
            location: item.location,
            where: 'Component Vault › Requisition Checkout',
            changes: [
              `Project: "${data.projectName}"`,
              `Qty: ${data.quantity}`,
              `Due: ${validatedReturnDate}`,
            ],
            meta: {
              requestId: dbData.id,
              itemId: item.id,
              itemName: item.name,
              quantity: data.quantity,
              projectName: data.projectName,
              expectedReturnDate: validatedReturnDate,
              requesterId: actor.actorId,
              requesterName: borrowerName,
              requesterEmail: borrowerEmail,
              requesterRoll: actor.actorRoll,
            },
          }),
        });
        await notifyEmail(
          'borrow_requested',
          borrowerEmail,
          {
            name: borrowerName,
            email: borrowerEmail,
            item: `${data.quantity}x ${item.name}`,
            project: data.projectName,
            status: 'pending',
            dueDate: validatedReturnDate,
            notifyAdmins: true,
          },
          { accessToken: session?.access_token }
        );
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database request failed';
      return { success: false, error: msg };
    }
  };

  // Real Update Borrow Status with atomic transition guard and single-source stock sync
  const updateBorrowStatus = async (
    requestId: string,
    newStatus: 'approved' | 'rejected' | 'returned',
    adminNotes?: string
  ) => {
    const isAuthorized =
      profile?.role === 'admin' ||
      profile?.role === 'lead' ||
      Boolean(
        user?.email &&
          MASTER_ADMIN_EMAILS.includes(user.email.toLowerCase())
      );
    if (!isAuthorized) {
      return { success: false, error: 'Unauthorized: Administrative clearance required to approve, reject, or confirm returns.' };
    }

    if (inFlightRequestIdsRef.current.has(requestId)) {
      return { success: false, error: 'This requisition is already being processed. Please wait.' };
    }
    inFlightRequestIdsRef.current.add(requestId);

    try {
      // 1. Fetch fresh request state directly from database so stale UI state never replays transitions
      const { data: freshReqData, error: reqFetchError } = await supabase
        .from('borrow_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

      if (reqFetchError) {
        return { success: false, error: reqFetchError.message };
      }

      const targetReq = (freshReqData as BorrowRequest | null) || requests.find((r) => r.id === requestId) || null;
      if (!targetReq) {
        return { success: false, error: 'Requisition record not found.' };
      }

      // 2. Enforce strict status transition preconditions
      const allowedPreviousStatuses =
        newStatus === 'returned' ? ['approved', 'overdue'] : ['pending'];

      if (!allowedPreviousStatuses.includes(targetReq.status)) {
        await refreshData();
        return {
          success: false,
          error: `Requisition is already "${targetReq.status}" and cannot transition to "${newStatus}".`,
        };
      }

      // 3. Read pre-transition stock count from database
      const { data: preItemData } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', targetReq.item_id)
        .maybeSingle();

      const targetItem = (preItemData as InventoryItem | null) || items.find((i) => i.id === targetReq.item_id);
      const reqQty = Math.max(1, Number(targetReq.quantity ?? 1));
      const qtyBefore = targetItem ? Number(targetItem.available_qty ?? 0) : 0;
      const totalQty = targetItem ? Number(targetItem.total_qty ?? 0) : 0;
      const minThreshold = targetItem ? Number(targetItem.min_threshold ?? 0) : 0;

      if (newStatus === 'approved' && targetItem && qtyBefore < reqQty) {
        return {
          success: false,
          error: `Insufficient vault stock for "${targetItem.name}": only ${qtyBefore} available, ${reqQty} requested.`,
        };
      }

      const expectedAvail =
        newStatus === 'approved'
          ? Math.max(0, qtyBefore - reqQty)
          : newStatus === 'returned'
          ? totalQty > 0
            ? Math.min(totalQty, qtyBefore + reqQty)
            : qtyBefore + reqQty
          : qtyBefore;

      const actor = getActorMeta();
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        approved_by: actor.actorName || 'Admin',
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'approved') {
        updatePayload.borrow_date = getTodayIsoDate();
      } else if (newStatus === 'returned') {
        updatePayload.actual_return_date = getTodayIsoDate();
        const cleanNotes = (targetReq.admin_notes || '')
          .replace(/\[RETURN_REQUESTED\][^\n|]*/g, '')
          .replace(/\|+/g, '|')
          .trim();
        updatePayload.admin_notes =
          adminNotes || (cleanNotes ? `${cleanNotes} (Returned & Restocked)` : 'Returned & Restocked');
      }

      // 4. Atomically update borrow_requests ONLY if status still matches expectedPreviousStatuses.
      //    Postgres trigger `on_borrow_request_status_change` updates inventory_items.available_qty once on status change.
      const { data: transitionedRows, error: updateError } = await supabase
        .from('borrow_requests')
        .update(updatePayload)
        .eq('id', requestId)
        .in('status', allowedPreviousStatuses)
        .select();

      if (updateError) return { success: false, error: updateError.message };
      if (!transitionedRows || transitionedRows.length === 0) {
        await refreshData();
        return {
          success: false,
          error: 'Requisition was already processed concurrently. Syncing latest state.',
        };
      }

      const updatedReq = transitionedRows[0] as BorrowRequest;

      // 5. Verify post-transition item quantity in DB to avoid double decrement/increment:
      //    - If Postgres trigger updated available_qty, adopt its authoritative value cleanly.
      //    - Only if Postgres trigger did not run (available_qty still equals qtyBefore when delta expected), apply single fallback update.
      let finalAvail = qtyBefore;
      let finalStatusLabel = targetItem?.status || 'In Stock';

      if ((newStatus === 'approved' || newStatus === 'returned') && targetItem) {
        const { data: postItemData } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('id', targetItem.id)
          .maybeSingle();

        const postAvail = postItemData ? Number(postItemData.available_qty) : qtyBefore;
        const statusForAvail = (avail: number) =>
          avail <= 0
            ? 'Out of Stock'
            : (totalQty > 0 && avail / totalQty < 0.5) || avail <= minThreshold
            ? 'Low Stock'
            : 'In Stock';

        if (postItemData && postAvail !== qtyBefore) {
          // Database trigger already adjusted stock atomically — do NOT mutate stock a second time.
          finalAvail = postAvail;
          finalStatusLabel = (postItemData.status as InventoryItem['status']) || statusForAvail(postAvail);
          setItems((prev) =>
            prev.map((it) =>
              it.id === targetItem.id
                ? { ...it, ...postItemData, available_qty: finalAvail, status: finalStatusLabel }
                : it
            )
          );
        } else if (expectedAvail !== qtyBefore) {
          // Database trigger not installed: perform single fallback adjustment with optimistic lock
          finalAvail = expectedAvail;
          finalStatusLabel = statusForAvail(expectedAvail);

          await supabase
            .from('inventory_items')
            .update({
              available_qty: finalAvail,
              status: finalStatusLabel,
              updated_at: new Date().toISOString(),
            })
            .eq('id', targetItem.id)
            .eq('available_qty', qtyBefore);

          setItems((prev) =>
            prev.map((it) =>
              it.id === targetItem.id
                ? { ...it, available_qty: finalAvail, status: finalStatusLabel }
                : it
            )
          );
        }
      }

      // Immediately update local requests state
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...updatedReq, status: newStatus } : r))
      );

      const liveType =
        newStatus === 'approved'
          ? 'APPROVED'
          : newStatus === 'rejected'
          ? 'REJECTED'
          : 'RETURN_ACCEPTED';
      broadcastLiveEvent(liveType, { ...targetReq, ...updatedReq, status: newStatus });

      // Log forensic activity in Supabase
      const borrowerIdentity = extractIdentityFromEmail(targetReq.user_email, {
        full_name: targetReq.user_name,
      });
      const borrowerName =
        targetReq.user_name && !isDirtyOrPlaceholderName(targetReq.user_name, targetReq.user_email)
          ? toCleanDisplayName(targetReq.user_name)
          : borrowerIdentity.fullName;
      const borrowerRoll = borrowerIdentity.enrollmentNo;

      const mappedAction =
        newStatus === 'approved'
          ? 'BORROW_APPROVED'
          : newStatus === 'rejected'
          ? 'BORROW_REJECTED'
          : 'ITEM_RETURNED';
      const whereLocation =
        newStatus === 'returned'
          ? 'Requisitions & Clearance › Return Clearance'
          : 'Requisitions & Clearance › Review Queue';
      const actionSummary =
        newStatus === 'approved'
          ? `${actor.actorName} approved issue of ${reqQty}x ${targetReq.item_name} for ${borrowerName}`
          : newStatus === 'rejected'
          ? `${actor.actorName} rejected issue of ${reqQty}x ${targetReq.item_name} for ${borrowerName}${adminNotes ? ` (${adminNotes})` : ''}`
          : `${actor.actorName} approved return of ${reqQty}x ${targetReq.item_name} from ${borrowerName}`;

      await writeAuditLog({
        action: mappedAction,
        actorId: actor.actorId,
        actorName: actor.actorName,
        item_id: targetReq.item_id,
        details: buildAuditDetails({
          summary: actionSummary,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorEmail: actor.actorEmail,
          actorRoll: actor.actorRoll,
          actorRole: actor.actorRole,
          targetId: targetReq.item_id,
          targetName: `${reqQty}x ${targetReq.item_name}`,
          targetType: 'borrow_request',
          location: targetItem?.location,
          where: whereLocation,
          changes: [
            `Borrower: ${borrowerName}`,
            ...(borrowerRoll ? [`Roll: ${borrowerRoll}`] : []),
            `Qty: ${reqQty}`,
            ...(newStatus === 'approved' || newStatus === 'returned'
              ? [`Available Qty: ${qtyBefore} → ${finalAvail}`]
              : []),
            `Project: "${targetReq.project_name}"`,
            `Status → ${newStatus.toUpperCase()}`,
            ...(adminNotes ? [`Note: ${adminNotes}`] : []),
          ],
          meta: {
            requestId,
            itemId: targetReq.item_id,
            itemName: targetReq.item_name,
            quantity: reqQty,
            projectName: targetReq.project_name,
            requesterId: targetReq.user_id,
            requesterName: borrowerName,
            requesterEmail: targetReq.user_email,
            requesterRoll: borrowerRoll,
          },
        }),
      });

      const event = newStatus === 'approved'
        ? 'borrow_approved'
        : newStatus === 'rejected'
        ? 'borrow_rejected'
        : 'item_returned';
      await notifyEmail(
        event,
        targetReq.user_email,
        {
          name: borrowerName,
          email: targetReq.user_email,
          item: `${reqQty}x ${targetReq.item_name}`,
          project: targetReq.project_name,
          status: newStatus,
          dueDate: targetReq.expected_return_date,
          adminName: actor.actorName,
          notes: adminNotes,
        },
        { accessToken: session?.access_token }
      );

      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update request';
      return { success: false, error: msg };
    } finally {
      inFlightRequestIdsRef.current.delete(requestId);
    }
  };

  const requestItemReturn = async (requestId: string, returnNotes?: string) => {
    try {
      const targetReq = requests.find((r) => r.id === requestId);
      if (!targetReq) return { success: false, error: 'Requisition record not found.' };

      // Strictly ensure only the user who issued it (or an admin) can initiate the return!
      const isOwner =
        (user?.id && targetReq.user_id === user.id) ||
        (user?.email && targetReq.user_email?.toLowerCase() === user.email.toLowerCase());
      const isAuthorizedAdmin =
        profile?.role === 'admin' ||
        profile?.role === 'lead' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com', '992501030399@mail.jiit.ac.in'].includes(
              user.email.toLowerCase()
            )
        );

      if (!isOwner && !isAuthorizedAdmin) {
        return { success: false, error: 'Unauthorized: Only the member who issued this component can initiate its return.' };
      }

      if (targetReq.status !== 'approved') {
        return { success: false, error: 'Only active issued loans can be submitted for return.' };
      }

      const noteTag = '[RETURN_REQUESTED]';
      const cleanExistingNotes = (targetReq.admin_notes || '').replace(/\[RETURN_REQUESTED\][^\n|]*/g, '').replace(/\|+/g, '|').trim();
      const actor = getActorMeta();
      const userDisplay = actor.actorName || 'Member';
      const updatedNotes = returnNotes?.trim()
        ? `${noteTag} (${userDisplay}): ${returnNotes.trim()}${cleanExistingNotes ? ` | ${cleanExistingNotes}` : ''}`
        : `${noteTag} Return submitted by ${userDisplay} on ${new Date().toLocaleDateString('en-IN')}${cleanExistingNotes ? ` | ${cleanExistingNotes}` : ''}`;

      const { error } = await supabase
        .from('borrow_requests')
        .update({
          admin_notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) return { success: false, error: error.message };

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, admin_notes: updatedNotes, updated_at: new Date().toISOString() }
            : r
        )
      );

      broadcastLiveEvent('RETURN_REQUESTED', { ...targetReq, admin_notes: updatedNotes });

      const targetItem = items.find((i) => i.id === targetReq.item_id);
      await writeAuditLog({
        action: 'RETURN_REQUEST',
        actorId: actor.actorId,
        actorName: actor.actorName,
        item_id: targetReq.item_id,
        details: buildAuditDetails({
          summary: `${actor.actorName} requested return of ${targetReq.quantity}x ${targetReq.item_name} for "${targetReq.project_name}"`,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorEmail: actor.actorEmail,
          actorRoll: actor.actorRoll,
          actorRole: actor.actorRole,
          targetId: targetReq.item_id,
          targetName: `${targetReq.quantity}x ${targetReq.item_name}`,
          targetType: 'borrow_request',
          location: targetItem?.location,
          where: 'Requisitions & Clearance › My Requisitions',
          changes: [
            `Project: "${targetReq.project_name}"`,
            `Qty: ${targetReq.quantity}`,
            ...(returnNotes?.trim() ? [`Note: ${returnNotes.trim()}`] : []),
          ],
          meta: {
            requestId,
            itemId: targetReq.item_id,
            itemName: targetReq.item_name,
            quantity: targetReq.quantity,
            projectName: targetReq.project_name,
            requesterId: actor.actorId,
            requesterName: actor.actorName,
            requesterEmail: actor.actorEmail,
            requesterRoll: actor.actorRoll,
          },
        }),
      });

      const targetBorrowerEmail = (targetReq.user_email || actor.actorEmail || '').toLowerCase();
      const targetBorrowerIdentity = extractIdentityFromEmail(targetBorrowerEmail, {
        full_name: targetReq.user_name,
      });
      const targetBorrowerName =
        targetBorrowerEmail === actor.actorEmail
          ? actor.actorName
          : targetReq.user_name && !isDirtyOrPlaceholderName(targetReq.user_name, targetBorrowerEmail)
          ? toCleanDisplayName(targetReq.user_name)
          : targetBorrowerIdentity.fullName;

      await notifyEmail(
        'return_requested',
        targetBorrowerEmail,
        {
          name: targetBorrowerName,
          email: targetBorrowerEmail,
          item: `${targetReq.quantity}x ${targetReq.item_name}`,
          project: targetReq.project_name,
          status: 'return requested',
          dueDate: targetReq.expected_return_date,
          notes:
            returnNotes?.trim() ||
            (targetBorrowerEmail !== actor.actorEmail ? `Submitted by ${actor.actorName}` : undefined),
          notifyAdmins: true,
        },
        { accessToken: session?.access_token }
      );

      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit return request';
      return { success: false, error: msg };
    }
  };

  const cancelReturnRequest = async (requestId: string, reason?: string) => {
    try {
      const targetReq = requests.find((r) => r.id === requestId);
      if (!targetReq) return { success: false, error: 'Requisition record not found.' };

      const cleanNotes = (targetReq.admin_notes || '').replace(/\[RETURN_REQUESTED\][^\n|]*/g, '').replace(/\|+/g, '|').trim();
      const updatedNotes = reason ? `${cleanNotes ? `${cleanNotes} | ` : ''}Return declined: ${reason}` : (cleanNotes || null);

      const { error } = await supabase
        .from('borrow_requests')
        .update({
          admin_notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) return { success: false, error: error.message };

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, admin_notes: updatedNotes || undefined, updated_at: new Date().toISOString() }
            : r
        )
      );

      broadcastLiveEvent('RETURN_DECLINED', { ...targetReq, admin_notes: updatedNotes || undefined });

      const actor = getActorMeta();
      const targetItem = items.find((i) => i.id === targetReq.item_id);
      const borrowerIdentity = extractIdentityFromEmail(targetReq.user_email, { full_name: targetReq.user_name });
      const borrowerName =
        targetReq.user_name && !isDirtyOrPlaceholderName(targetReq.user_name, targetReq.user_email)
          ? toCleanDisplayName(targetReq.user_name)
          : borrowerIdentity.fullName;
      const borrowerRoll = borrowerIdentity.enrollmentNo;
      await writeAuditLog({
        action: 'RETURN_DECLINED',
        actorId: actor.actorId,
        actorName: actor.actorName,
        item_id: targetReq.item_id,
        details: buildAuditDetails({
          summary: `${actor.actorName} rejected return of ${targetReq.quantity}x ${targetReq.item_name} from ${borrowerName}${reason ? ` (${reason})` : ''}`,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorEmail: actor.actorEmail,
          actorRoll: actor.actorRoll,
          actorRole: actor.actorRole,
          targetId: targetReq.item_id,
          targetName: `${targetReq.quantity}x ${targetReq.item_name}`,
          targetType: 'borrow_request',
          location: targetItem?.location,
          where: 'Requisitions & Clearance › Return Clearance',
          changes: [
            `Borrower: ${borrowerName}`,
            ...(borrowerRoll ? [`Roll: ${borrowerRoll}`] : []),
            `Qty: ${targetReq.quantity}`,
            ...(reason ? [`Reason: ${reason}`] : []),
          ],
          meta: {
            requestId,
            itemId: targetReq.item_id,
            itemName: targetReq.item_name,
            quantity: targetReq.quantity,
            requesterId: targetReq.user_id,
            requesterName: borrowerName,
            requesterEmail: targetReq.user_email,
            requesterRoll: borrowerRoll,
          },
        }),
      });

      await notifyEmail(
        'return_declined',
        targetReq.user_email,
        {
          name: borrowerName,
          email: targetReq.user_email,
          item: `${targetReq.quantity}x ${targetReq.item_name}`,
          project: targetReq.project_name,
          status: 'return declined',
          adminName: actor.actorName,
          notes: reason || 'Return request was declined by an administrator',
        },
        { accessToken: session?.access_token }
      );

      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel return request';
      return { success: false, error: msg };
    }
  };

  return (
    <InventoryContext.Provider
      value={{
        items,
        requests,
        logs,
        loading,
        isLiveDatabase,
        schemaNeeded,
        addItem,
        updateItem,
        deleteItem,
        submitBorrowRequest,
        updateBorrowStatus,
        requestItemReturn,
        cancelReturnRequest,
        refreshData,
        broadcastAccountStatus,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
