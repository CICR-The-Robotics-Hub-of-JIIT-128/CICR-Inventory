import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { BottomNavbar, ActiveView } from '../layout/BottomNavbar';
import { CartItem } from '../inventory/RequestCartModal';
import { TopNavbar } from './TopNavbar';
import { DashboardOverview } from './DashboardOverview';
import { ComponentVaultView } from './ComponentVaultView';
import { AdminHubView } from './AdminHubView';
import { InventoryItem, BorrowRequest, isReturnRequested } from '../../types/inventory';
import { supabase, supabaseAdmin } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import { Notification } from '../ui/notification-bell';

// Code-split heavy sub-views and modals on-demand so initial page load is 0ms instant and smooth
const RequisitionsView = lazy(() =>
  import('./RequisitionsView').then((m) => ({ default: m.RequisitionsView }))
);
const OperatorProfileView = lazy(() =>
  import('./OperatorProfileView').then((m) => ({ default: m.OperatorProfileView }))
);
const MeetTheDevelopers = lazy(() =>
  import('./MeetTheDevelopers').then((m) => ({ default: m.MeetTheDevelopers }))
);
const RequestCartModal = lazy(() =>
  import('../inventory/RequestCartModal').then((m) => ({ default: m.RequestCartModal }))
);
const ChangePasswordModal = lazy(() =>
  import('../profile/ChangePasswordModal').then((m) => ({ default: m.ChangePasswordModal }))
);
const AddEditItemModal = lazy(() =>
  import('../inventory/AddEditItemModal').then((m) => ({ default: m.AddEditItemModal }))
);
const ItemDetailModal = lazy(() =>
  import('../inventory/ItemDetailModal').then((m) => ({ default: m.ItemDetailModal }))
);
const IssuePassModal = lazy(() =>
  import('./IssuePassModal').then((m) => ({ default: m.IssuePassModal }))
);

const isLowReserveItem = (i: InventoryItem): boolean => {
  if (i.available_qty <= 0) return false;
  if (i.total_qty <= 0) return false;
  return (i.available_qty / i.total_qty) < 0.5;
};

const VIEW_TO_HASH: Record<ActiveView, string> = {
  dashboard: '#dashboard',
  inventory: '#inventory',
  'review-requests': '#requests',
  logs: '#management',
  developers: '#team',
  profile: '#profile',
};

const HASH_TO_VIEW: Record<string, ActiveView> = {
  '': 'dashboard',
  '#': 'dashboard',
  '#dashboard': 'dashboard',
  '#inventory': 'inventory',
  '#requests': 'review-requests',
  '#review-requests': 'review-requests',
  '#logs': 'logs',
  '#management': 'logs',
  '#developers': 'developers',
  '#team': 'developers',
  '#profile': 'profile',
};

