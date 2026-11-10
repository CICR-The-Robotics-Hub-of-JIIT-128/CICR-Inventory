import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { callInventoryApi } from '../lib/inventoryApi';
import { InventoryItem, BorrowRequest, ActivityLog } from '../types/inventory';
import { useAuth } from './AuthContext';
import { notifyEmail } from '../lib/notifications';
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
import { validateExpectedReturnDate } from '../utils/returnDate';

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
  deleteBorrowRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
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
    const actorRole = currentProfile?.role || 'member';
    return {
      actorId: currentUser?.id,
      actorName,
      actorEmail,
      actorRoll,
      actorRole,
    };
  }, []);

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

      const isApprovedProfile = Boolean(
        currentProfile &&
          currentProfile.status === 'approved' &&
          currentProfile.avatar_url !== 'status:pending' &&
          currentProfile.avatar_url !== 'status:rejected'
      );
      const isCurrentAdmin = Boolean(
        isApprovedProfile &&
          currentProfile?.role === 'admin'
      );

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
        currentProfile?.status === 'approved' &&
        currentProfile?.avatar_url !== 'status:pending' &&
        currentProfile?.avatar_url !== 'status:rejected' &&
        currentProfile?.role === 'admin'
    );

    if (!currentUser) {
      prevRequestsMapRef.current = new Map();
      hasInitializedRef.current = false;
      setRequests([]);
      setLogs([]);
      try {
        localStorage.removeItem('cicr-cached-requests');
      } catch {}
    }

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

        if (requestsRes.data && currentUser) {
          const rawReqs = requestsRes.data as BorrowRequest[];
          const myEmail = (currentUser.email || '').toLowerCase();
          const newReqs = isUserAdmin
            ? rawReqs
            : rawReqs.filter(
                (r) =>
                  r.user_id === currentUser.id ||
                  (myEmail && r.user_email && r.user_email.toLowerCase() === myEmail)
              );

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
        } else if (!isUserAdmin) {
          setLogs([]);
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

  const hasPrivilegedClearance = useCallback(() => {
    return Boolean(
      profile &&
        profile.status === 'approved' &&
        profile.avatar_url !== 'status:pending' &&
        profile.avatar_url !== 'status:rejected' &&
        profile.role === 'admin'
    );
  }, [profile]);

  useEffect(() => {
    if (!user) {
      prevRequestsMapRef.current = new Map();
      hasInitializedRef.current = false;
      setRequests([]);
      setLogs([]);
      try {
        localStorage.removeItem('cicr-cached-requests');
      } catch {}
      return;
    }
    refreshData();
  }, [user?.id, profile?.role, profile?.status, refreshData]);

  // Server-enforced Add Item via /api/inventory
  const addItem = async (newItemData: Omit<InventoryItem, 'id'>) => {
    try {
      if (!hasPrivilegedClearance()) {
        return { success: false, error: 'Unauthorized: Administrative role required to register equipment.' };
      }
      const res = await callInventoryApi<{
        success: boolean;
        item?: InventoryItem;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'add_item',
          item: newItemData,
        },
        session?.access_token
      );

      if (res.item) {
        setItems((prev) => [res.item as InventoryItem, ...prev]);
      }
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      const actor = getActorMeta();
      const itemChanges = [
        `Category: ${newItemData.category}`,
        `Total Qty: ${newItemData.total_qty}`,
        `Available Qty: ${newItemData.available_qty}`,
        ...(newItemData.sku ? [`SKU: ${newItemData.sku}`] : []),
        ...(newItemData.location ? [`Shelf: ${newItemData.location}`] : []),
      ];
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
      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return { success: false, error: msg };
    }
  };

  // Server-enforced Update Item via /api/inventory
  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    try {
      if (!hasPrivilegedClearance()) {
        return { success: false, error: 'Unauthorized: Administrative privileges required to edit equipment.' };
      }

      const targetItem = items.find((i) => i.id === id);
      const cleanUpdates: any = { ...updates };
      delete cleanUpdates.id;
      delete cleanUpdates.created_at;

      const res = await callInventoryApi<{
        success: boolean;
        item?: InventoryItem;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'update_item',
          itemId: id,
          updates: cleanUpdates,
        },
        session?.access_token
      );

      if (res.item) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? (res.item as InventoryItem) : item))
        );
      } else {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...cleanUpdates } : item))
        );
      }
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      const actor = getActorMeta();
      const logName = res.item?.name || cleanUpdates.name || targetItem?.name || 'Component';
      const changeParts: string[] = [];
      if (cleanUpdates.name && targetItem && cleanUpdates.name !== targetItem.name) {
        changeParts.push(`Name: "${targetItem.name}" -> "${cleanUpdates.name}"`);
      }
      if (cleanUpdates.category && targetItem && cleanUpdates.category !== targetItem.category) {
        changeParts.push(`Category: "${targetItem.category}" -> "${cleanUpdates.category}"`);
      }
      if (cleanUpdates.sku !== undefined && targetItem && (cleanUpdates.sku || '') !== (targetItem.sku || '')) {
        changeParts.push(`SKU: "${targetItem.sku || '-'}" -> "${cleanUpdates.sku || '-'}"`);
      }
      if (cleanUpdates.location !== undefined && targetItem && (cleanUpdates.location || '') !== (targetItem.location || '')) {
        changeParts.push(`Location: "${targetItem.location || '-'}" -> "${cleanUpdates.location || '-'}"`);
      }
      if (cleanUpdates.total_qty !== undefined && targetItem && Number(cleanUpdates.total_qty) !== Number(targetItem.total_qty)) {
        changeParts.push(`Total Qty: ${targetItem.total_qty} -> ${cleanUpdates.total_qty}`);
      }
      if (cleanUpdates.available_qty !== undefined && targetItem && Number(cleanUpdates.available_qty) !== Number(targetItem.available_qty)) {
        changeParts.push(`Available Qty: ${targetItem.available_qty} -> ${cleanUpdates.available_qty}`);
      }
      if (cleanUpdates.min_threshold !== undefined && targetItem && Number(cleanUpdates.min_threshold) !== Number(targetItem.min_threshold)) {
        changeParts.push(`Min Threshold: ${targetItem.min_threshold} -> ${cleanUpdates.min_threshold}`);
      }
      if (cleanUpdates.condition !== undefined && targetItem && (cleanUpdates.condition || '') !== (targetItem.condition || '')) {
        changeParts.push(`Condition: "${targetItem.condition || '-'}" -> "${cleanUpdates.condition || '-'}"`);
      }
      if (cleanUpdates.status && targetItem && cleanUpdates.status !== targetItem.status) {
        changeParts.push(`Status: ${targetItem.status} -> ${cleanUpdates.status}`);
      }
      if (cleanUpdates.description !== undefined && targetItem && cleanUpdates.description !== targetItem.description) {
        changeParts.push('Description updated');
      }

      const logSummary =
        changeParts.length > 0
          ? `${actor.actorName} edited "${logName}": ${changeParts.join(', ')}`
          : `${actor.actorName} updated component "${logName}" (Total: ${res.item?.total_qty ?? cleanUpdates.total_qty ?? targetItem?.total_qty}, Available: ${res.item?.available_qty ?? cleanUpdates.available_qty ?? targetItem?.available_qty})`;

      await notifyEmail(
        'item_edited',
        actor.actorEmail,
        {
          name: actor.actorName,
          email: actor.actorEmail,
          role: actor.actorRole,
          item: logName,
          category: res.item?.category || cleanUpdates.category || targetItem?.category,
          notes: changeParts.length > 0 ? changeParts.join(', ') : logSummary,
        },
        { accessToken: session?.access_token }
      );

      refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database update failed';
      return { success: false, error: msg };
    }
  };

  // Server-enforced Delete Item via /api/inventory
  const deleteItem = async (id: string) => {
    try {
      if (!hasPrivilegedClearance()) {
        return { success: false, error: 'Unauthorized: Administrative role required to delete equipment.' };
      }
      const targetItem = items.find((i) => i.id === id);
      const res = await callInventoryApi<{
        success: boolean;
        removedItem?: InventoryItem;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'delete_item',
          itemId: id,
        },
        session?.access_token
      );

      setItems((prev) => prev.filter((i) => i.id !== id));
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      const actor = getActorMeta();
      await notifyEmail(
        'item_deleted',
        actor.actorEmail,
        {
          name: actor.actorName,
          email: actor.actorEmail,
          role: actor.actorRole,
          item: res.removedItem?.name || targetItem?.name || id,
          category: res.removedItem?.category || targetItem?.category,
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
      const res = await callInventoryApi<{
        success: boolean;
        request?: BorrowRequest;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'submit_borrow_request',
          itemId: item.id,
          quantity: data.quantity,
          projectName: data.projectName,
          purpose: data.purpose,
          expectedReturnDate: validatedReturnDate,
        },
        session?.access_token
      );

      if (res.request) {
        const dbData = res.request;
        setRequests((prev) => [dbData, ...prev]);
        broadcastLiveEvent('NEW_REQUEST', dbData);
        if (res.auditLog && hasPrivilegedClearance()) {
          setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
        }
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
      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database request failed';
      return { success: false, error: msg };
    }
  };

  // Server-enforced Update Borrow Status with atomic transition guard and single-source stock sync
  const updateBorrowStatus = async (
    requestId: string,
    newStatus: 'approved' | 'rejected' | 'returned',
    adminNotes?: string
  ) => {
    if (!hasPrivilegedClearance()) {
      return { success: false, error: 'Unauthorized: Administrative clearance required to approve, reject, or confirm returns.' };
    }

    if (inFlightRequestIdsRef.current.has(requestId)) {
      return { success: false, error: 'This requisition is already being processed. Please wait.' };
    }
    inFlightRequestIdsRef.current.add(requestId);

    try {
      const targetReq = requests.find((r) => r.id === requestId) || null;
      const res = await callInventoryApi<{
        success: boolean;
        request?: BorrowRequest;
        item?: InventoryItem | null;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'update_borrow_status',
          requestId,
          status: newStatus,
          adminNotes,
        },
        session?.access_token
      );

      const updatedReq = res.request || targetReq;
      if (res.item) {
        const updatedItem = res.item;
        setItems((prev) =>
          prev.map((it) => (it.id === updatedItem.id ? { ...it, ...updatedItem } : it))
        );
      }
      if (res.request) {
        const nextReq = res.request;
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, ...nextReq, status: newStatus } : r))
        );
      }
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      if (updatedReq) {
        const liveType =
          newStatus === 'approved'
            ? 'APPROVED'
            : newStatus === 'rejected'
            ? 'REJECTED'
            : 'RETURN_ACCEPTED';
        broadcastLiveEvent(liveType, { ...updatedReq, status: newStatus });

        const actor = getActorMeta();
        const borrowerIdentity = extractIdentityFromEmail(updatedReq.user_email, {
          full_name: updatedReq.user_name,
        });
        const borrowerName =
          updatedReq.user_name && !isDirtyOrPlaceholderName(updatedReq.user_name, updatedReq.user_email)
            ? toCleanDisplayName(updatedReq.user_name)
            : borrowerIdentity.fullName;
        const reqQty = Math.max(1, Number(updatedReq.quantity ?? 1));
        const event =
          newStatus === 'approved'
            ? 'borrow_approved'
            : newStatus === 'rejected'
            ? 'borrow_rejected'
            : 'item_returned';

        await notifyEmail(
          event,
          updatedReq.user_email,
          {
            name: borrowerName,
            email: updatedReq.user_email,
            item: `${reqQty}x ${updatedReq.item_name}`,
            project: updatedReq.project_name,
            status: newStatus,
            dueDate: updatedReq.expected_return_date,
            adminName: actor.actorName,
            notes: adminNotes,
          },
          { accessToken: session?.access_token }
        );
      }

      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      await refreshData();
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
      const isAuthorizedAdmin = hasPrivilegedClearance();

      if (!isOwner && !isAuthorizedAdmin) {
        return { success: false, error: 'Unauthorized: Only the member who issued this component can initiate its return.' };
      }

      if (targetReq.status !== 'approved' && targetReq.status !== 'overdue') {
        return { success: false, error: 'Only active issued loans can be submitted for return.' };
      }

      const res = await callInventoryApi<{
        success: boolean;
        request?: BorrowRequest;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'request_return',
          requestId,
          returnNotes,
        },
        session?.access_token
      );

      const updatedReq = res.request || targetReq;
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...updatedReq } : r))
      );
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      broadcastLiveEvent('RETURN_REQUESTED', updatedReq);

      const actor = getActorMeta();
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
      if (!hasPrivilegedClearance()) {
        return { success: false, error: 'Unauthorized: Administrative clearance required to decline returns.' };
      }
      const targetReq = requests.find((r) => r.id === requestId);
      if (!targetReq) return { success: false, error: 'Requisition record not found.' };

      const res = await callInventoryApi<{
        success: boolean;
        request?: BorrowRequest;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'decline_return',
          requestId,
          reason,
        },
        session?.access_token
      );

      const updatedReq = res.request || targetReq;
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...updatedReq } : r))
      );
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      broadcastLiveEvent('RETURN_DECLINED', updatedReq);

      const actor = getActorMeta();
      const borrowerIdentity = extractIdentityFromEmail(targetReq.user_email, { full_name: targetReq.user_name });
      const borrowerName =
        targetReq.user_name && !isDirtyOrPlaceholderName(targetReq.user_name, targetReq.user_email)
          ? toCleanDisplayName(targetReq.user_name)
          : borrowerIdentity.fullName;

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

  const deleteBorrowRequest = async (requestId: string) => {
    try {
      if (!hasPrivilegedClearance()) {
        return { success: false, error: 'Unauthorized: Administrative clearance required to delete borrow requests.' };
      }

      const res = await callInventoryApi<{
        success: boolean;
        deletedId?: string;
        item?: InventoryItem | null;
        auditLog?: ActivityLog | null;
      }>(
        {
          action: 'delete_borrow_request',
          requestId,
        },
        session?.access_token
      );

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (res.item) {
        const restockedItem = res.item;
        setItems((prev) =>
          prev.map((it) => (it.id === restockedItem.id ? { ...it, ...restockedItem } : it))
        );
      }
      if (res.auditLog && hasPrivilegedClearance()) {
        setLogs((prev) => [res.auditLog as ActivityLog, ...prev]);
      }

      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete borrow request';
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
        deleteBorrowRequest,
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
