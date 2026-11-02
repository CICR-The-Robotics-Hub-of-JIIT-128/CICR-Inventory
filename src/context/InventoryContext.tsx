import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { InventoryItem, BorrowRequest, ActivityLog } from '../types/inventory';
import { useAuth } from './AuthContext';
import { notifyEmail } from '../lib/notifications';

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
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
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
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLiveDatabase, setIsLiveDatabase] = useState<boolean>(false);
  const [schemaNeeded, setSchemaNeeded] = useState<boolean>(false);

  // Fetch real data from Supabase backend
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch real inventory items from Supabase
      const { data: dbItems, error: itemsError } = await supabase
        .from('inventory_items')
        .select('*')
        .order('created_at', { ascending: false });

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
        setItems(normalizedItems);
        try {
          localStorage.setItem('cicr-cached-inventory', JSON.stringify(normalizedItems));
        } catch {}

        // 2. Fetch real borrow requests from Supabase
        const { data: dbRequests } = await supabaseAdmin
          .from('borrow_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbRequests) {
          setRequests(dbRequests as BorrowRequest[]);
          try {
            localStorage.setItem('cicr-cached-requests', JSON.stringify(dbRequests));
          } catch {}
        }

        // 3. Fetch real activity logs (full multi-day audit history via supabaseAdmin)
        const { data: dbLogs } = await supabaseAdmin
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(250);

        if (dbLogs) {
          setLogs(dbLogs as ActivityLog[]);
        }
      }
    } catch {
      setItems([]);
      setRequests([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const timer = setInterval(() => {
      refreshData();
    }, 1500);
    return () => clearInterval(timer);
  }, [refreshData]);

  // Real Add Item in Supabase
  const addItem = async (newItemData: Omit<InventoryItem, 'id'>) => {
    try {
      const isAuthorized =
        profile?.role === 'admin' ||
        profile?.role === 'lead' ||
        user?.user_metadata?.role === 'admin' ||
        (user?.email && ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com'].includes(user.email.toLowerCase()));
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
          await supabaseAdmin.from('activity_logs').insert([
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
        user?.user_metadata?.role === 'admin' ||
        Boolean(
          user?.email &&
            ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(
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

      // 1. Prioritize supabaseAdmin with select() to bypass client RLS issues and guarantee row update
      let { data, error } = await supabaseAdmin
        .from('inventory_items')
        .update(cleanUpdates)
        .eq('id', id)
        .select();

      // Fallback to supabase user client
      if (error || !data || data.length === 0) {
        const fallbackRes = await supabase
          .from('inventory_items')
          .update(cleanUpdates)
          .eq('id', id)
          .select();

        if (fallbackRes.error && error) {
          return { success: false, error: error.message || fallbackRes.error.message };
        }
        if (fallbackRes.data && fallbackRes.data.length > 0) {
          data = fallbackRes.data;
        }
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
        const logRes = await supabaseAdmin.from('activity_logs').insert([logEntry]);
        if (logRes.error) {
          await supabase.from('activity_logs').insert([logEntry]);
        }
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
        user?.user_metadata?.role === 'admin' ||
        (user?.email && ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com'].includes(user.email.toLowerCase()));
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

    try {
      const { data: dbData, error } = await supabaseAdmin
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
        try {
          await supabaseAdmin.from('activity_logs').insert([
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
          user?.user_metadata?.role === 'admin' ||
          (user?.email && ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(user.email.toLowerCase()));
        if (!isAuthorized) {
          return { success: false, error: 'Unauthorized: Administrative clearance required to approve, reject, or confirm returns.' };
        }
      }
      const targetReq = requests.find((r) => r.id === requestId);

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        approved_by: profile?.full_name || user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : 'Admin'),
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'approved') {
        updatePayload.borrow_date = new Date().toISOString().split('T')[0];
        
        // Decrement available quantity in Supabase backend via supabaseAdmin
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

            await supabaseAdmin
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

        // Increment available quantity back in Supabase backend via supabaseAdmin
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

            await supabaseAdmin
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

      // Update borrow request in Supabase via supabaseAdmin
      const { error } = await supabaseAdmin
        .from('borrow_requests')
        .update(updatePayload)
        .eq('id', requestId);

      if (error) return { success: false, error: error.message };

      // Immediately update local requests state
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...updatePayload, status: newStatus } : r))
      );

      // Log activity in Supabase
      if (targetReq) {
        await supabaseAdmin.from('activity_logs').insert([
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
        user?.user_metadata?.role === 'admin' ||
        (user?.email && ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(user.email.toLowerCase()));

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

      const { error } = await supabaseAdmin
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

      try {
        await supabaseAdmin.from('activity_logs').insert([
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

      const { error } = await supabaseAdmin
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