export const UserDashboard: React.FC = () => {
  const {
    user,
    profile,
    isLeadOrAdmin,
    refreshProfile,
    updateProfile,
    approveUserAccount,
    rejectUserAccount,
    updateUserRole,
  } = useAuth();
  const isAdmin = profile?.role === 'admin' || user?.user_metadata?.role === 'admin';
  const { items, requests, logs, loading, deleteItem, updateBorrowStatus, refreshData } = useInventory();
  const { showToast } = useToast();

  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      return HASH_TO_VIEW[window.location.hash] || 'dashboard';
    }
    return 'dashboard';
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedIssuePassReq, setSelectedIssuePassReq] = useState<BorrowRequest | null>(null);

  // Filters in Component Vault
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Profile edit fields
  const [editName, setEditName] = useState(profile?.full_name || (user?.user_metadata?.full_name as string) || '');
  const [editEnrollment, setEditEnrollment] = useState(profile?.roll_number || (user?.user_metadata?.enrollment_no as string) || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || (user?.user_metadata?.phone as string) || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(
    (profile?.avatar_url && !profile.avatar_url.startsWith('status:'))
      ? profile.avatar_url
      : ((user?.user_metadata?.avatar_url as string) || '')
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Admin Hub state with instant 0ms localStorage caching
  const [pendingAccounts, setPendingAccounts] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cicr-cached-pending-accounts');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [allMembers, setAllMembers] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cicr-cached-members');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Notifications with persistent read status in localStorage
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('cicr-read-notifications');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Notifications with persistent dismissed status in localStorage
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('cicr-dismissed-notifications');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Track open modal status and active view in refs so popstate listener always has fresh state
  const isAnyModalOpen =
    cartModalOpen ||
    changePasswordOpen ||
    addItemModalOpen ||
    editingItem !== null ||
    selectedItem !== null ||
    selectedIssuePassReq !== null;

  const isAnyModalOpenRef = useRef(isAnyModalOpen);
  const activeViewRef = useRef<ActiveView>(activeView);
  const viewHistoryRef = useRef<ActiveView[]>([]);
  const lastBackPressTimeRef = useRef<number>(0);
  const isProgrammaticModalCloseRef = useRef<boolean>(false);

  useEffect(() => {
    isAnyModalOpenRef.current = isAnyModalOpen;
  }, [isAnyModalOpen]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  // Clean Address Bar & Mobile/Browser History Navigation:
  // Keeps the address bar strictly clean (https://cicr-inventory.vercel.app without #inventory, #team, etc.)
  // while preserving full phone hardware back, gesture swipe, and browser back navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentHash = window.location.hash;
    const initialView = HASH_TO_VIEW[currentHash] || 'dashboard';
    setActiveView(initialView);
    viewHistoryRef.current = initialView === 'dashboard' ? ['dashboard'] : ['dashboard', initialView];

    const cleanPath = window.location.pathname || '/';

    // 1. Seed root guard at history entry 0 (protects mobile users from abruptly exiting)
    // Strip any hash that might have been present in the initial URL
    window.history.replaceState({ cicrApp: true, view: 'dashboard', root: true }, '', cleanPath);

    // 2. Push active view entry at history entry 1 without any #hash in the address bar
    window.history.pushState(
      { cicrApp: true, view: initialView, depth: viewHistoryRef.current.length },
      '',
      cleanPath
    );

    const handlePopState = (e: PopStateEvent) => {
      // If modal was closed programmatically (e.g. by clicking 'X' or Cancel button), ignore this popstate
      if (isProgrammaticModalCloseRef.current) {
        isProgrammaticModalCloseRef.current = false;
        return;
      }

      // 1. If any modal is open, pressing back closes the modal and stays in the active view
      if (isAnyModalOpenRef.current) {
        setCartModalOpen(false);
        setChangePasswordOpen(false);
        setAddItemModalOpen(false);
        setEditingItem(null);
        setSelectedItem(null);
        setSelectedIssuePassReq(null);
        return;
      }

      // 2. If user is on a sub-view (inventory, requests, management, developers, profile):
      //    Take them back to previous view or Home Dashboard instead of exiting!
      if (activeViewRef.current !== 'dashboard') {
        let prevView: ActiveView = 'dashboard';
        while (viewHistoryRef.current.length > 0) {
          const last = viewHistoryRef.current.pop();
          if (last && last !== activeViewRef.current) {
            prevView = last;
            break;
          }
        }
        setActiveView(prevView);
        window.history.pushState(
          { cicrApp: true, view: prevView, depth: viewHistoryRef.current.length },
          '',
          cleanPath
        );
        return;
      }

      // 3. User is on the Home Dashboard and pressed Back on phone:
      //    Require a double back-press within 2 seconds to exit, preventing accidental closing!
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        // Double back pressed within 2s: allow normal exit from site
        window.history.back();
        return;
      }

      lastBackPressTimeRef.current = now;
      showToast('info', 'Press back again to exit', 'Tap back once more to leave the app.');

      // Push Dashboard state back so the web app stays open on phone
      window.history.pushState(
        { cicrApp: true, view: 'dashboard', depth: 0 },
        '',
        cleanPath
      );
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleNavigateView = useCallback((newView: ActiveView) => {
    if (newView === activeViewRef.current) return;
    viewHistoryRef.current.push(newView);
    const cleanPath = typeof window !== 'undefined' ? (window.location.pathname || '/') : '/';
    // Push new view with clean address bar (no #hash)
    window.history.pushState(
      { cicrApp: true, view: newView, depth: viewHistoryRef.current.length },
      '',
      cleanPath
    );
    setActiveView(newView);
  }, []);

  // Modal open & close helpers that integrate with the browser history stack
  const openModalWithHistory = useCallback((modalName: string) => {
    const cleanPath = typeof window !== 'undefined' ? (window.location.pathname || '/') : '/';
    window.history.pushState(
      { cicrApp: true, view: activeViewRef.current, modal: modalName, depth: viewHistoryRef.current.length },
      '',
      cleanPath
    );
  }, []);

  const closeModalWithHistory = useCallback((closeAction: () => void) => {
    closeAction();
    if (typeof window !== 'undefined' && window.history.state?.modal) {
      isProgrammaticModalCloseRef.current = true;
      window.history.back();
    }
  }, []);

  const handleOpenCart = () => {
    openModalWithHistory('cart');
    setCartModalOpen(true);
  };

  const handleCloseCart = () => {
    closeModalWithHistory(() => setCartModalOpen(false));
  };

  const handleOpenChangePassword = () => {
    openModalWithHistory('change-password');
    setChangePasswordOpen(true);
  };

  const handleCloseChangePassword = () => {
    closeModalWithHistory(() => setChangePasswordOpen(false));
  };

  const handleOpenAddItem = () => {
    setEditingItem(null);
    openModalWithHistory('add-item');
    setAddItemModalOpen(true);
  };

  const handleOpenEditItem = (item: InventoryItem) => {
    if (!isAdmin) {
      showToast('error', 'Admin Clearance Required', 'Only administrators can edit components.');
      return;
    }
    setEditingItem(item);
    setSelectedItem(null);
    openModalWithHistory('edit-item');
    setAddItemModalOpen(true);
  };

  const handleCloseAddEditItem = () => {
    closeModalWithHistory(() => {
      setAddItemModalOpen(false);
      setEditingItem(null);
    });
  };

  const handleSelectItem = (item: InventoryItem) => {
    openModalWithHistory('item-detail');
    setSelectedItem(item);
  };

  const handleCloseItemDetail = () => {
    closeModalWithHistory(() => setSelectedItem(null));
  };

  const handleOpenIssuePass = (req: BorrowRequest) => {
    openModalWithHistory('issue-pass');
    setSelectedIssuePassReq(req);
  };

  const handleCloseIssuePass = () => {
    closeModalWithHistory(() => setSelectedIssuePassReq(null));
  };

  const handleMarkNotificationRead = (id: string) => {
    setReadNotifIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem('cicr-read-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllNotificationsRead = () => {
    setReadNotifIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      try {
        localStorage.setItem('cicr-read-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = () => {
    setDismissedNotifIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      try {
        localStorage.setItem('cicr-dismissed-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications([]);
  };

  const handleDismissNotification = (id: string) => {
    setDismissedNotifIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem('cicr-dismissed-notifications', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Update profile edit state when profile changes
  useEffect(() => {
    if (profile) {
      setEditName(profile.full_name || '');
      setEditEnrollment(profile.roll_number || '');
      setEditPhone(profile.phone || '');
      if (profile.avatar_url && !profile.avatar_url.startsWith('status:')) {
        setEditAvatarUrl(profile.avatar_url);
      }
    }
  }, [profile]);

  // Unified parallel fetch for Admin Hub roster & pending requests with local storage persistence
  const syncAdminHubData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setAllMembers((curr) => {
        if (curr.length === 0) setLoadingMembers(true);
        return curr;
      });

      const [profRes, reqLogsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*').order('full_name', { ascending: true }),
        supabaseAdmin.from('activity_logs').select('*').eq('action', 'ACCOUNT_REQUEST').order('created_at', { ascending: false }).limit(100),
      ]);

      const profData = profRes.data || [];
      const reqLogs = reqLogsRes.data || [];

      // 1. Process Approved Roster Members
      const approvedMembers = profData.filter(
        (m) => m.status === 'approved' || m.role === 'admin' || m.avatar_url === 'status:approved'
      );
      setAllMembers(approvedMembers);
      try {
        localStorage.setItem('cicr-cached-members', JSON.stringify(approvedMembers));
      } catch {}

      // 2. Process Pending Signups
      const resolvedEmails = new Set(
        profData
          .filter(
            (p) =>
              p.status === 'approved' ||
              p.status === 'rejected' ||
              p.role === 'admin' ||
              p.avatar_url === 'status:approved' ||
              p.avatar_url === 'status:rejected'
          )
          .map((p) => p.email?.toLowerCase())
          .filter(Boolean)
      );

      const resolvedUserIds = new Set(
        profData
          .filter(
            (p) =>
              p.status === 'approved' ||
              p.status === 'rejected' ||
              p.role === 'admin' ||
              p.avatar_url === 'status:approved' ||
              p.avatar_url === 'status:rejected'
          )
          .map((p) => p.id)
      );

      const pendingMap = new Map();

      profData.forEach((p) => {
        const isResolved =
          p.role === 'admin' ||
          p.status === 'approved' ||
          p.status === 'rejected' ||
          p.avatar_url === 'status:approved' ||
          p.avatar_url === 'status:rejected';

        if (!isResolved) {
          const isPending =
            p.status === 'pending' ||
            p.avatar_url === 'status:pending' ||
            !p.status;

          const emailKey = p.email?.toLowerCase();
          if (isPending && emailKey && !resolvedEmails.has(emailKey)) {
            pendingMap.set(emailKey, p);
          }
        }
      });

      reqLogs.forEach((log) => {
        let details: any = {};
        try {
          details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        } catch {
          details = {};
        }
        const email = (details?.email || '').toLowerCase();
        const userId = details?.userId || log.user_id;
        const isPending = !details?.status || details?.status === 'pending';

        if (
          isPending &&
          email &&
          !resolvedEmails.has(email) &&
          (!userId || !resolvedUserIds.has(userId)) &&
          !pendingMap.has(email)
        ) {
          pendingMap.set(email, {
            id: userId || log.id,
            full_name: details?.fullName || log.user_name || 'New Member',
            email: details?.email,
            roll_number: details?.enrollmentNo || '',
            phone: details?.phone || '',
            role: details?.role || 'member',
            status: 'pending',
            created_at: log.created_at,
          });
        }
      });

      const pendingList = Array.from(pendingMap.values());
      setPendingAccounts(pendingList);
      try {
        localStorage.setItem('cicr-cached-pending-accounts', JSON.stringify(pendingList));
      } catch {}
    } catch (err) {
      console.warn('Notice syncing admin hub telemetry:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      syncAdminHubData();
    }
  }, [isAdmin, syncAdminHubData]);

  // Generate notifications: warnings are strictly visible to only admin accounts!
  useEffect(() => {
    const list: Notification[] = [];
    if (isAdmin) {
      const lowItems = items.filter((i) => isLowReserveItem(i));
      lowItems.forEach((it) => {
        const notifId = `low-${it.id}`;
        if (!dismissedNotifIds.has(notifId)) {
          list.push({
            id: notifId,
            title: `Low Reserve: ${it.name}`,
            message: `Only ${it.available_qty} units left in stock.`,
            type: 'warning',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('inventory'),
          });
        }
      });
    }

    const pendingReqs = requests.filter((r) => r.status === 'pending');
    if (isLeadOrAdmin && pendingReqs.length > 0) {
      const notifId = `pending-reqs-alert-${pendingReqs.map((r) => r.id).join('_')}`;
      if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('pending-reqs-alert')) {
        list.push({
          id: notifId,
          title: `${pendingReqs.length} Requisition(s) Pending`,
          message: 'Members have requested hardware awaiting admin authorization.',
          type: 'info',
          timestamp: 'Real-time',
          read: readNotifIds.has(notifId),
          action: () => handleNavigateView('review-requests'),
        });
      }
    }

    const returnReqs = requests.filter((r) => isReturnRequested(r));
    if (isLeadOrAdmin && returnReqs.length > 0) {
      const notifId = `pending-returns-alert-${returnReqs.map((r) => r.id).join('_')}`;
      if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('pending-returns-alert')) {
        list.push({
          id: notifId,
          title: `${returnReqs.length} Return Clearance(s) Pending`,
          message: 'Members have submitted hardware for return awaiting admin check-in.',
          type: 'warning',
          timestamp: 'Real-time',
          read: readNotifIds.has(notifId),
          action: () => handleNavigateView('review-requests'),
        });
      }
    }

    if (isAdmin && pendingAccounts.length > 0) {
      const notifId = `pending-accounts-alert-${pendingAccounts.map((a) => a.id).join('_')}`;
      if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('pending-accounts-alert')) {
        list.push({
          id: notifId,
          title: `${pendingAccounts.length} Registration(s) Pending`,
          message: 'New user account requests are awaiting admin verification in Management Hub.',
          type: 'info',
          timestamp: 'Pending Review',
          read: readNotifIds.has(notifId),
          action: () => handleNavigateView('logs'),
        });
      }
    }

    // Member-specific requisition updates
    if (user?.email) {
      const myApproved = requests.filter(
        (r) => (r.user_email?.toLowerCase() === user.email?.toLowerCase() || r.user_id === user.id) && r.status === 'approved'
      );
      if (myApproved.length > 0) {
        const notifId = `my-approved-${myApproved.map((r) => r.id).join('_')}`;
        if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('my-approved-requisitions')) {
          list.push({
            id: notifId,
            title: `${myApproved.length} Requisition(s) Cleared`,
            message: 'Admin has authorized your hardware pass. Tap to view and collect hardware.',
            type: 'success',
            timestamp: 'Authorized',
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('review-requests'),
          });
        }
      }

      const myRejected = requests.filter(
        (r) => (r.user_email?.toLowerCase() === user.email?.toLowerCase() || r.user_id === user.id) && r.status === 'rejected'
      );
      if (myRejected.length > 0) {
        const notifId = `my-rejected-${myRejected.map((r) => r.id).join('_')}`;
        if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('my-rejected-requisitions')) {
          list.push({
            id: notifId,
            title: `${myRejected.length} Requisition(s) Declined`,
            message: 'An administrator has reviewed and declined your requisition request.',
            type: 'error',
            timestamp: 'Reviewed',
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('review-requests'),
          });
        }
      }

      const myReturnPending = requests.filter(
        (r) => (r.user_email?.toLowerCase() === user.email?.toLowerCase() || r.user_id === user.id) && isReturnRequested(r)
      );
      if (myReturnPending.length > 0) {
        const notifId = `my-return-${myReturnPending.map((r) => r.id).join('_')}`;
        if (!dismissedNotifIds.has(notifId) && !dismissedNotifIds.has('my-return-pending')) {
          list.push({
            id: notifId,
            title: `${myReturnPending.length} Return Clearance(s) Pending`,
            message: 'Your hardware return request is submitted and awaiting admin inspection & approval.',
            type: 'info',
            timestamp: 'In Review',
            read: readNotifIds.has(notifId),
            action: () => handleNavigateView('review-requests'),
          });
        }
      }
    }

    setNotifications((prev) => {
      if (
        prev.length === list.length &&
        prev.every((n, i) => n.id === list[i].id && n.read === list[i].read)
      ) {
        return prev;
      }
      return list;
    });
  }, [items, requests, isLeadOrAdmin, isAdmin, user, readNotifIds, dismissedNotifIds, handleNavigateView]);

  // Cart operations
  const handleAddToCart = (item: InventoryItem) => {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      if (existing.quantity >= item.available_qty) {
        showToast('warning', 'Max Units Added', `Only ${item.available_qty} items available in vault.`);
        return;
      }
      showToast('info', 'Cart Updated', `Increased ${item.name} quantity.`);
      setCart((prev) =>
        prev.map((c) => (c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
      );
      return;
    }
    showToast('success', 'Staged in Cart', `${item.name} staged for requisition dispatch.`);
    setCart((prev) => [...prev, { item, quantity: 1 }]);
  };

  const handleUpdateCartQuantity = (itemId: string, delta: number) => {
    const existing = cart.find((c) => c.item.id === itemId);
    if (!existing) return;
    const newQty = existing.quantity + delta;
    if (newQty > existing.item.available_qty) {
      showToast('warning', 'Limit Reached', `Only ${existing.item.available_qty} units available.`);
      return;
    }
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id === itemId) {
            if (newQty <= 0) return null;
            return { ...c, quantity: newQty };
          }
          return c;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
    showToast('info', 'Item Removed', 'Component removed from request cart.');
  };

  // Requisitions & Approvals
  const handleBorrowAction = async (
    requestId: string,
    action: 'approved' | 'rejected' | 'returned',
    note?: string
  ) => {
    const res = await updateBorrowStatus(requestId, action, note);
    if (res.success) {
      showToast('success', `Requisition ${action.toUpperCase()}`, `Borrow status updated to ${action}.`);
      await refreshData();
    } else {
      showToast('error', 'Update Failed', res.error);
    }
  };

  // Member Management
  const handlePromoteRole = async (targetUserId: string, newRole: 'admin' | 'member', name: string) => {
    try {
      if (!isAdmin) {
        showToast('error', 'Unauthorized', 'Administrative privileges required.');
        return;
      }
      const targetMember = allMembers.find((m) => m.id === targetUserId);
      if (
        targetMember?.email &&
        ['vardaansaxena096@gmail.com', 'cicrinventory@gmail.com', 'cicrinventoryofficial@gmail.com'].includes(targetMember.email.toLowerCase())
      ) {
        showToast('error', 'Action Restricted', 'Master superadmin roles cannot be modified.');
        return;
      }

      setProcessingUserId(targetUserId);
      const res = await updateUserRole(targetUserId, newRole);
      if (!res.success) {
        showToast('error', 'Role Update Failed', res.error || 'Failed to update member role.');
        return;
      }

      showToast('success', 'Role Updated', `${name} is now ${newRole.toUpperCase()}.`);
      await Promise.all([syncAdminHubData(), refreshData()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not change member role.';
      showToast('error', 'Role Update Failed', msg);
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleApproveAccount = async (targetUserId: string, targetName: string, targetEmail?: string) => {
    setProcessingUserId(targetUserId);
    const res = await approveUserAccount(targetUserId, targetEmail);
    setProcessingUserId(null);
    if (res.success) {
      showToast('success', 'Account Approved', `${targetName} can now sign in.`);
      setPendingAccounts((prev) =>
        prev.filter((a) => a.id !== targetUserId && (!targetEmail || a.email?.toLowerCase() !== targetEmail.toLowerCase()))
      );
      await Promise.all([refreshData(), syncAdminHubData()]);
    } else {
      showToast('error', 'Approval Failed', res.error || 'Could not approve account');
    }
  };

  const handleRejectAccount = async (targetUserId: string, targetName: string, targetEmail?: string) => {
    setProcessingUserId(targetUserId);
    const res = await rejectUserAccount(targetUserId, targetEmail);
    setProcessingUserId(null);
    if (res.success) {
      showToast('warning', 'Request Rejected', `Account registration for ${targetName} was rejected.`);
      setPendingAccounts((prev) =>
        prev.filter((a) => a.id !== targetUserId && (!targetEmail || a.email?.toLowerCase() !== targetEmail.toLowerCase()))
      );
      await Promise.all([refreshData(), syncAdminHubData()]);
    } else {
      showToast('error', 'Rejection Failed', res.error || 'Could not reject account');
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}" from inventory?`)) {
      const res = await deleteItem(id);
      if (res.success) {
        showToast('info', 'Item Removed', `"${name}" removed from database.`);
      } else {
        showToast('error', 'Delete Failed', res.error);
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const res = await updateProfile({
      full_name: editName.trim(),
      roll_number: editEnrollment.trim(),
      phone: editPhone.trim(),
      avatar_url: editAvatarUrl || '',
    });
    setSavingProfile(false);
    if (res.success) {
      await refreshProfile();
      showToast('success', 'Profile Updated', 'Your profile details have been saved to the database.');
    } else {
      showToast('error', 'Update Failed', res.error || 'Could not update profile.');
    }
  };

  const lowReservesCount = items.filter((i) => isLowReserveItem(i)).length;
  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Member';
  const roleName = profile?.role === 'admin' ? 'ADMIN' : profile?.role === 'lead' ? 'LEAD' : 'MEMBER';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07070a] text-slate-900 dark:text-slate-100 flex flex-col relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* 1. Top Floating Header Bar */}
      <TopNavbar
        activeView={activeView}
        setActiveView={handleNavigateView}
        isAdmin={isAdmin}
        isLeadOrAdmin={isLeadOrAdmin}
        cartCount={cart.reduce((s, c) => s + c.quantity, 0)}
        onOpenCart={handleOpenCart}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onClearNotifications={handleClearNotifications}
        onDismissNotification={handleDismissNotification}
        lowReservesCount={lowReservesCount}
      />

      {/* 2. Main Workspace Body - Generous top spacing pt-24 sm:pt-28 md:pt-32 between floating navbar and hero section */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pt-24 sm:pt-28 md:pt-32 pb-36 sm:pb-44 space-y-8 animate-in fade-in duration-300">
        {/* VIEW 1: DASHBOARD */}
        {activeView === 'dashboard' && (
          <DashboardOverview
            userName={userName}
            roleName={roleName}
            setActiveView={handleNavigateView}
          />
        )}

        {/* VIEW 2: COMPONENT VAULT */}
        {activeView === 'inventory' && (
          <ComponentVaultView
            items={items}
            requests={requests}
            isAdmin={isAdmin}
            isLeadOrAdmin={isLeadOrAdmin}
            currentUserEmail={user?.email}
            currentUserId={user?.id}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onAddToCart={handleAddToCart}
            onOpenAddItem={handleOpenAddItem}
            onEditItem={handleOpenEditItem}
            onDeleteItem={handleDeleteItem}
            onSelectItem={handleSelectItem}
            cartCount={cart.reduce((s, c) => s + c.quantity, 0)}
            onOpenCart={handleOpenCart}
            loading={loading}
          />
        )}

        {/* VIEW 3: REQUISITIONS & CLEARANCE PORTAL */}
        {activeView === 'review-requests' && (
          <Suspense fallback={<div className="p-16 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <RequisitionsView
              requests={requests}
              items={items}
              isLeadOrAdmin={isLeadOrAdmin}
              userEmail={user?.email}
              userId={user?.id}
              onNavigateToVault={() => handleNavigateView('inventory')}
              onBorrowAction={handleBorrowAction}
              onOpenIssuePass={handleOpenIssuePass}
            />
          </Suspense>
        )}

        {/* VIEW 4: MANAGEMENT HUB & AUDIT LOGS */}
        {activeView === 'logs' && (
          <AdminHubView
            isAdmin={isAdmin}
            logs={logs}
            requests={requests}
            allMembers={allMembers}
            loadingMembers={loadingMembers}
            pendingAccounts={pendingAccounts}
            processingUserId={processingUserId}
            onPromoteRole={handlePromoteRole}
            onApproveAccount={handleApproveAccount}
            onRejectAccount={handleRejectAccount}
            onRefresh={async () => {
              await Promise.all([refreshData(), syncAdminHubData()]);
            }}
          />
        )}

        {/* VIEW 5: MEET THE DEVELOPERS TIMELINE */}
        {activeView === 'developers' && (
          <Suspense fallback={<div className="p-16 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <MeetTheDevelopers />
          </Suspense>
        )}

        {/* VIEW 6: OPERATOR PROFILE */}
        {activeView === 'profile' && (
          <Suspense fallback={<div className="p-16 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-600 dark:border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <OperatorProfileView
              userName={userName}
              userEmail={user?.email}
              roleName={roleName}
              editName={editName}
              setEditName={setEditName}
              editEnrollment={editEnrollment}
              setEditEnrollment={setEditEnrollment}
              editPhone={editPhone}
              setEditPhone={setEditPhone}
              editAvatarUrl={editAvatarUrl}
              setEditAvatarUrl={setEditAvatarUrl}
              savingProfile={savingProfile}
              onSaveProfile={handleSaveProfile}
              onOpenChangePassword={handleOpenChangePassword}
              onRemoveAvatar={() => setEditAvatarUrl('')}
            />
          </Suspense>
        )}
      </main>

      {/* 3. Modern Bottom Docked Navbar */}
      <BottomNavbar
        activeView={activeView}
        setActiveView={handleNavigateView}
        activeCategory={categoryFilter}
        onSelectCategory={(cat) => setCategoryFilter(cat)}
        onOpenChangePassword={handleOpenChangePassword}
        pendingAccountsCount={pendingAccounts.length}
      />

      {/* 4. Modals (Suspense-wrapped on demand) */}
      <Suspense fallback={null}>
        {cartModalOpen && (
          <RequestCartModal
            isOpen={cartModalOpen}
            onClose={handleCloseCart}
            cart={cart}
            onUpdateQuantity={handleUpdateCartQuantity}
            onRemoveItem={handleRemoveFromCart}
            onClearCart={() => setCart([])}
          />
        )}

        {changePasswordOpen && (
          <ChangePasswordModal
            isOpen={changePasswordOpen}
            onClose={handleCloseChangePassword}
          />
        )}

        {addItemModalOpen && (
          <AddEditItemModal
            isOpen={addItemModalOpen}
            onClose={handleCloseAddEditItem}
            initialItem={editingItem}
          />
        )}

        {selectedItem && (
          <ItemDetailModal
            item={selectedItem}
            isAdmin={isAdmin}
            onEdit={handleOpenEditItem}
            onClose={handleCloseItemDetail}
            onBorrow={(it) => {
              handleAddToCart(it);
              handleCloseItemDetail();
            }}
          />
        )}

        {selectedIssuePassReq && (
          <IssuePassModal
            request={selectedIssuePassReq}
            item={items.find((i) => i.id === selectedIssuePassReq?.item_id)}
            onClose={handleCloseIssuePass}
          />
        )}
      </Suspense>
    </div>
  );
};
