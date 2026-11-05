import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { InventoryItem, BorrowRequest, ActivityLog } from '../types/inventory';
import { useAuth, MASTER_ADMIN_EMAILS } from './AuthContext';
import { notifyEmail } from '../lib/notifications';
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
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const userRef = useRef({ user, profile });
  userRef.current = { user, profile };

  const prevRequestsMapRef = useRef<Map<string, BorrowRequest>>(new Map());
  const hasInitializedRef = useRef<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

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

    const isUserAdmin = Boolean(
      user &&
      (MASTER_ADMIN_EMAILS.includes((user.email || '').toLowerCase()) || profile?.role === 'admin')
    );

    try {
      // Parallelize item, request, and (for admins only) audit log queries simultaneously
      const [itemsRes, requestsRes, logsRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('borrow_requests')
          .select('*')
          .order('created_at', { ascending: false }),
        isUserAdmin
          ? supabase
              .from('activity_logs')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(2500)
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
        try {
          await supabase.from('activity_logs').insert([
            {
              user_id: user?.id,
              user_name: profile?.full_name || user?.email || 'Admin',
              action: 'CREATE_ITEM',
              details: `Registered new component "${newItemData.name}" (${newItemData.category})`,
            },
          ]);
        } catch {
          // ignore
        }
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
      const adminName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Admin';
      const logName = cleanUpdates.name || targetItem?.name || 'Component';

      const changeParts: string[] = [];
      if (cleanUpdates.name && targetItem && cleanUpdates.name !== targetItem.name) {
        changeParts.push(`Name: "${targetItem.name}" -> "${cleanUpdates.name}"`);
      }
      if (cleanUpdates.category && targetItem && cleanUpdates.category !== targetItem.category) {
        changeParts.push(`Domain: "${targetItem.category}" -> "${cleanUpdates.category}"`);
      }
      if (cleanUpdates.total_qty !== undefined && targetItem && Number(cleanUpdates.total_qty) !== Number(targetItem.total_qty)) {
        changeParts.push(`Total Units: ${targetItem.total_qty} -> ${cleanUpdates.total_qty}`);
      }
      if (cleanUpdates.description !== undefined && targetItem && cleanUpdates.description !== targetItem.description) {
        changeParts.push('Description updated');
      }

      const logDetails = changeParts.length > 0
        ? `Admin ${adminName} edited "${logName}": ${changeParts.join(', ')}`
        : `Admin ${adminName} edited component "${logName}" (Total: ${cleanUpdates.total_qty ?? targetItem?.total_qty}, Available: ${cleanUpdates.available_qty ?? targetItem?.available_qty})`;

      const logEntry: any = {
        user_id: user?.id || null,
        user_name: adminName,
        action: 'UPDATE_ITEM',
        details: logDetails,
        item_id: id,
        created_at: new Date().toISOString(),
      };

      try {
        await supabase.from('activity_logs').insert([logEntry]);
        setLogs((prev) => [logEntry, ...prev]);
      } catch {
        // Logging error shouldn't crash primary update
      }

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
      try {
        await supabase.from('activity_logs').insert([
          {
            user_id: user?.id,
            user_name: profile?.full_name || user?.email || 'Admin',
            action: 'DELETE_ITEM',
            details: `Removed component "${targetItem?.name || id}" from vault inventory`,
          },
        ]);
      } catch {
        // ignore
      }
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
    if (!data.expectedReturnDate) {
      return { success: false, error: 'Expected return date is required.' };
    }
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
      const { data: dbData, error } = await supabase
        .from('borrow_requests')
        .insert([
          {
            item_id: item.id,
            user_id: user?.id,
            user_name: profile?.full_name || user?.email || 'Student Member',
            user_email: profile?.email || user?.email,
            item_name: item.name,
            quantity: data.quantity,
            project_name: data.projectName,
            purpose: data.purpose,
            status: 'pending',
            expected_return_date: data.expectedReturnDate,
          },
        ])
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      if (dbData) {
        setRequests((prev) => [dbData as BorrowRequest, ...prev]);
        broadcastLiveEvent('NEW_REQUEST', dbData);
        try {
          await supabase.from('activity_logs').insert([
            {
              user_id: user?.id,
              user_name: profile?.full_name || user?.email || 'Member',
              action: 'BORROW_REQUEST',
              details: `Requested ${data.quantity}x ${item.name} for "${data.projectName}"`,
            },
          ]);
        } catch {
          // ignore
        }
        await notifyEmail('borrow_requested', profile?.email || user?.email, {
          name: profile?.full_name || user?.email,
          email: profile?.email || user?.email,
          item: `${data.quantity}x ${item.name}`,
          project: data.projectName,
          status: 'pending',
          dueDate: data.expectedReturnDate,
        });
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database request failed';
      return { success: false, error: msg };
    }
  };

  // Real Update Borrow Status with full backend inventory quantity adjustments
  const updateBorrowStatus = async (
    requestId: string,
    newStatus: 'approved' | 'rejected' | 'returned',
    adminNotes?: string
  ) => {
    try {
      if (newStatus === 'approved' || newStatus === 'rejected' || newStatus === 'returned') {
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
          return { success: false, error: 'Unauthorized: Administrative clearance required to approve, reject, or confirm returns.' };
        }
      }
      const targetReq = requests.find((r) => r.id === requestId);

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        approved_by: profile?.full_name || (user?.email ? user.email.split('@')[0] : 'Admin'),
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'approved') {
        updatePayload.borrow_date = new Date().toISOString().split('T')[0];
        
        // Decrement available quantity in Supabase backend
        if (targetReq) {
          const targetItem = items.find((i) => i.id === targetReq.item_id);
          if (targetItem) {
            const newAvail = Math.max(0, targetItem.available_qty - targetReq.quantity);
            const statusLabel =
              newAvail <= 0
                ? 'Out of Stock'
                : targetItem.total_qty > 0 && (newAvail / targetItem.total_qty) < 0.5
                ? 'Low Stock'
                : 'In Stock';

            await supabase
              .from('inventory_items')
              .update({
                available_qty: newAvail,
                status: statusLabel,
                updated_at: new Date().toISOString(),
              })
              .eq('id', targetItem.id);

            // Immediately update local items state
            setItems((prev) =>
              prev.map((it) =>
                it.id === targetItem.id
                  ? { ...it, available_qty: newAvail, status: statusLabel }
                  : it
              )
            );
          }
        }
      } else if (newStatus === 'returned') {
        updatePayload.actual_return_date = new Date().toISOString().split('T')[0];
        const cleanNotes = (targetReq?.admin_notes || '').replace(/\[RETURN_REQUESTED\][^\n|]*/g, '').replace(/\|+/g, '|').trim();
        updatePayload.admin_notes = adminNotes || (cleanNotes ? `${cleanNotes} (Returned & Restocked)` : 'Returned & Restocked');

        // Increment available quantity back in Supabase backend
        if (targetReq) {
          const targetItem = items.find((i) => i.id === targetReq.item_id);
          if (targetItem) {
            const newAvail = Math.min(targetItem.total_qty, targetItem.available_qty + targetReq.quantity);
            const statusLabel =
              newAvail <= 0
                ? 'Out of Stock'
                : targetItem.total_qty > 0 && (newAvail / targetItem.total_qty) < 0.5
                ? 'Low Stock'
                : 'In Stock';

            await supabase
              .from('inventory_items')
              .update({
                available_qty: newAvail,
                status: statusLabel,
                updated_at: new Date().toISOString(),
              })
              .eq('id', targetItem.id);

            // Immediately update local items state
            setItems((prev) =>
              prev.map((it) =>
                it.id === targetItem.id
                  ? { ...it, available_qty: newAvail, status: statusLabel }
                  : it
              )
            );
          }
        }
      }

      // Update borrow request in Supabase
      const { error } = await supabase
        .from('borrow_requests')
        .update(updatePayload)
        .eq('id', requestId);

      if (error) return { success: false, error: error.message };

      // Immediately update local requests state
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...updatePayload, status: newStatus } : r))
      );

      if (targetReq) {
        const liveType =
          newStatus === 'approved'
            ? 'APPROVED'
            : newStatus === 'rejected'
            ? 'REJECTED'
            : 'RETURN_ACCEPTED';
        broadcastLiveEvent(liveType, { ...targetReq, ...updatePayload, status: newStatus });
      }

      // Log activity in Supabase
      if (targetReq) {
        await supabase.from('activity_logs').insert([
          {
            user_id: user?.id,
            user_name: profile?.full_name || 'Admin',
            action: newStatus,
            target_type: 'borrow_request',
            target_id: requestId,
            details: `${targetReq.item_name} marked as ${newStatus} (x${targetReq.quantity})`,
          },
        ]);
        const event = newStatus === 'approved'
          ? 'borrow_approved'
          : newStatus === 'rejected'
          ? 'borrow_rejected'
          : 'item_returned';
        await notifyEmail(event, targetReq.user_email, {
          name: targetReq.user_name,
          email: targetReq.user_email,
          item: `${targetReq.quantity}x ${targetReq.item_name}`,
          status: newStatus,
          dueDate: targetReq.expected_return_date,
          notes: adminNotes,
        });
      }

      await refreshData();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update request';
      return { success: false, error: msg };
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
      const userDisplay = profile?.full_name || user?.email || targetReq.user_name || 'Member';
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

      try {
        await supabase.from('activity_logs').insert([
          {
            user_id: user?.id,
            user_name: userDisplay,
            action: 'RETURN_REQUEST',
            target_type: 'borrow_request',
            target_id: requestId,
            details: `${userDisplay} requested to return ${targetReq.quantity}x ${targetReq.item_name} for "${targetReq.project_name}". Sent to Admin Portal for clearance.`,
          },
        ]);
      } catch {
        // ignore log error
      }

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
